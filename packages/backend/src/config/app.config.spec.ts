import { loadAppConfig, parseCorsOrigins, validateProductionConfig } from './app.config';

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

  it('allows production to boot without optional SMTP and file storage integrations', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example.invalid/database',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: '"https://wrike-clone-three.vercel.app/"',
      DB_SSL: 'true',
    };

    expect(validateProductionConfig).not.toThrow();
    expect(loadAppConfig().corsOrigins).toEqual(['https://wrike-clone-three.vercel.app']);
  });

  it('still rejects insecure production origins', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://example.invalid/database',
      JWT_SECRET: 'j'.repeat(64),
      CORS_ORIGINS: 'http://wrike-clone-three.vercel.app',
      DB_SSL: 'true',
    };

    expect(validateProductionConfig).toThrow(
      'CORS_ORIGINS must contain only explicit HTTPS origins',
    );
  });
});
