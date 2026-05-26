import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

const HAMMING_THRESHOLD = 10;

function hammingDistance(a: string, b: string): number {
  let diff = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (diff > 0n) { diff &= diff - 1n; n++; }
  return n;
}

interface HashedRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoHash: string;
  photoQuality: number | null;
}

function buildDuplicateGroups(records: HashedRecord[]): HashedRecord[][] {
  // LSH banding: 4 bands × 16 bits — capta pares com Hamming ≤ 10
  const bandMaps: Map<string, string[]>[] = [new Map(), new Map(), new Map(), new Map()];

  for (const r of records) {
    const n = BigInt('0x' + r.photoHash);
    const bands = [
      ((n >> 48n) & 0xFFFFn).toString(16).padStart(4, '0'),
      ((n >> 32n) & 0xFFFFn).toString(16).padStart(4, '0'),
      ((n >> 16n) & 0xFFFFn).toString(16).padStart(4, '0'),
      (n & 0xFFFFn).toString(16).padStart(4, '0'),
    ];
    for (let b = 0; b < 4; b++) {
      const key = b + ':' + bands[b];
      if (!bandMaps[b].has(key)) bandMaps[b].set(key, []);
      bandMaps[b].get(key)!.push(r.id);
    }
  }

  const candidatePairs = new Set<string>();
  for (const bm of bandMaps) {
    for (const ids of bm.values()) {
      if (ids.length < 2) continue;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i] < ids[j] ? ids[i] : ids[j];
          const b = ids[i] < ids[j] ? ids[j] : ids[i];
          candidatePairs.add(a + '|' + b);
        }
      }
    }
  }

  const idToRecord = new Map(records.map((r) => [r.id, r]));
  const parent = new Map<string, string>(records.map((r) => [r.id, r.id]));

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  for (const pair of candidatePairs) {
    const [idA, idB] = pair.split('|');
    const a = idToRecord.get(idA)!;
    const b = idToRecord.get(idB)!;
    if (hammingDistance(a.photoHash, b.photoHash) <= HAMMING_THRESHOLD) {
      const ra = find(idA), rb = find(idB);
      if (ra !== rb) parent.set(ra, rb);
    }
  }

  const groupMap = new Map<string, HashedRecord[]>();
  for (const r of records) {
    const root = find(r.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(r);
  }

  return Array.from(groupMap.values())
    .filter((g) => g.length >= 2)
    // Melhor qualidade primeiro dentro de cada grupo
    .map((g) => g.sort((a, b) => (b.photoQuality ?? 0) - (a.photoQuality ?? 0)));
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Verificar se há fotos sem índice de hash ou qualidade
  const unindexed = await prisma.apenado.count({
    where: {
      photoPath: { not: null },
      OR: [{ photoHash: null }, { photoQuality: null }],
    },
  });

  if (unindexed > 0) {
    return NextResponse.json({ needsIndexing: true, unindexed });
  }

  // Query otimizada: $queryRaw exclui faceDescriptor TEXT (campo pesado) de 143k registros
  const allHashed = await prisma.$queryRaw<HashedRecord[]>`
    SELECT id, name, matricula, unidade, faccao, "photoPath", "photoHash", "photoQuality"
    FROM apenados
    WHERE "photoPath" IS NOT NULL
      AND "photoHash" IS NOT NULL
    ORDER BY name ASC
  `;

  const groups = buildDuplicateGroups(allHashed);

  return NextResponse.json({
    groups,
    totalAnalyzed: allHashed.length,
    totalGroups: groups.length,
    needsIndexing: false,
    unindexed: 0,
  });
}
