import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../../..');

describe('Metabase deployment contract', () => {
  it('pins Metabase and keeps its application database separate from operational data', () => {
    const compose = readFileSync(resolve(root, 'docker/docker-compose.yml'), 'utf8');

    expect(compose).toContain('metabase/metabase:v0.63.2.x');
    expect(compose).toContain('metabase-db:');
    expect(compose).toContain('MB_DB_TYPE: postgres');
    expect(compose).toContain('MB_ENCRYPTION_SECRET_KEY');
    expect(compose).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(compose).not.toContain('METABASE_READER_PASSWORD');
  });

  it('documents least-privilege setup, validation, rotation, backup, and rollback', () => {
    const runbook = readFileSync(
      resolve(root, 'docs/deployment/metabase-supabase-runbook.md'),
      'utf8',
    );

    for (const required of [
      'cepaa_analytics_reader',
      'default_transaction_read_only',
      'METABASE_SITE_URL',
      'SSL',
      'backup',
      'rotation',
      'rollback',
      'Department Heads',
      'service-role',
    ]) {
      expect(runbook).toContain(required);
    }
  });
});
