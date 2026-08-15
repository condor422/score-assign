import type { Connection } from 'mongoose';
import { config } from '../config.js';
import { getBaseConnection } from './connection.js';
import { tenantModels, type TenantModels } from '../models/tenant.js';

interface Entry {
  connection: Connection;
  models: TenantModels;
  lastUsed: number;
}

/**
 * Caches one logical connection per tenant database. useDb() reuses the
 * cluster's socket pool, so the cost per tenant is a lightweight handle rather
 * than a new connection -- but the cache is still bounded so a few thousand
 * tenants cannot grow it without limit.
 */
const MAX_ENTRIES = 200;
const registry = new Map<string, Entry>();

export function tenantDbName(tenantId: string): string {
  return `${config.TENANT_DB_PREFIX}${tenantId}`;
}

export function getTenantModels(dbName: string): TenantModels {
  const cached = registry.get(dbName);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.models;
  }

  const connection = getBaseConnection().useDb(dbName, { useCache: true });
  const entry: Entry = { connection, models: tenantModels(connection), lastUsed: Date.now() };
  registry.set(dbName, entry);
  evictIfNeeded();
  return entry.models;
}

function evictIfNeeded(): void {
  if (registry.size <= MAX_ENTRIES) return;
  const oldest = [...registry.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  const toDrop = registry.size - MAX_ENTRIES;
  for (let i = 0; i < toDrop; i += 1) {
    const key = oldest[i]?.[0];
    // Only the handle is dropped; the underlying cluster connection persists.
    if (key) registry.delete(key);
  }
}

export function clearTenantRegistry(): void {
  registry.clear();
}
