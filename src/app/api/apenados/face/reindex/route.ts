import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invalidateAdvancedFaceCache } from '@/lib/advanced-face-cache';
import { invalidateFaceCache } from '@/lib/face-cache';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user.role === 'SUPER_ADMIN' || user.role === 'ADMIN';
  if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  try {
    const body = await req.json().catch(() => ({}));
    const { id, ids, type } = body;

    if (!type || (type !== 'classic' && type !== 'advanced')) {
      return NextResponse.json({ error: 'Tipo de indexação inválido' }, { status: 400 });
    }

    const updateData = type === 'classic'
      ? { faceDescriptor: null }
      : {
          faceDescriptorAdvanced: null,
          advancedDetScore: null,
          advancedQualityScore: null,
          advancedLivenessScore: null,
        };

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Reprocessa lote de ids selecionados
      const result = await prisma.apenado.updateMany({
        where: {
          id: { in: ids },
          ...(type === 'classic' ? { faceDescriptor: 'NONE' } : { faceDescriptorAdvanced: 'NONE' }),
        },
        data: updateData,
      });

      if (type === 'classic') invalidateFaceCache();
      else invalidateAdvancedFaceCache();

      return NextResponse.json({ success: true, count: result.count, message: `${result.count} registros liberados` });
    } else if (id) {
      // Reprocessa individualmente
      await prisma.apenado.update({
        where: { id },
        data: updateData,
      });

      if (type === 'classic') invalidateFaceCache();
      else invalidateAdvancedFaceCache();

      return NextResponse.json({ success: true, message: 'Registro liberado para reindexação' });
    } else {
      // Reprocessa todos os que estão marcados como 'NONE'
      const result = await prisma.apenado.updateMany({
        where: type === 'classic' ? { faceDescriptor: 'NONE' } : { faceDescriptorAdvanced: 'NONE' },
        data: updateData,
      });

      if (type === 'classic') invalidateFaceCache();
      else invalidateAdvancedFaceCache();

      return NextResponse.json({ success: true, count: result.count, message: `${result.count} registros liberados` });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao reindexar registros' }, { status: 500 });
  }
}
