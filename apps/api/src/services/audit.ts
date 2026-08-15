import type { Types } from 'mongoose';
import { getBaseConnection } from '../db/connection.js';
import { platformModels } from '../models/platform.js';
import { logger } from '../logger.js';

export interface AuditEntry {
  tenantId: Types.ObjectId | null;
  actorUserId: Types.ObjectId | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/** Audit writes must never break the operation they describe. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const { AuditLog } = platformModels(getBaseConnection());
    await AuditLog.create({
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: entry.meta ?? {},
      ip: entry.ip ?? null,
    });
  } catch (error) {
    logger.warn({ err: error, action: entry.action }, 'failed to write audit log');
  }
}
