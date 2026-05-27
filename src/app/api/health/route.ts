import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getApenadosDir } from '@/lib/storage';
import fs from 'fs';
import path from 'path';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const diagnostics: any = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      NODE_ENV: process.env.NODE_ENV || null,
    },
  };

  // Check DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    diagnostics.database = 'connected';
  } catch (err: any) {
    diagnostics.database = `error: ${err.message}`;
    diagnostics.status = 'error';
  }

  // Check upload directory
  try {
    const apenadosDir = getApenadosDir();
    diagnostics.apenadosDir = {
      exists: fs.existsSync(apenadosDir),
    };

    if (diagnostics.apenadosDir.exists) {
      const files = fs.readdirSync(apenadosDir);
      diagnostics.apenadosDir.fileCount = files.length;

      // Check write permission
      const testFile = path.join(apenadosDir, '.write-test-health');
      try {
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        diagnostics.apenadosDir.writePermission = 'ok';
      } catch (writeErr: any) {
        diagnostics.apenadosDir.writePermission = `error: ${writeErr.message}`;
      }
    }
  } catch (err: any) {
    diagnostics.apenadosDir = { error: err.message };
  }

  const statusCode = diagnostics.status === 'ok' ? 200 : 503;
  return NextResponse.json(diagnostics, { status: statusCode });
}
