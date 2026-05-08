import { prisma } from './db';
import { headers } from 'next/headers';

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
    const headersList = request ? Object.fromEntries(request.headers) : {};
    const ipAddress =
      headersList['x-forwarded-for']?.split(',')[0] ||
      headersList['x-real-ip'] ||
      'unknown';
    const userAgent = headersList['user-agent'] || 'unknown';

    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        details: details as any,
        ipAddress,
        userAgent,
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
} as const;
