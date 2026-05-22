import { spawn } from 'child_process';
import { join } from 'path';

export interface AuditResult {
  id?: string;
  faces?: number;
  det_score?: number;
  ocr_text?: string;
  ocr_name?: string;
  no_photo?: boolean;
  error?: string;
  done?: boolean;
}

export function runAuditBatch(ids: string[], uploadsDir: string): Promise<AuditResult[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'photo_audit.py');
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
      const results: AuditResult[] = [];

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
