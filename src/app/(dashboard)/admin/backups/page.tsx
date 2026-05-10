import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { BackupPanel } from '@/components/admin/BackupPanel';

function getBackups() {
  const dir = join(process.env.UPLOAD_DIR || '/app/uploads', 'backups');
  try {
    mkdirSync(dir, { recursive: true });
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => {
        const stat = statSync(join(dir, f));
        return { name: f, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

export default async function BackupsPage() {
  const session = await auth();
  const user = session!.user as any;
  if (user.role !== 'SUPER_ADMIN') redirect('/dashboard');

  const backups = getBackups();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-title">Backups</h1>
        <p className="text-body text-sm mt-1">
          {backups.length > 0
            ? `${backups.length} backup${backups.length !== 1 ? 's' : ''} disponível${backups.length !== 1 ? 'is' : ''}`
            : 'Gerencie backups completos do banco de dados'}
        </p>
      </div>
      <BackupPanel initialBackups={backups} />
    </div>
  );
}
