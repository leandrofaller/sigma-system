import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { calcularIIP } from '@/lib/iip';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';

  // Se for operador, filtra por grupo do usuário, senão retorna todos
  const relatorios = await prisma.relatorioForcaTarefa.findMany({
    where: isAdmin ? {} : { groupId: user.groupId ?? null },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { id: true, name: true, role: true } },
      group: true,
    },
  });

  return NextResponse.json(relatorios);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();

  if (!body.forcaTarefa || !body.periodoInicio || !body.periodoFim) {
    return NextResponse.json({ error: 'Campos obrigatórios ausentes' }, { status: 400 });
  }

  // Motor de cálculo do IIP
  const iipFactorsSelected = body.iipFactors || [];
  const iipCalculado = calcularIIP(iipFactorsSelected);

  const relatorio = await prisma.$transaction(async (tx) => {
    const counterCfg = await tx.systemConfig.findUnique({
      where: { key: 'forca_tarefa_counter' }
    });
    const current = (counterCfg?.value as any) || { next: 1 };
    const nextNum = current.next || 1;
    const year = new Date().getFullYear();
    const formattedNumber = `RFT Nº ${String(nextNum).padStart(5, '0')}/${year}/AIP/SEJUS/RO`;

    if (counterCfg) {
      await tx.systemConfig.update({
        where: { id: counterCfg.id },
        data: { value: { next: nextNum + 1 } }
      });
    } else {
      await tx.systemConfig.create({
        data: { key: 'forca_tarefa_counter', value: { next: nextNum + 1 } }
      });
    }

    return tx.relatorioForcaTarefa.create({
      data: {
        number: formattedNumber,
        date: body.date ? new Date(body.date) : new Date(),
        periodoInicio: new Date(body.periodoInicio),
        periodoFim: new Date(body.periodoFim),
        forcaTarefa: body.forcaTarefa,
        status: body.status || 'DRAFT',
        content: body.content || {},
        authorId: user.id,
        groupId: body.groupId || user.groupId || '',

        // Integração IIP & RIP
        iipScore: iipCalculado.score,
        iipLevel: iipCalculado.level,
        ripStatus: body.ripStatus || 'PENDENTE',
        iipFactors: iipFactorsSelected,
        municipio: body.municipio || 'Porto Velho',
        faccoes: body.faccoes || [],
        alertaAtivo: iipCalculado.alertaAtivo,
        alertaResolvido: false,
      },
      include: {
        author: { select: { id: true, name: true } },
        group: true,
      },
    });
  });

  await createAuditLog({
    userId: user.id,
    action: relatorio.status === 'PUBLISHED' ? AUDIT_ACTIONS.PUBLISH_RFT : AUDIT_ACTIONS.CREATE_RFT,
    entity: 'RelatorioForcaTarefa',
    entityId: relatorio.id,
    details: { number: relatorio.number, forcaTarefa: relatorio.forcaTarefa, status: relatorio.status, iipScore: relatorio.iipScore },
    request: req,
  });

  return NextResponse.json(relatorio, { status: 201 });
}
