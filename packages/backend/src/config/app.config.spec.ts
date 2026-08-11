import {
  loadAppConfig,
  loadCorsOrigins,
  loadDatabaseConfig,
  parseCorsOrigins,
  validateProductionConfig,
} from './app.config';

describe('application configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('normalizes quoted CORS origins and trailing slashes', () => {
    expect(
      parseCorsOrigins('"https://wrike-clone-three.vercel.app/", "https://preview.example.com/"'),
    ).toEqual(['https://wrike-clone-three.vercel.app', 'https://preview.example.com']);
  });

  it('uses the hosting platform PORT before the local APP_PORT', () => {
    process.env.PORT = '8080';
    process.env.APP_PORT = '4000';

    expect(loadAppConfig().port).toBe(8080);
  });

  it('discards localhost while preserving HTTPS origins in production', () => {
    process.env.NODE_ENV = 'production';

    expect(loadCorsOrigins('https://wrike-clone-three.vercel.app,http://localhost:5173')).toEqual([
      'https://wrike-clone-three.vercel.app',
    ]);
  });

  it('allows production to boot without optional SMTP and file storage integrations', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example.invalid/database',
      MIGRATE_DATABASE_URL: 'postgresql://direct.example.invalid/database',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: '"https://wrike-clone-three.vercel.app/"',
      APP_PUBLIC_URL: 'https://wrike-clone-three.vercel.app',
      DB_SSL: 'true',
      ALLOW_PUBLIC_REGISTRATION: 'false',
    };

    expect(validateProductionConfig).not.toThrow();
    expect(loadAppConfig().corsOrigins).toEqual(['https://wrike-clone-three.vercel.app']);
  });

  it('still rejects insecure production origins', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example.invalid/database',
      MIGRATE_DATABASE_URL: 'postgresql://direct.example.invalid/database',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: 'http://wrike-clone-three.vercel.app',
      APP_PUBLIC_URL: 'https://wrike-clone-three.vercel.app',
      DB_SSL: 'true',
      ALLOW_PUBLIC_REGISTRATION: 'false',
    };

    expect(validateProductionConfig).toThrow('CORS_ORIGINS is required');
  });

  it('does not require a second database credential in production', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://pooler/runtime',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: 'https://app.example.com',
      APP_PUBLIC_URL: 'https://app.example.com',
      DB_SSL: 'true',
      ALLOW_PUBLIC_REGISTRATION: 'false',
    };
    expect(validateProductionConfig).not.toThrow();
  });

  it('requires an HTTPS public URL in production', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://pooler/runtime',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: 'https://app.example.com',
      DB_SSL: 'true',
      ALLOW_PUBLIC_REGISTRATION: 'false',
    };
    expect(validateProductionConfig).toThrow('APP_PUBLIC_URL is required');
  });

  it('accepts the complete production baseline', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://pooler/runtime',
      MIGRATE_DATABASE_URL: 'postgresql://direct/migrations',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: 'https://app.example.com',
      APP_PUBLIC_URL: 'https://app.example.com',
      DB_SSL: 'true',
      ALLOW_PUBLIC_REGISTRATION: 'false',
    };
    expect(validateProductionConfig).not.toThrow();
  });

  it('requires public registration to be disabled in production', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://pooler/runtime',
      MIGRATE_DATABASE_URL: 'postgresql://direct/migrations',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: 'https://app.example.com',
      APP_PUBLIC_URL: 'https://app.example.com',
      DB_SSL: 'true',
      ALLOW_PUBLIC_REGISTRATION: 'true',
    };

    expect(validateProductionConfig).toThrow('ALLOW_PUBLIC_REGISTRATION must be false');
  });

  it('uses default minConnections and maxConnections for hosted DATABASE_URL deployments', () => {
    process.env.DATABASE_URL = 'postgresql://example.invalid/database';
    delete process.env.DATABASE_POOL_MIN;
    delete process.env.DB_MIN_CONNECTIONS;
    delete process.env.DATABASE_POOL_MAX;
    delete process.env.DB_MAX_CONNECTIONS;

    expect(loadDatabaseConfig()).toMatchObject({
      minConnections: 2,
      maxConnections: 8,
    });
  });

  it('supports CORS_ORIGIN (singular) and wildcard *', () => {
    delete process.env.CORS_ORIGINS;
    process.env.CORS_ORIGIN = '*';
    expect(parseCorsOrigins()).toEqual(['*']);
  });

  it('respects database pool env overrides', () => {
    process.env.DATABASE_POOL_MIN = '5';
    process.env.DATABASE_POOL_MAX = '20';

    expect(loadDatabaseConfig()).toMatchObject({
      minConnections: 5,
      maxConnections: 20,
    });
  });
});
