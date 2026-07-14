import { prisma } from './db';
import { createHash } from 'crypto';

interface AuditParams {
  userId?: string;
  action: string;
  entity?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  request?: Request;
}

export async function createAuditLog({
  userId,
  action,
  entity,
  entityId,
  details,
  request,
}: AuditParams): Promise<void> {
  try {
    const headersList = request ? Object.fromEntries(Array.from(request.headers.entries())) : {};
    const ipAddress =
      headersList['x-forwarded-for']?.split(',')[0] ||
      headersList['x-real-ip'] ||
      'unknown';
    const userAgent = headersList['user-agent'] || 'unknown';

    // 1. Obter o hash do log mais recente
    const lastLog = await prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { hash: true },
    });
    const parentHash = lastLog?.hash || '0'.repeat(64);

    // 2. Concatenar dados do log para computar o hash único
    const payload = JSON.stringify({
      userId,
      action,
      entity,
      entityId,
      details,
      ipAddress,
      userAgent,
      parentHash,
    });
    const hash = createHash('sha256').update(payload).digest('hex');

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details: details as any,
        ipAddress,
        userAgent,
        parentHash,
        hash,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  CREATE_RELINT: 'CREATE_RELINT',
  EDIT_RELINT: 'EDIT_RELINT',
  DELETE_RELINT: 'DELETE_RELINT',
  PUBLISH_RELINT: 'PUBLISH_RELINT',
  DOWNLOAD_RELINT: 'DOWNLOAD_RELINT',
  UPLOAD_FILE: 'UPLOAD_FILE',
  DELETE_FILE: 'DELETE_FILE',
  CREATE_USER: 'CREATE_USER',
  EDIT_USER: 'EDIT_USER',
  DELETE_USER: 'DELETE_USER',
  CREATE_GROUP: 'CREATE_GROUP',
  EDIT_GROUP: 'EDIT_GROUP',
  DELETE_GROUP: 'DELETE_GROUP',
  CHANGE_CONFIG: 'CHANGE_CONFIG',
  AI_QUERY: 'AI_QUERY',
  SEND_MESSAGE: 'SEND_MESSAGE',
  VIEW_FILE: 'VIEW_FILE',
  CREATE_DEBRIEFING: 'CREATE_DEBRIEFING',
  EDIT_DEBRIEFING: 'EDIT_DEBRIEFING',
  DELETE_DEBRIEFING: 'DELETE_DEBRIEFING',
  PUBLISH_DEBRIEFING: 'PUBLISH_DEBRIEFING',
  DELETE_ALL_MISSIONS: 'DELETE_ALL_MISSIONS',
  DEVICE_AUTHORIZED: 'DEVICE_AUTHORIZED',
  DEVICE_REVOKED: 'DEVICE_REVOKED',

  // Mural de Eventos
  CREATE_EVENT: 'CREATE_EVENT',
  UPDATE_EVENT: 'UPDATE_EVENT',
  DELETE_EVENT: 'DELETE_EVENT',
  UPLOAD_EVENT_ATTACHMENT: 'UPLOAD_EVENT_ATTACHMENT',
  DELETE_EVENT_ATTACHMENT: 'DELETE_EVENT_ATTACHMENT',
  APPROVE_DELETION_REQUEST: 'APPROVE_DELETION_REQUEST',
  REJECT_DELETION_REQUEST: 'REJECT_DELETION_REQUEST',

  // Relatório de Força-Tarefa
  CREATE_RFT: 'CREATE_RFT',
  EDIT_RFT: 'EDIT_RFT',
  DELETE_RFT: 'DELETE_RFT',
  PUBLISH_RFT: 'PUBLISH_RFT',

  // Controle de Dossiês AIP
  REQUEST_DOSSIER: 'REQUEST_DOSSIER',
  APPROVE_DOSSIER_REQUEST: 'APPROVE_DOSSIER_REQUEST',
  REJECT_DOSSIER_REQUEST: 'REJECT_DOSSIER_REQUEST',
  GENERATE_DOSSIER: 'GENERATE_DOSSIER',
} as const;
