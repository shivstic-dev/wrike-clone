/**
 * Database module — Knex + PostgreSQL connection.
 * Provides a Knex instance to the entire application.
 * Supports both DATABASE_URL (single connection string, Supabase/Neon style)
 * and discrete DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD variables.
 */

import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { knex, Knex } from 'knex';
import { loadDatabaseConfig } from '../config/app.config';
import { getTenantContext } from '../common/tenant-context';

export const DATABASE_PROVIDER = 'KNEX_CONNECTION';
export const ROOT_DATABASE_PROVIDER = 'ROOT_KNEX_CONNECTION';

function createConnectionConfig(config: ReturnType<typeof loadDatabaseConfig>) {
  if (config.databaseUrl) {
    return {
      connectionString: config.databaseUrl,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
    };
  }

  return {
    host: config.host,
    port: config.port,
    database: config.name,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
  };
}

@Global()
@Module({
  providers: [
    {
      provide: ROOT_DATABASE_PROVIDER,
      useFactory: (): Knex => {
        const config = loadDatabaseConfig();
        return knex({
          client: 'pg',
          connection: createConnectionConfig(config),
          pool: {
            min: 0,
            max: config.maxConnections,
            idleTimeoutMillis: config.idleTimeoutMs,
          },
          acquireConnectionTimeout: 10000,
        });
      },
    },
    {
      provide: DATABASE_PROVIDER,
      inject: [ROOT_DATABASE_PROVIDER],
      useFactory: (rootDb: Knex): Knex =>
        new Proxy(rootDb as any, {
          apply(target, thisArg, argArray) {
            const activeDb = getTenantContext()?.database || target;
            return Reflect.apply(activeDb as any, thisArg, argArray);
          },
          get(target, property, receiver) {
            const activeDb = getTenantContext()?.database || target;
            const value = Reflect.get(activeDb as any, property, receiver);
            return typeof value === 'function' ? value.bind(activeDb) : value;
          },
        }) as Knex,
    },
  ],
  exports: [DATABASE_PROVIDER, ROOT_DATABASE_PROVIDER],
})
export class DatabaseModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // Pool is destroyed automatically by NestJS on shutdown.
  }
}
