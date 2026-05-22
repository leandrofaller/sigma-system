import { google } from 'googleapis';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs/promises';

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

export async function uploadToDrive(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  folderId?: string
): Promise<string> {
  const drive = getDriveClient();
  const targetFolder = folderId ?? process.env.GOOGLE_DRIVE_FOLDER_ID;

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: targetFolder ? [targetFolder] : undefined,
    },
    media: {
      mimeType,
      body: Readable.from(fileBuffer),
    },
    fields: 'id',
  });

  return response.data.id!;
}

export async function downloadFromDrive(fileId: string): Promise<Buffer> {
  const drive = getDriveClient();
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' }
  );
  return Buffer.from(response.data as ArrayBuffer);
}

export async function deleteFromDrive(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}

export async function saveLocalFile(
  fileBuffer: Buffer,
  filename: string
): Promise<string> {
  const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  await fs.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, filename);
  await fs.writeFile(filePath, fileBuffer);
  return filePath;
}

export async function getLocalFile(filePath: string): Promise<Buffer> {
  return fs.readFile(filePath);
}

export async function deleteLocalFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore if file doesn't exist
  }
}

export function isDriveEnabled(): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  );
}

export function getApenadosDir(): string {
  const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  return path.join(baseDir, 'apenados');
}

export function getApenadoPhotoPath(photoPath: string): string {
  const baseDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
  const relativePath = photoPath.startsWith('uploads/')
    ? photoPath.substring(8)
    : photoPath;
  return path.join(baseDir, relativePath);
}

let _diskCache: { bytes: number; at: number } = { bytes: 0, at: 0 };
const DISK_TTL = 5 * 60 * 1000;

export async function getApenadosDiskUsage(): Promise<number> {
  if (Date.now() - _diskCache.at < DISK_TTL) return _diskCache.bytes;
  const dir = getApenadosDir();
  let bytes = 0;
  try {
    await fs.access(dir);
    if (process.platform !== 'win32') {
      const { execSync } = await import('child_process');
      const out = execSync(`du -sb "${dir}"`, { timeout: 10_000 }).toString();
      bytes = parseInt(out.split('\t')[0], 10) || 0;
    } else {
      bytes = await scanDirSize(dir);
    }
  } catch {}
  _diskCache = { bytes, at: Date.now() };
  return bytes;
}

async function scanDirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(entries.map(async (e) => {
      const full = path.join(dir, e.name);
      if (e.isFile()) {
        const s = await fs.stat(full);
        total += s.size;
      } else if (e.isDirectory()) {
        total += await scanDirSize(full);
      }
    }));
  } catch {}
  return total;
}

