import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { config } from '../config/index';

// postgres-js connects lazily on first query, so importing this module is safe
// even when no database is reachable (e.g. unit tests that never query).
export const sql = postgres(config.databaseUrl, {
  max: config.isTest ? 1 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {
    /* silence NOTICE messages */
  },
});

export const db = drizzle(sql, { schema });
export type DB = typeof db;
export { schema };
