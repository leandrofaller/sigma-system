import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { spawn } from 'child_process';
import { join } from 'path';
import { getApenadosDir } from '@/lib/storage';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const targetId = req.nextUrl.searchParams.get('id');

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
    const scriptPath = join(process.cwd(), 'scripts', 'arcface_index.py');
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
      const proc = spawn(cmd, ['-u', scriptPath], { stdio: ['pipe', 'pipe', 'pipe'], env });
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
      apenadoId,
      exitCode: result.code,
      stdout: result.stdout,
    });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
