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

export function buildMigrationConnection(
  env: NodeJS.ProcessEnv = process.env,
): Knex.Config['connection'] {
  // Keep Railway startup on the same known-good credential as the application.
  // MIGRATE_DATABASE_URL remains a local fallback for migration-only workflows.
  const databaseUrl = env['DATABASE_URL'] || env['MIGRATE_DATABASE_URL'];
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: env['DB_HOST'] || 'localhost',
    port: Number.parseInt(env['DB_PORT'] || '5432', 10),
    database: env['DB_NAME'] || 'wrike_clone',
    user: env['DB_USER'] || 'wrike',
    password: env['DB_PASSWORD'] || 'wrike_dev',
    ssl: env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  };
}

const config: Knex.Config = {
  client: 'pg',
  connection: buildMigrationConnection(),
  pool: {
    min: 0,
    max: parseInt(process.env['DB_MAX_CONNECTIONS'] || '1', 10),
    idleTimeoutMillis: parseInt(process.env['DB_IDLE_TIMEOUT_MS'] || '1000', 10),
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
