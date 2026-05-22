import { readdir } from 'fs/promises';
import { createReadStream } from 'fs';
import { join, extname, basename } from 'path';
import crypto from 'crypto';

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const CONCURRENCY = 8;

export interface ExactDupResult {
  groups: string[][];
  totalFiles: number;
  totalGroups: number;
  errors: string[];
}

export interface ExactDupState {
  isRunning: boolean;
  current: number;
  total: number;
  result: ExactDupResult | null;
  error: string;
}

let state: ExactDupState = {
  isRunning: false,
  current: 0,
  total: 0,
  result: null,
  error: '',
};

export function getExactDupState(): ExactDupState {
  return state;
}

export function startExactDupJob(uploadsDir: string): void {
  if (state.isRunning) return;
  state = { isRunning: true, current: 0, total: 0, result: null, error: '' };
  runJob(uploadsDir).catch((err) => {
    state = { ...state, isRunning: false, error: err?.message ?? 'Erro desconhecido' };
  });
}

function sha256Stream(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = createReadStream(filepath);
    s.on('data', (d) => h.update(d));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

async function runJob(uploadsDir: string): Promise<void> {
  let files: string[];
  try {
    const entries = await readdir(uploadsDir);
    files = entries.filter((f) => EXTENSIONS.has(extname(f).toLowerCase()));
  } catch {
    state = { isRunning: false, current: 0, total: 0, result: { groups: [], totalFiles: 0, totalGroups: 0, errors: [] }, error: '' };
    return;
  }

  state = { ...state, total: files.length, current: 0 };

  const hashMap = new Map<string, string[]>();
  const errors: string[] = [];
  let processed = 0;

  // Process with bounded concurrency
  let idx = 0;
  async function worker() {
    while (idx < files.length) {
      const i = idx++;
      const filename = files[i];
      const apenadoId = basename(filename, extname(filename));
      const filepath = join(uploadsDir, filename);
      try {
        const h = await sha256Stream(filepath);
        const arr = hashMap.get(h) ?? [];
        arr.push(apenadoId);
        hashMap.set(h, arr);
      } catch (e: any) {
        errors.push(`${filename}: ${e.message}`);
      }
      processed++;
      // Update progress every 500 files to avoid too many state object allocations
      if (processed % 500 === 0) {
        state = { ...state, current: processed };
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const groups = Array.from(hashMap.values()).filter((ids) => ids.length >= 2);
  state = {
    isRunning: false,
    current: files.length,
    total: files.length,
    error: '',
    result: { groups, totalFiles: files.length, totalGroups: groups.length, errors },
  };
}
