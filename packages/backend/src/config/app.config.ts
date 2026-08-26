/**
 * Application configuration.
 * Reads from environment variables with sensible defaults.
 */

export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  encryptionKey: string;
  defaultTenantSlug?: string;
}

export interface DatabaseConfig {
  /** If DATABASE_URL is set, this single string overrides all other DB_* vars. */
  databaseUrl?: string;
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  ssl: boolean;
  minConnections: number;
  maxConnections: number;
  idleTimeoutMs: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
}

export interface AuthConfig {
  jwtSecret: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  issuer: string;
  audience: string;
}

export interface S3Config {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
}

export interface SupabaseStorageConfig {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

export function parseCorsOrigins(
  rawValue = process.env['CORS_ORIGIN'] || process.env['CORS_ORIGINS'] || 'http://localhost:5173',
): string[] {
  return rawValue
    .split(',')
    .map((value) => value.trim().replace(/^['"]+|['"]+$/g, ''))
    .filter(Boolean)
    .map((value) => {
      if (value === '*') return '*';
      try {
        return new URL(value).origin;
      } catch {
        return value.replace(/\/+$/, '');
      }
    });
}

export function loadCorsOrigins(
  rawValue = process.env['CORS_ORIGIN'] || process.env['CORS_ORIGINS'] || 'http://localhost:5173',
): string[] {
  const origins = parseCorsOrigins(rawValue);
  return process.env['NODE_ENV'] === 'production'
    ? origins.filter((origin) => origin.startsWith('https://'))
    : origins;
}

export function loadAppConfig(): AppConfig {
  return {
    nodeEnv: process.env['NODE_ENV'] || 'development',
    // Hosting platforms such as Railway inject PORT for their public proxy.
    // APP_PORT remains the local-development fallback.
    port: parseInt(process.env['PORT'] || process.env['APP_PORT'] || '4000', 10),
    apiPrefix: process.env['API_PREFIX'] || '/api/v1',
    corsOrigins: loadCorsOrigins(),
    encryptionKey: process.env['ENCRYPTION_KEY'] || 'dev-key-change-in-prod',
    defaultTenantSlug: process.env['DEFAULT_TENANT_SLUG'] || undefined,
  };
}

/**
 * Refuse to boot production with missing critical controls. Optional
 * integrations degrade at their feature boundary instead of taking auth and
 * health endpoints offline.
 */
export function validateProductionConfig(): void {
  if (process.env['NODE_ENV'] !== 'production') return;

  const problems: string[] = [];
  const jwtSecret = process.env['JWT_SECRET'] || '';
  const rawCorsOrigins = parseCorsOrigins(
    process.env['CORS_ORIGIN'] || process.env['CORS_ORIGINS'] || '',
  );
  const corsOrigins = loadCorsOrigins(
    process.env['CORS_ORIGIN'] || process.env['CORS_ORIGINS'] || '',
  );

  if (!process.env['DATABASE_URL']) problems.push('DATABASE_URL is required');
  if (!process.env['APP_PUBLIC_URL']) problems.push('APP_PUBLIC_URL is required');
  if (process.env['ALLOW_PUBLIC_REGISTRATION'] !== 'false') {
    problems.push('ALLOW_PUBLIC_REGISTRATION must be false');
  }
  if (jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  if (process.env['SETUP_KEY'] && process.env['SETUP_KEY']!.length < 24) {
    problems.push('SETUP_KEY must be at least 24 characters');
  }
  if (corsOrigins.length === 0) {
    problems.push('CORS_ORIGINS is required');
  } else if (rawCorsOrigins.includes('*')) {
    problems.push('CORS_ORIGINS must not contain a wildcard');
  }
  if (process.env['DB_APP_ROLE'] && process.env['DB_APP_ROLE'] !== 'openwork_app') {
    problems.push('DB_APP_ROLE must be set to openwork_app');
  }
  if (process.env['DB_SSL'] !== 'true') problems.push('DB_SSL must be true');
  if (process.env['APP_PUBLIC_URL'] && !process.env['APP_PUBLIC_URL']?.startsWith('https://')) {
    problems.push('APP_PUBLIC_URL must be an HTTPS URL');
  }

  if (problems.length > 0) {
    throw new Error(`Unsafe production configuration:\n- ${problems.join('\n- ')}`);
  }
}

export function loadDatabaseConfig(): DatabaseConfig {
  // If DATABASE_URL is set, use it as a single connection string (Supabase/Neon style)
  const databaseUrl = process.env['DATABASE_URL'];
  const minConnections = parseInt(
    process.env['DATABASE_POOL_MIN'] || process.env['DB_MIN_CONNECTIONS'] || '2',
    10,
  );
  const maxConnections = parseInt(
    process.env['DATABASE_POOL_MAX'] ||
      process.env['DB_MAX_CONNECTIONS'] ||
      (databaseUrl ? '8' : '10'),
    10,
  );
  const idleTimeoutMs = parseInt(process.env['DB_IDLE_TIMEOUT_MS'] || '10000', 10);

  if (databaseUrl) {
    return {
      databaseUrl,
      host: '',
      port: 5432,
      name: '',
      user: '',
      password: '',
      ssl: process.env['DB_SSL'] === 'true',
      minConnections,
      maxConnections,
      idleTimeoutMs,
    };
  }

  return {
    host: process.env['DB_HOST'] || 'localhost',
    port: parseInt(process.env['DB_PORT'] || '5432', 10),
    name: process.env['DB_NAME'] || 'wrike_clone',
    user: process.env['DB_USER'] || 'wrike',
    password: process.env['DB_PASSWORD'] || 'wrike_dev',
    ssl: process.env['DB_SSL'] === 'true',
    minConnections,
    maxConnections,
    idleTimeoutMs,
  };
}

/**
 * Returns Redis config or null if Redis is not configured.
 * The app should work without Redis (sync mode).
 */
export function loadRedisConfig(): RedisConfig | null {
  if (!process.env['REDIS_HOST']) return null;
  return {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
    password: process.env['REDIS_PASSWORD'] || '',
    db: parseInt(process.env['REDIS_DB'] || '0', 10),
  };
}

export function loadAuthConfig(): AuthConfig {
  return {
    jwtSecret: process.env['JWT_SECRET'] || 'dev-jwt-secret-change-in-prod',
    accessTokenTtlSec: parseInt(process.env['ACCESS_TOKEN_TTL_SEC'] || '900', 10),
    refreshTokenTtlSec: parseInt(process.env['REFRESH_TOKEN_TTL_SEC'] || '2592000', 10),
    issuer: process.env['JWT_ISSUER'] || 'openwork-api',
    audience: process.env['JWT_AUDIENCE'] || 'openwork-web',
  };
}

/**
 * Returns S3 config or null if S3 is not configured.
 * Legacy S3-compatible storage configuration.
 */
export function loadS3Config(): S3Config | null {
  if (!process.env['S3_ENDPOINT']) return null;
  return {
    endpoint: process.env['S3_ENDPOINT'] || 'http://localhost:9000',
    region: process.env['S3_REGION'] || 'us-east-1',
    accessKey: process.env['S3_ACCESS_KEY'] || 'minioadmin',
    secretKey: process.env['S3_SECRET_KEY'] || 'minioadmin',
    bucket: process.env['S3_BUCKET'] || 'wrike-files',
    useSsl: process.env['S3_USE_SSL'] === 'true',
  };
}

export function loadSupabaseStorageConfig(): SupabaseStorageConfig | null {
  const url = process.env['SUPABASE_URL']?.replace(/\/+$/, '');
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceRoleKey) return null;

  return {
    url,
    serviceRoleKey,
    bucket: process.env['SUPABASE_STORAGE_BUCKET'] || 'work-management-files',
  };
}
