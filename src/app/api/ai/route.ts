import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { queryAI, getAIProviderInfo } from '@/lib/ai';
import { createAuditLog, AUDIT_ACTIONS } from '@/lib/audit';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const info = await getAIProviderInfo();

  // Verifica a configuração global de geolocalização
  const geoConfig = await prisma.systemConfig.findUnique({ where: { key: 'geolocation_enabled' } });
  const geolocationEnabled = (geoConfig?.value as any)?.enabled !== false;

  // Verifica se o usuário atual é Superadmin
  const isSuperAdmin = (session.user as any)?.role === 'SUPER_ADMIN';

  return NextResponse.json({
    ...info,
    geolocationEnabled,
    isSuperAdmin,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const body = await req.json();

  if (!body.query?.trim()) {
    return NextResponse.json({ error: 'Consulta vazia' }, { status: 400 });
  }

  let response: string;
  try {
    response = await queryAI(user.id, body.query, body.context);
  } catch (err: any) {
    const msg = err?.message || String(err);
    // Surface API errors directly so the user knows what went wrong
    return NextResponse.json(
      { response: `Erro ao consultar IA: ${msg}` },
      { status: 200 }
    );
  }

  await createAuditLog({
    userId: user.id,
    action: AUDIT_ACTIONS.AI_QUERY,
    details: { queryLength: body.query.length },
    request: req,
  });

  return NextResponse.json({ response });
}
