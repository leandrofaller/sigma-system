import { spawn } from 'child_process';
import { join } from 'path';

export interface AdvancedIndexResult {
  id?: string;
  embedding?: number[];
  det_score?: number;
  liveness_score?: number;
  quality_score?: number;
  no_face?: boolean;
  no_photo?: boolean;
  error?: string;
  install?: string;
  done?: boolean;
}

export function runAdvancedIndexBatch(ids: string[], uploadsDir: string): Promise<AdvancedIndexResult[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'advanced_face_index.py');
    const input = JSON.stringify({ ids, uploads_dir: uploadsDir });
    const envPython = process.env.ARCFACE_PYTHON;
    const candidates = envPython ? [envPython] : ['python3', 'python', 'py'];
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        reject(new Error('Python não encontrado. Defina ARCFACE_PYTHON no .env'));
        return;
      }
      const cmd = candidates[idx++];
      const env = {
        ...process.env,
        HOME: '/tmp',
        MPLCONFIGDIR: '/tmp/.matplotlib',
        MPLBACKEND: 'Agg',
        ORT_LOGGING_LEVEL: '3',
        PYTHONWARNINGS: 'ignore',
        TQDM_DISABLE: '1',
        OMP_NUM_THREADS: '1',
        MKL_NUM_THREADS: '1',
        OPENBLAS_NUM_THREADS: '1',
        VECLIB_MAXIMUM_THREADS: '1',
        NUMEXPR_NUM_THREADS: '1',
        ONNXRUNTIME_NUM_THREADS: '1',
      };
      const proc = spawn(cmd, ['-u', scriptPath], { shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });

      let buffer = '';
      let stderr = '';
      const results: AdvancedIndexResult[] = [];

      proc.stdin.write(input);
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString().replace(/\x00/g, '');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try { results.push(JSON.parse(trimmed)); } catch {}
        }
      });

      proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (buffer.trim()) {
          try { results.push(JSON.parse(buffer.trim())); } catch {}
        }
        const firstResult = results[0];
        if (firstResult?.error && firstResult?.install) {
          reject(new Error(firstResult.error));
          return;
        }
        if (code !== 0 && results.length === 0) {
          tryNext();
        } else {
          resolve(results);
        }
      });

      proc.on('error', () => tryNext());
    }

    tryNext();
  });
}
