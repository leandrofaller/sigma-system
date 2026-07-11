import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { warmFaceCache, awaitFaceCache } from '@/lib/face-cache';
import { pgvectorAvailable, searchByVector } from '@/lib/pgvector';

const DIM = 512;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const searchParams = req.nextUrl.searchParams;
  // threshold is sent as 0-100 integer (e.g. 72), stored as 0-1 decimal
  const threshold = Math.max(0.4, Math.min(0.99, parseFloat(searchParams.get('threshold') || '72') / 100));
  const topN = Math.min(50, Math.max(1, parseInt(searchParams.get('topN') || '20', 10)));
  const model = (searchParams.get('model') || 'buffalo') as 'buffalo' | 'antelope';

  // Get query embedding from DB
  const record = await prisma.apenado.findUnique({
    where: { id },
    select: { faceDescriptor: true, faceDescriptorAdvanced: true, name: true },
  });

  if (!record) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const descField = model === 'antelope' ? record.faceDescriptorAdvanced : record.faceDescriptor;

  if (!descField || descField === 'NONE') {
    return NextResponse.json({ similar: [], reason: 'no-face', indexed: 0 });
  }

  let queryVec: Float32Array;
  try {
    const arr: number[] = JSON.parse(descField);
    if (!Array.isArray(arr) || arr.length !== DIM) throw new Error('invalid');
    queryVec = new Float32Array(arr);
  } catch {
    return NextResponse.json({ similar: [], reason: 'invalid-descriptor', indexed: 0 });
  }

  // Tenta pgvector primeiro (índice HNSW — rápido e sem RAM)
  const pvecAvail = await pgvectorAvailable();

  if (pvecAvail) {
    const hits = await searchByVector(Array.from(queryVec), threshold, topN, id, model);
    if (hits.length === 0) return NextResponse.json({ similar: [], indexed: 0, backend: 'pgvector' });

    const matchIds = hits.map((h) => h.id);
    const records = await prisma.apenado.findMany({
      where: { id: { in: matchIds } },
      select: { id: true, name: true, matricula: true, unidade: true, photoPath: true, photoQuality: true },
    });
    const meta = new Map(records.map((r) => [r.id, r]));
    const similar = hits
      .map(({ id: hid, similarity }) => {
        const r = meta.get(hid);
        if (!r) return null;
        return { ...r, similarity: Math.round(similarity * 100) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const vectorCol = model === 'antelope' ? 'faceVectorAdvanced' : 'faceVector';
    const [{ c }] = await prisma.$queryRawUnsafe<[{ c: bigint }]>`
      SELECT COUNT(*) AS c FROM apenados WHERE "${vectorCol}" IS NOT NULL
    `;
    return NextResponse.json({ similar, indexed: Number(c), backend: 'pgvector' });
  }

  // Fallback: varredura em memória
  let cache;
  try {
    cache = await awaitFaceCache(50000);
  } catch {
    return NextResponse.json({ similar: [], reason: 'cache-unavailable', indexed: 0 });
  }
  if (!cache || cache.count === 0) {
    return NextResponse.json({ similar: [], reason: 'cache-unavailable', indexed: 0 });
  }

  const N = cache.count;
  const vecs = cache.vecs;
  const ids = cache.ids;

  // Dot-product scan (embeddings are L2-normalized → dot product = cosine similarity)
  const candidates: Array<{ id: string; sim: number }> = [];

  for (let i = 0; i < N; i++) {
    if (ids[i] === id) continue;

    const base = i * DIM;
    let dot = 0;
    for (let d = 0; d < DIM; d++) {
      dot += queryVec[d] * vecs[base + d];
    }

    if (dot >= threshold) {
      candidates.push({ id: ids[i], sim: dot });
    }

    if (i % 20000 === 19999) {
      await new Promise<void>((r) => setImmediate(r));
    }
  }

  candidates.sort((a, b) => b.sim - a.sim);
  const top = candidates.slice(0, topN);

  if (top.length === 0) return NextResponse.json({ similar: [], indexed: N, backend: 'memory' });

  const matchIds = top.map((c) => c.id);
  const records = await prisma.apenado.findMany({
    where: { id: { in: matchIds } },
    select: { id: true, name: true, matricula: true, unidade: true, photoPath: true, photoQuality: true },
  });

  const meta = new Map(records.map((r) => [r.id, r]));
  const similar = top
    .map((c) => {
      const r = meta.get(c.id);
      if (!r) return null;
      return { ...r, similarity: Math.round(c.sim * 100) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return NextResponse.json({ similar, indexed: N, backend: 'memory' });
}
