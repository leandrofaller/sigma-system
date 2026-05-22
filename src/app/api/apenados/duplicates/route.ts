import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { getApenadoPhotoPath } from '@/lib/storage';

// Maximum Hamming distance to consider two photos as duplicates
const HAMMING_THRESHOLD = 10;
// Max photos to index per request (avoid timeout)
const INDEX_BATCH = 300;
// Concurrency for hash computation
const CONCURRENCY = 8;

function hammingDistance(a: string, b: string): number {
  let diff = BigInt('0x' + a) ^ BigInt('0x' + b);
  let n = 0;
  while (diff > 0n) { diff &= diff - 1n; n++; }
  return n;
}

async function computeDHash(filePath: string): Promise<string | null> {
  try {
    const buf = await readFile(filePath);
    const raw = await sharp(buf)
      .resize(9, 8, { fit: 'fill', kernel: 'nearest' })
      .grayscale()
      .raw()
      .toBuffer();
    let hash = 0n;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        hash = (hash << 1n) | (raw[row * 9 + col] > raw[row * 9 + col + 1] ? 1n : 0n);
      }
    }
    return hash.toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

function buildDuplicateGroups(
  records: { id: string; name: string; matricula: string | null; unidade: string | null; faccao: string | null; photoPath: string | null; photoHash: string }[],
): (typeof records[number])[][] {
  // LSH banding: 4 bands × 16 bits each
  // Two hashes with Hamming distance ≤ 10 are very likely to share at least one band
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

  // Collect candidate pairs from band collisions
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

  // Union-Find for grouping
  const idToRecord = new Map(records.map((r) => [r.id, r]));
  const parent = new Map<string, string>(records.map((r) => [r.id, r.id]));

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(x: string, y: string) {
    const rx = find(x), ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }

  for (const pair of candidatePairs) {
    const [idA, idB] = pair.split('|');
    const a = idToRecord.get(idA)!;
    const b = idToRecord.get(idB)!;
    if (hammingDistance(a.photoHash, b.photoHash) <= HAMMING_THRESHOLD) {
      union(idA, idB);
    }
  }

  // Collect groups
  const groupMap = new Map<string, typeof records>();
  for (const r of records) {
    const root = find(r.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(r);
  }

  return Array.from(groupMap.values()).filter((g) => g.length >= 2);
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = session.user as any;
  if (user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  // Step 1: find photos without a stored hash (up to INDEX_BATCH)
  const toIndex = await prisma.apenado.findMany({
    where: { photoPath: { not: null }, photoHash: null },
    select: { id: true, photoPath: true },
    take: INDEX_BATCH,
  });

  if (toIndex.length > 0) {
    const tasks = toIndex.map((a) => async () => {
      const filePath = getApenadoPhotoPath(a.photoPath!);
      const hash = await computeDHash(filePath);
      if (hash) {
        await prisma.apenado.update({ where: { id: a.id }, data: { photoHash: hash } });
      }
      return hash;
    });
    await runWithConcurrency(tasks, CONCURRENCY);
  }

  // Step 2: count remaining unindexed
  const remaining = await prisma.apenado.count({
    where: { photoPath: { not: null }, photoHash: null },
  });

  // Step 3: fetch all hashed records and detect duplicates
  const allHashed = await prisma.apenado.findMany({
    where: { photoPath: { not: null }, photoHash: { not: null } },
    select: {
      id: true,
      name: true,
      matricula: true,
      unidade: true,
      faccao: true,
      photoPath: true,
      photoHash: true,
    },
    orderBy: { name: 'asc' },
  });

  const groups = buildDuplicateGroups(allHashed as any);

  return NextResponse.json({
    groups,
    totalAnalyzed: allHashed.length,
    totalGroups: groups.length,
    remaining,
    indexedThisRun: toIndex.length,
  });
}
