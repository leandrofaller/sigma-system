import { prisma } from './db';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';

const BACKUP_DIR = path.join(process.env.UPLOAD_DIR || '/app/uploads', 'backups');
const INDEX_FILE = path.join(BACKUP_DIR, 'cloud_index.json');

export type CloudProvider = 'none' | 'google_drive' | 'onedrive';

export interface CloudConfig {
  provider: CloudProvider;
  googleDrive?: { folderId?: string };
  onedrive?: {
    tenantId: string;
    clientId: string;
    clientSecret: string;
    driveId?: string;
    folderId?: string;
  };
}

export interface CloudEntry {
  cloudId: string;
  provider: CloudProvider;
  uploadedAt: string;
}

export async function getCloudConfig(): Promise<CloudConfig> {
  try {
    const cfg = await prisma.systemConfig.findUnique({ where: { key: 'backup_cloud' } });
    return (cfg?.value as CloudConfig) || { provider: 'none' };
  } catch {
    return { provider: 'none' };
  }
}

async function readIndex(): Promise<Record<string, CloudEntry>> {
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeIndex(index: Record<string, CloudEntry>): Promise<void> {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(INDEX_FILE, JSON.stringify(index, null, 2));
}

export async function getCloudIndex(): Promise<Record<string, CloudEntry>> {
  return readIndex();
}

export async function markCloudUploaded(filename: string, cloudId: string, provider: CloudProvider): Promise<void> {
  const index = await readIndex();
  index[filename] = { cloudId, provider, uploadedAt: new Date().toISOString() };
  await writeIndex(index);
}

export async function removeFromCloudIndex(filename: string): Promise<void> {
  const index = await readIndex();
  delete index[filename];
  await writeIndex(index);
}

// ── Google Drive ─────────────────────────────────────────────────────────────

async function uploadToGoogleDrive(filepath: string, filename: string, folderId?: string): Promise<string> {
  const { google } = await import('googleapis');

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth });

  const targetFolder = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
  const fileStream = (await import('fs')).createReadStream(filepath);

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: targetFolder ? [targetFolder] : undefined,
    },
    media: {
      mimeType: 'application/octet-stream',
      body: fileStream,
    },
    fields: 'id',
  });

  return response.data.id!;
}

// ── OneDrive (Microsoft Graph) ────────────────────────────────────────────────

async function getOneDriveToken(cfg: NonNullable<CloudConfig['onedrive']>): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
  );
  const data = await res.json();
  if (!data.access_token) throw new Error(`Falha na autenticação OneDrive: ${data.error_description || data.error}`);
  return data.access_token;
}

async function uploadToOneDrive(filepath: string, filename: string, cfg: NonNullable<CloudConfig['onedrive']>): Promise<string> {
  const token = await getOneDriveToken(cfg);
  const fileBuffer = await fs.readFile(filepath);

  // Build the upload URL
  let uploadUrl: string;
  if (cfg.driveId && cfg.folderId) {
    uploadUrl = `https://graph.microsoft.com/v1.0/drives/${cfg.driveId}/items/${cfg.folderId}:/${encodeURIComponent(filename)}:/content`;
  } else if (cfg.driveId) {
    uploadUrl = `https://graph.microsoft.com/v1.0/drives/${cfg.driveId}/root:/${encodeURIComponent(filename)}:/content`;
  } else {
    uploadUrl = `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(filename)}:/content`;
  }

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OneDrive upload falhou (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.id as string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function uploadBackupToCloud(filepath: string, filename: string, config?: CloudConfig): Promise<string> {
  const cfg = config || await getCloudConfig();

  if (cfg.provider === 'google_drive') {
    return uploadToGoogleDrive(filepath, filename, cfg.googleDrive?.folderId);
  }

  if (cfg.provider === 'onedrive') {
    if (!cfg.onedrive?.tenantId || !cfg.onedrive?.clientId || !cfg.onedrive?.clientSecret) {
      throw new Error('Credenciais do OneDrive incompletas. Configure Tenant ID, Client ID e Client Secret.');
    }
    return uploadToOneDrive(filepath, filename, cfg.onedrive);
  }

  throw new Error('Nenhum provedor de nuvem configurado.');
}

export function isGoogleDriveReady(cfg: CloudConfig): boolean {
  return !!(
    process.env.GOOGLE_DRIVE_CLIENT_ID &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN
  );
}

export function isOneDriveReady(cfg: CloudConfig): boolean {
  return !!(cfg.onedrive?.tenantId && cfg.onedrive?.clientId && cfg.onedrive?.clientSecret);
}
