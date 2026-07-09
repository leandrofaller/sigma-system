import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseSafeDateOnly(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
  const str = String(val).trim();
  if (!str) return null;

  // matches YYYY-MM-DD optionally followed by T00:00:00 (midnights)
  const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z?)?$/;
  const match = str.match(dateOnlyPattern);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day, 12, 0, 0); // local noon
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function parseSafeDateTime(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  
  const str = String(val).trim();
  if (!str) return null;

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: Date | string | null | undefined): string {
  const d = parseSafeDateOnly(date);
  if (!d) return '__/__/____';
  return format(d, "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTime(date: Date | string | null | undefined): string {
  const d = parseSafeDateTime(date);
  if (!d) return '__/__/____ às __:__';
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function generateRelintNumber(prefix: string, year?: number): string {
  const y = year ?? new Date().getFullYear();
  const random = Math.floor(Math.random() * 900) + 100;
  return `RELINT Nº${random.toString().padStart(3, '0')}/${y}/AIP/SEJUS/RO`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getClassificationColor(classification: string): string {
  const colors: Record<string, string> = {
    RESERVADO:    'text-red-700 bg-red-50 border-red-300 dark:text-red-300 dark:bg-red-900/25 dark:border-red-700',
    CONFIDENCIAL: 'text-orange-700 bg-orange-50 border-orange-300 dark:text-orange-300 dark:bg-orange-900/25 dark:border-orange-700',
    SECRETO:      'text-red-700 bg-red-50 border-red-300 dark:text-red-300 dark:bg-red-900/25 dark:border-red-700',
    ULTRA_SECRETO:'text-purple-700 bg-purple-50 border-purple-300 dark:text-purple-300 dark:bg-purple-900/25 dark:border-purple-700',
  };
  return colors[classification] || 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-800 dark:border-gray-600';
}

export function getRoleName(role: string): string {
  const roles: Record<string, string> = {
    SUPER_ADMIN: 'Super Administrador',
    ADMIN: 'Administrador',
    OPERATOR: 'Operador',
  };
  return roles[role] || role;
}

export function generateId(): string {
  return uuidv4();
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function parsePortugueseFloat(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  
  let cleanValue = String(value).trim();
  if (!cleanValue) return 0;

  // Replace multiple spaces
  cleanValue = cleanValue.replace(/\s+/g, '');

  // If both dot and comma are present:
  // e.g. "80.000,50" -> dot is thousands, comma is decimal
  if (cleanValue.includes('.') && cleanValue.includes(',')) {
    cleanValue = cleanValue.replace(/\./g, '').replace(/,/g, '.');
    return parseFloat(cleanValue);
  }

  // If there's only a comma:
  // e.g. "80000,50" or "80,50" -> comma is decimal
  if (cleanValue.includes(',')) {
    cleanValue = cleanValue.replace(/,/g, '.');
    return parseFloat(cleanValue);
  }

  // If there's only a dot:
  // e.g. "80.000" or "80.50" or "80.5" or "1.500"
  if (cleanValue.includes('.')) {
    const parts = cleanValue.split('.');
    if (parts.length > 2) {
      // e.g. "1.234.567" -> multiple dots means thousands separators
      cleanValue = cleanValue.replace(/\./g, '');
    } else if (parts.length === 2) {
      const decimalPart = parts[1];
      // In Brazil: "80.000" (3 digits) means 80000.
      // "80.50" (2 digits) means 80.5.
      // "80.5" (1 digit) means 80.5.
      // So if the part after the dot has exactly 3 digits, we treat it as a thousands separator and remove the dot.
      // Otherwise, we keep the dot as the decimal separator.
      if (decimalPart.length === 3) {
        cleanValue = cleanValue.replace(/\./g, '');
      }
    }
  }

  const result = parseFloat(cleanValue);
  return isNaN(result) ? 0 : result;
}
