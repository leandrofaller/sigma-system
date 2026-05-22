import { prisma } from './db';
import type { DeviceStatus } from '@prisma/client';

export function parseDeviceName(userAgent: string): string {
  if (!userAgent) return 'Dispositivo desconhecido';

  const ua = userAgent;

  // OS detection
  let os = 'Desconhecido';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6\.3/.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6\.1/.test(ua)) os = 'Windows 7';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android ([0-9.]+)/.test(ua)) os = `Android ${ua.match(/Android ([0-9.]+)/)?.[1] ?? ''}`.trim();
  else if (/iPhone OS ([0-9_]+)/.test(ua)) os = `iOS ${ua.match(/iPhone OS ([0-9_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  else if (/iPad.*OS ([0-9_]+)/.test(ua)) os = `iPadOS ${ua.match(/OS ([0-9_]+)/)?.[1]?.replace(/_/g, '.') ?? ''}`.trim();
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  // Browser detection (order matters)
  let browser = 'Navegador';
  if (/Edg\/([0-9.]+)/.test(ua)) browser = `Edge ${ua.match(/Edg\/([0-9.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();
  else if (/OPR\/([0-9.]+)/.test(ua)) browser = `Opera ${ua.match(/OPR\/([0-9.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();
  else if (/Chrome\/([0-9.]+)/.test(ua) && !/Chromium/.test(ua)) browser = `Chrome ${ua.match(/Chrome\/([0-9.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();
  else if (/Firefox\/([0-9.]+)/.test(ua)) browser = `Firefox ${ua.match(/Firefox\/([0-9.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();
  else if (/Safari\/([0-9.]+)/.test(ua) && /Version\/([0-9.]+)/.test(ua)) browser = `Safari ${ua.match(/Version\/([0-9.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();
  else if (/Chromium\/([0-9.]+)/.test(ua)) browser = `Chromium ${ua.match(/Chromium\/([0-9.]+)/)?.[1]?.split('.')[0] ?? ''}`.trim();

  return `${browser} — ${os}`;
}

export async function getOrCreateDevice(
  token: string,
  userId: string,
  userAgent: string,
  ipAddress: string,
  enforcementEnabled: boolean,
): Promise<DeviceStatus> {
  const existing = await prisma.userDevice.findUnique({ where: { token } });

  if (existing) {
    // Dispositivo já registrado — atualiza metadados e retorna status atual
    if (existing.userId !== userId) {
      // Token pertence a outro usuário — trata como novo dispositivo
      return handleNew(token, userId, userAgent, ipAddress, enforcementEnabled);
    }
    await prisma.userDevice.update({
      where: { token },
      data: { lastUsedAt: new Date(), ipAddress, userAgent },
    });
    return existing.status;
  }

  return handleNew(token, userId, userAgent, ipAddress, enforcementEnabled);
}

async function handleNew(
  token: string,
  userId: string,
  userAgent: string,
  ipAddress: string,
  enforcementEnabled: boolean,
): Promise<DeviceStatus> {
  const status: DeviceStatus = enforcementEnabled ? 'PENDING' : 'AUTHORIZED';
  await prisma.userDevice.upsert({
    where: { token },
    create: {
      token,
      userId,
      name: parseDeviceName(userAgent),
      userAgent,
      ipAddress,
      status,
      authorizedAt: enforcementEnabled ? null : new Date(),
    },
    update: {
      userId,
      name: parseDeviceName(userAgent),
      userAgent,
      ipAddress,
      lastUsedAt: new Date(),
    },
  });
  return status;
}
