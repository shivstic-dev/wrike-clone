import { buildMigrationConnection } from '../../src/database/knexfile';

describe('migration connection selection', () => {
  it('prefers the direct migration URL over the pooled runtime URL', () => {
    expect(
      buildMigrationConnection({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://pooler/runtime',
        MIGRATE_DATABASE_URL: 'postgresql://direct/migrations',
        DB_SSL: 'true',
      }),
    ).toMatchObject({ connectionString: 'postgresql://direct/migrations' });
  });

  it('throws in production when the direct migration URL is absent', () => {
    expect(() =>
      buildMigrationConnection({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://pooler/runtime',
        DB_SSL: 'true',
      }),
    ).toThrow('MIGRATE_DATABASE_URL is required for production migrations');
  });

  it('keeps DATABASE_URL as the local migration fallback', () => {
    expect(buildMigrationConnection({ DATABASE_URL: 'postgresql://local/dev' })).toMatchObject({
      connectionString: 'postgresql://local/dev',
    });
  });
});
