import { spawn } from 'child_process';
import { join } from 'path';

export interface IndexResult {
  id?: string;
  embedding?: number[];
  det_score?: number;
  no_face?: boolean;
  no_photo?: boolean;
  error?: string;
  install?: string;
  done?: boolean;
}

export function runIndexBatch(ids: string[], uploadsDir: string): Promise<IndexResult[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'arcface_index.py');
    const input = JSON.stringify({ ids, uploads_dir: uploadsDir });
    const envPython = process.env.ARCFACE_PYTHON;
    const candidates = envPython ? [envPython] : ['python3', 'python', 'py'];
    let idx = 0;

    function tryNext() {
      if (idx >= candidates.length) {
        reject(new Error('Python não encontrado. Defina ARCFACE_PYTHON=/opt/arcface-venv/bin/python3 no .env'));
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
      };
      const proc = spawn(cmd, ['-u', scriptPath], { shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });

      let buffer = '';
      let stderr = '';
      const results: IndexResult[] = [];

      proc.stdin.write(input);
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
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
