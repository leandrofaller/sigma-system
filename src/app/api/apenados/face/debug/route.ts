import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { join } from 'path';
import { getApenadosDir } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');

  // Proteção simples por token de URL
  if (secret !== 'owlnet_debug_123') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const targetId = searchParams.get('id');

  try {
    let apenadoId = targetId;

    if (!apenadoId) {
      const firstWithPhoto = await prisma.apenado.findFirst({
        where: { photoPath: { not: null } },
        select: { id: true, photoPath: true }
      });
      if (!firstWithPhoto) {
        return NextResponse.json({ error: 'Nenhum apenado com foto encontrado no banco.' });
      }
      apenadoId = firstWithPhoto.id;
    }

    const uploadsDir = getApenadosDir();
    const scriptPath = join(process.cwd(), 'scripts', 'advanced_face_index.py');
    const input = JSON.stringify({ ids: [apenadoId], uploads_dir: uploadsDir });

    const envPython = process.env.ARCFACE_PYTHON;
    const cmd = envPython || 'python3';

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

    const runPythonPromise = () => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
      const proc = spawn(cmd, ['-u', scriptPath], { shell: true, stdio: ['pipe', 'pipe', 'pipe'], env });
      let stdout = '';
      let stderr = '';

      proc.stdin.write(input);
      proc.stdin.end();

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        resolve({ code, stdout, stderr });
      });

      proc.on('error', (err) => {
        resolve({ code: -999, stdout: '', stderr: err.message });
      });
    });

    const result = await runPythonPromise();

    return NextResponse.json({
      success: true,
      debugInfo: {
        apenadoId,
        uploadsDir,
        scriptPath,
        cmd,
        input,
      },
      pythonResult: {
        code: result.code,
        stdout: result.stdout,
        stderr: result.stderr
      }
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
