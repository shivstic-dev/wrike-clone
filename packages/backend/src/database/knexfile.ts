import type { Knex } from 'knex';
import { resolve } from 'path';

export function migrationFileConfig(filename = __filename): {
  extension: 'ts' | 'js';
  loadExtensions: readonly string[];
} {
  const extension = filename.endsWith('.ts') ? 'ts' : 'js';
  return {
    extension,
    loadExtensions: [`.${extension}`],
  };
}

/**
 * Build connection config, supporting both DATABASE_URL (single connection string)
 * and discrete DB_* variables.
 */
function buildConnection(): Knex.Config['connection'] {
  const databaseUrl = process.env['DATABASE_URL'] || process.env['MIGRATE_DATABASE_URL'];
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432', 10),
    database: process.env['DB_NAME'] || 'wrike_clone',
    user: process.env['DB_USER'] || 'wrike',
    password: process.env['DB_PASSWORD'] || 'wrike_dev',
    ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const config: Knex.Config = {
  client: 'pg',
  connection: buildConnection(),
  pool: {
    min: 0,
    max: parseInt(process.env['DB_MAX_CONNECTIONS'] || '10', 10),
  },
  migrations: {
    directory: resolve(__dirname, '../migrations'),
    ...migrationFileConfig(),
  },
  seeds: {
    directory: './seeds',
  },
};

export default config;
export { config };
