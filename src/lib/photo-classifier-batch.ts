import { spawn } from 'child_process';
import { join } from 'path';

export type PhotoCategory =
  | 'FACE_OK'
  | 'FACE_MISSED'
  | 'DOCUMENT'
  | 'TATTOO'
  | 'BODY'
  | 'NO_FACE';

export interface ClassifyResult {
  id?: string;
  category?: PhotoCategory;
  confidence?: number;
  reason?: string;
  has_face?: boolean;
  det_score?: number | null;
  ocr_text?: string | null;
  error?: string;
  install?: string;
  done?: boolean;
}

export function runClassifyBatch(
  ids: string[],
  uploadsDir: string,
  photoPaths?: Record<string, string>,
  complementHints?: Record<string, string>,
): Promise<ClassifyResult[]> {
  return new Promise((resolve, reject) => {
    const scriptPath = join(process.cwd(), 'scripts', 'photo_classifier.py');
    const input = JSON.stringify({
      ids,
      uploads_dir: uploadsDir,
      photo_paths: photoPaths,
      complement_hints: complementHints,
    });

    const envPython = process.env.ARCFACE_PYTHON;
    const localVenv =
      process.platform === 'win32'
        ? join(process.cwd(), 'backend', '.venv', 'Scripts', 'python.exe')
        : join(process.cwd(), 'backend', '.venv', 'bin', 'python');

    const candidates = envPython
      ? [envPython, localVenv, 'python3', 'python', 'py']
      : [localVenv, 'python3', 'python', 'py'];
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
        PYTHONPATH: join(process.cwd(), 'scripts'),
      };

      const proc = spawn(cmd, ['-u', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], env });

      let buffer = '';
      const results: ClassifyResult[] = [];

      proc.stdin.write(input);
      proc.stdin.end();

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString().replace(/\x00/g, '');
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            results.push(JSON.parse(trimmed));
          } catch {
            /* ignore */
          }
        }
      });

      proc.on('close', (code) => {
        if (buffer.trim()) {
          try {
            results.push(JSON.parse(buffer.trim()));
          } catch {
            /* ignore */
          }
        }
        const first = results[0];
        if (first?.error && first?.install) {
          reject(new Error(first.error));
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