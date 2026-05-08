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
    RESERVADO: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    CONFIDENCIAL: 'text-orange-600 bg-orange-50 border-orange-200',
    SECRETO: 'text-red-600 bg-red-50 border-red-200',
    ULTRA_SECRETO: 'text-purple-600 bg-purple-50 border-purple-200',
  };
  return colors[classification] || 'text-gray-600 bg-gray-50 border-gray-200';
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
