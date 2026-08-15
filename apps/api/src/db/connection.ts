import mongoose, { type Connection } from 'mongoose';
import { config } from '../config.js';
import { logger } from '../logger.js';

let base: Connection | null = null;

/**
 * Single driver connection to the cluster. Every database -- the platform
 * control plane and each tenant -- is reached through useDb() on this one
 * connection so the pool is shared rather than multiplied per tenant.
 */
export async function connect(uri: string = config.MONGODB_URI): Promise<Connection> {
  if (base) return base;
  const connection = await mongoose
    .createConnection(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 20,
    })
    .asPromise();
  base = connection;
  logger.info('connected to MongoDB cluster');
  return connection;
}

export function getBaseConnection(): Connection {
  if (!base) throw new Error('database not connected; call connect() first');
  return base;
}

export async function disconnect(): Promise<void> {
  if (!base) return;
  await base.close();
  base = null;
}
