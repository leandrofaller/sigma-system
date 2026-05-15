import { isAbsolute, relative, resolve } from 'path';

const DEFAULT_MAX_FILE_SIZE_MB = 50;

export const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  'bat',
  'cmd',
  'com',
  'exe',
  'html',
  'htm',
  'js',
  'mjs',
  'ps1',
  'sh',
  'svg',
  'vbs',
]);

export function maxUploadBytes() {
  const parsed = Number(process.env.MAX_FILE_SIZE_MB);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_FILE_SIZE_MB;
  return mb * 1024 * 1024;
}

export function getExtension(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return /^[a-z0-9]+$/.test(ext) ? ext : '';
}

export function assertUploadAllowed(
  file: File,
  options: {
    allowedExtensions?: readonly string[];
    allowedMimeTypes?: readonly string[];
    allowedMimePrefixes?: readonly string[];
  } = {}
) {
  const limit = maxUploadBytes();
  if (file.size > limit) {
    return `Arquivo excede o limite de ${Math.round(limit / 1024 / 1024)} MB`;
  }

  const ext = getExtension(file.name);
  if (!ext || BLOCKED_UPLOAD_EXTENSIONS.has(ext)) {
    return 'Formato de arquivo não permitido';
  }

  if (options.allowedExtensions && !options.allowedExtensions.includes(ext)) {
    return 'Formato de arquivo não suportado';
  }

  const type = file.type || 'application/octet-stream';
  const allowedByType =
    options.allowedMimeTypes?.includes(type) ||
    options.allowedMimePrefixes?.some((prefix) => type.startsWith(prefix));

  if (
    (options.allowedMimeTypes || options.allowedMimePrefixes) &&
    !allowedByType
  ) {
    return 'Tipo de arquivo não suportado';
  }

  return null;
}

export function isPathInside(basePath: string, targetPath: string) {
  const base = resolve(basePath);
  const target = resolve(targetPath);
  const rel = relative(base, target);
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
}
