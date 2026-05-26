import { prisma } from './db';

const HAMMING_THRESHOLD = 10;

export interface SimilarRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoQuality: number | null;
}

export interface SimilarDupJobState {
  isRunning: boolean;
  totalAnalyzed: number;
  totalGroups: number;
  groups: SimilarRecord[][];
  error: string;
}

let state: SimilarDupJobState = {
  isRunning: false,
  totalAnalyzed: 0,
  totalGroups: 0,
  groups: [],
  error: '',
};

export function getSimilarDupState(): SimilarDupJobState {
  return state;
}

export function startSimilarDupJob(): void {
  if (state.isRunning) return;
  state = { isRunning: true, totalAnalyzed: 0, totalGroups: 0, groups: [], error: '' };
  runJob().catch((err) => {
    state = { ...state, isRunning: false, error: err?.message ?? 'Erro desconhecido' };
  });
}

function hammingDistance(a: string, b: string): number {
  try {
    let diff = BigInt('0x' + a) ^ BigInt('0x' + b);
    let n = 0;
    while (diff > 0n) { diff &= diff - 1n; n++; }
    return n;
  } catch {
    return 64; // hash inválido → não é duplicata
  }
}

interface RawRecord {
  id: string;
  name: string;
  matricula: string | null;
  unidade: string | null;
  faccao: string | null;
  photoPath: string | null;
  photoHash: string;
  photoQuality: number | null;
}

function buildGroups(records: RawRecord[]): SimilarRecord[][] {
  // LSH banding: 4 bands × 16 bits — capta pares com Hamming ≤ 10
  const bandMaps: Map<string, string[]>[] = [new Map(), new Map(), new Map(), new Map()];

  for (const r of records) {
    if (!r.photoHash || r.photoHash.length !== 16) continue;
    try {
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
    } catch {
      // hash corrompido — pula
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
    const a = idToRecord.get(idA);
    const b = idToRecord.get(idB);
    if (!a || !b) continue;
    if (hammingDistance(a.photoHash, b.photoHash) <= HAMMING_THRESHOLD) {
      const ra = find(idA), rb = find(idB);
      if (ra !== rb) parent.set(ra, rb);
    }
  }

  const groupMap = new Map<string, RawRecord[]>();
  for (const r of records) {
    const root = find(r.id);
    if (!groupMap.has(root)) groupMap.set(root, []);
    groupMap.get(root)!.push(r);
  }

  return Array.from(groupMap.values())
    .filter((g) => g.length >= 2)
    // Melhor qualidade primeiro — isKeeper = índice 0
    .map((g) =>
      g
        .sort((a, b) => (b.photoQuality ?? 0) - (a.photoQuality ?? 0))
        .map(({ photoHash: _h, ...rest }) => rest),
    );
}

async function runJob(): Promise<void> {
  // Usa apenas photoHash para checar indexação — photoQuality é opcional
  const unindexed = await prisma.apenado.count({
    where: { photoPath: { not: null }, photoHash: null },
  });

  if (unindexed > 0) {
    state = {
      ...state,
      isRunning: false,
      error: `${unindexed} fotos sem índice. Execute a indexação em background primeiro.`,
    };
    return;
  }

  // $queryRaw exclui faceDescriptor TEXT de 143k registros
  const records = await prisma.$queryRaw<RawRecord[]>`
    SELECT id, name, matricula, unidade, faccao, "photoPath", "photoHash",
           "photoQuality"
    FROM apenados
    WHERE "photoPath" IS NOT NULL
      AND "photoHash" IS NOT NULL
    ORDER BY name ASC
  `;

  const groups = buildGroups(records);

  state = {
    isRunning: false,
    totalAnalyzed: records.length,
    totalGroups: groups.length,
    groups,
    error: '',
  };
}
