import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getApenadosDir, getApenadoPhotoPath } from '@/lib/storage';
import { spawn } from 'child_process';
import { join } from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  if (!isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const report: any = {
    timestamp: new Date().toISOString(),
    uploadsDir: getApenadosDir(),
    envVariables: {
      UPLOAD_DIR: process.env.UPLOAD_DIR || 'não definida',
      ARCFACE_PYTHON: process.env.ARCFACE_PYTHON || 'não definida',
      NODE_ENV: process.env.NODE_ENV || 'não definida',
    },
    directoryStatus: {},
    pythonStatus: {},
    testExecution: {},
  };

  // 1. Diagnóstico de Diretório e Arquivos
  try {
    const dir = getApenadosDir();
    const dirExists = existsSync(dir);
    report.directoryStatus.exists = dirExists;

    if (dirExists) {
      const stats = await fs.stat(dir);
      report.directoryStatus.permissions = stats.mode.toString(8);
      
      const files = await fs.readdir(dir);
      report.directoryStatus.totalFiles = files.length;
      
      // Amostra de 10 nomes de arquivos para verificação de padrões
      report.directoryStatus.sampleFiles = files.slice(0, 10);
      
      // Tamanho total do diretório (aproximado rápido)
      let totalSize = 0;
      const sampleStats = await Promise.all(
        files.slice(0, 100).map(async (f) => {
          try {
            const s = await fs.stat(join(dir, f));
            totalSize += s.size;
            return s.size;
          } catch {
            return 0;
          }
        })
      );
      report.directoryStatus.estimatedSizeMB = Math.round((totalSize / (1024 * 1024)) * (files.length / 100));
    }
  } catch (err: any) {
    report.directoryStatus.error = err.message;
  }

  // 2. Diagnóstico de Executáveis Python
  const pythonPath = process.env.ARCFACE_PYTHON;
  const candidates = pythonPath ? [pythonPath] : ['python3', 'python', 'py'];
  report.pythonStatus.configuredPath = pythonPath || 'não configurado (.env)';
  report.pythonStatus.candidatesChecked = candidates;

  const pythonChecks = await Promise.all(
    candidates.map(async (cmd) => {
      return new Promise<any>((resolve) => {
        const proc = spawn(cmd, ['--version']);
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        
        proc.on('close', (code) => {
          resolve({
            cmd,
            available: code === 0 || stdout.trim().length > 0 || stderr.trim().length > 0,
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: code,
          });
        });
        
        proc.on('error', (err) => {
          resolve({
            cmd,
            available: false,
            error: err.message,
          });
        });
      });
    })
  );
  report.pythonStatus.checks = pythonChecks;

  // 3. Execução de Teste do Python avançado com um Apenado real do Banco
  try {
    // Busca um apenado que possua faceDescriptor básico válido (a foto existia)
    // mas que no avançado deu NONE (ou seja, falhou no processamento avançado)
    const testApenado = await prisma.apenado.findFirst({
      where: {
        faceDescriptor: { not: null, notIn: ['NONE'] },
        faceDescriptorAdvanced: 'NONE',
        photoPath: { not: null },
      },
      select: { id: true, name: true, photoPath: true },
    });

    if (testApenado) {
      report.testExecution.apenado = testApenado;
      const fullPhotoPath = getApenadoPhotoPath(testApenado.photoPath!);
      const photoExists = existsSync(fullPhotoPath);
      report.testExecution.photoExists = photoExists;

      if (photoExists) {
        // Tenta rodar o script python avançado apenas para este apenado
        const scriptPath = join(process.cwd(), 'scripts', 'advanced_face_index.py');
        const inputData = JSON.stringify({
          ids: [testApenado.id],
          uploads_dir: getApenadosDir(),
        });

        // Usa o primeiro executável Python funcional detectado
        const workingPython = pythonChecks.find((c) => c.available)?.cmd || 'python3';
        report.testExecution.pythonUsed = workingPython;

        const result = await new Promise<any>((resolve) => {
          const env = {
            ...process.env,
            HOME: '/tmp',
            MPLCONFIGDIR: '/tmp/.matplotlib',
            MPLBACKEND: 'Agg',
            ORT_LOGGING_LEVEL: '3',
            PYTHONWARNINGS: 'ignore',
            TQDM_DISABLE: '1',
          };
          const proc = spawn(workingPython, ['-u', scriptPath], { env });
          let stdout = '';
          let stderr = '';

          proc.stdin.write(inputData);
          proc.stdin.end();

          proc.stdout.on('data', (d) => { stdout += d.toString(); });
          proc.stderr.on('data', (d) => { stderr += d.toString(); });

          proc.on('close', (code) => {
            resolve({
              exitCode: code,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
            });
          });

          proc.on('error', (err) => {
            resolve({
              error: err.message,
            });
          });
        });

        report.testExecution.runResult = result;
      } else {
        report.testExecution.reason = `Arquivo físico da foto não encontrado em: ${fullPhotoPath}`;
      }
    } else {
      report.testExecution.reason = 'Nenhum apenado adequado encontrado no banco de dados para o teste.';
    }
  } catch (err: any) {
    report.testExecution.error = err.message;
  }

  return NextResponse.json(report);
}
