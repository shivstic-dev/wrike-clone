import { buildMigrationConnection } from '../../src/database/knexfile';

describe('migration connection selection', () => {
  it('keeps using the established runtime URL when a secondary migration URL is invalid', () => {
    expect(
      buildMigrationConnection({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://pooler/runtime',
        MIGRATE_DATABASE_URL: 'postgresql://wrong-user/migrations',
        DB_SSL: 'true',
      }),
    ).toMatchObject({ connectionString: 'postgresql://pooler/runtime' });
  });

  it('uses DATABASE_URL for production migrations without requiring a second credential', () => {
    expect(
      buildMigrationConnection({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://pooler/runtime',
        DB_SSL: 'true',
      }),
    ).toMatchObject({ connectionString: 'postgresql://pooler/runtime' });
  });

  it('keeps DATABASE_URL as the local migration fallback', () => {
    expect(buildMigrationConnection({ DATABASE_URL: 'postgresql://local/dev' })).toMatchObject({
      connectionString: 'postgresql://local/dev',
    });
  });
});
