import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Regiões faciais aproximadas no espaço do descriptor de 128 dims
// (mapeamento heurístico — cada segmento captura aspectos diferentes do rosto)
const TRAIT_REGIONS = [
  { name: 'Olhos',        start: 0,   end: 26 },
  { name: 'Sobrancelhas', start: 26,  end: 51 },
  { name: 'Nariz',        start: 51,  end: 77 },
  { name: 'Boca',         start: 77,  end: 103 },
  { name: 'Contorno',     start: 103, end: 128 },
];

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, ai, i) => s + (ai - b[i]) ** 2, 0));
}

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, ai, i) => s + ai * b[i], 0);
  const ma = Math.sqrt(a.reduce((s, ai) => s + ai * ai, 0));
  const mb = Math.sqrt(b.reduce((s, bi) => s + bi * bi, 0));
  if (ma === 0 || mb === 0) return 0;
  return dot / (ma * mb);
}

function overallSimilarity(dist: number): number {
  // Euclidean distance no espaço face-api: mesma pessoa < 0.6, diferente > 1.0
  return Math.max(0, Math.min(100, Math.round((1 - dist / 1.4) * 100)));
}

function traitSimilarities(a: number[], b: number[]): { name: string; similarity: number }[] {
  return TRAIT_REGIONS.map(({ name, start, end }) => {
    const sim = (cosine(a.slice(start, end), b.slice(start, end)) + 1) / 2;
    return { name, similarity: Math.round(sim * 100) };
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { descriptor, topN = 20, minSimilarity = 0 } = await req.json();
  if (!Array.isArray(descriptor) || descriptor.length !== 128) {
    return NextResponse.json({ error: 'Descriptor facial inválido (esperado: array[128])' }, { status: 400 });
  }

  const all = await prisma.apenado.findMany({
    where: { faceDescriptor: { not: null } },
    select: {
      id: true,
      name: true,
      matricula: true,
      unidade: true,
      faccao: true,
      photoPath: true,
      faceDescriptor: true,
    },
  });

  const results = all
    .map((a) => {
      const stored: number[] = JSON.parse(a.faceDescriptor!);
      const distance = euclidean(descriptor, stored);
      const similarity = overallSimilarity(distance);
      const traits = traitSimilarities(descriptor, stored);
      const { faceDescriptor: _, ...rest } = a;
      return { ...rest, distance, similarity, traits };
    })
    .filter((r) => r.similarity >= minSimilarity)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, topN);

  return NextResponse.json({ matches: results, indexed: all.length });
}
