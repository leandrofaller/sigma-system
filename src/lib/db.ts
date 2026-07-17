import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Pool de conexões esgotado (P2024). É transitório e diz apenas que a app, os
 * jobs de fundo e o scraping estão disputando as poucas conexões do Prisma — o
 * default é num_cpus*2+1, ou seja, 5 numa VPS de 2 vCPU.
 *
 * Trabalho de fundo deve tratar isto como "espere e tente de novo", nunca como
 * falha do recurso remoto: já houve caso de job abortar acusando o SIPE de
 * sessão expirada quando o SIPE estava intacto e o pool é que estava cheio.
 */
export function isErroTransitorioDeBanco(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = String(e?.message ?? err);
  return (
    e?.code === 'P2024' ||
    msg.includes('connection pool') ||
    msg.includes('Timed out fetching a new connection')
  );
}
