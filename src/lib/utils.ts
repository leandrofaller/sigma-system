import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { v4 as uuidv4 } from 'uuid';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy", { locale: ptBR });
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
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
    RESERVADO:    'text-yellow-700 bg-yellow-50 border-yellow-300 dark:text-yellow-300 dark:bg-yellow-900/25 dark:border-yellow-700',
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
