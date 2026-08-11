import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { spawnSync } from 'child_process';

const root = resolve(__dirname, '../../../..');
const script = resolve(root, 'scripts/provision-metabase-reader.sh');

describe('Metabase reader provisioning', () => {
  it('fails before invoking psql when required secrets are absent', () => {
    const result = spawnSync('bash', [script], {
      cwd: root,
      env: { PATH: process.env.PATH ?? '' },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL is required');
  });

  it('refuses to adopt an application or migration login', () => {
    const result = spawnSync('bash', [script], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? '',
        DATABASE_URL: 'postgresql://admin:secret@example.invalid/postgres',
        METABASE_READER_TENANT_ID: '00000000-0000-0000-0000-000000000001',
        METABASE_READER_LOGIN: 'openwork_app',
        METABASE_READER_PASSWORD: 'url_safe_secret_1234567890',
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('must start with cepaa_metabase_');
  });

  it('provisions a tenant-pinned read-only login without printing its password', () => {
    const directory = mkdtempSync(join(tmpdir(), 'metabase-reader-'));
    const captureArgs = join(directory, 'args.txt');
    const captureSql = join(directory, 'sql.txt');
    const fakePsql = join(directory, 'psql');
    writeFileSync(
      fakePsql,
      '#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$CAPTURE_ARGS"\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "-f" ]; then cp "$2" "$CAPTURE_SQL"; exit 0; fi; shift; done\nexit 2\n',
    );
    chmodSync(fakePsql, 0o700);
    const password = 'url_safe_secret_1234567890';
    const result = spawnSync('bash', [script], {
      cwd: root,
      env: {
        PATH: `${directory}:${process.env.PATH ?? ''}`,
        CAPTURE_ARGS: captureArgs,
        CAPTURE_SQL: captureSql,
        DATABASE_URL: 'postgresql://admin:secret@example.invalid/postgres',
        METABASE_READER_TENANT_ID: '00000000-0000-0000-0000-000000000001',
        METABASE_READER_LOGIN: 'cepaa_metabase_reader',
        METABASE_READER_PASSWORD: password,
      },
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain(password);
    expect(result.stderr).not.toContain(password);
    const invocation = readFileSync(captureArgs, 'utf8');
    const sql = readFileSync(captureSql, 'utf8');
    expect(invocation).toContain('ON_ERROR_STOP=1');
    expect(invocation).not.toContain(password);
    expect(sql).toContain('default_transaction_read_only');
    expect(sql).toContain("statement_timeout = '30s'");
    expect(sql).toContain('INSERT INTO analytics.reader_tenants');
    expect(sql).toContain("VALUES ('cepaa_metabase_reader', '00000000-0000-0000-0000-000000000001'::uuid, NOW())");
    expect(sql).toContain('GRANT cepaa_analytics_reader TO "cepaa_metabase_reader"');
    expect(sql).toContain('Existing role was not previously provisioned');
    expect(sql).toContain('FROM pg_shdepend dependency');
    expect(sql).toContain("dependency.deptype IN ('o', 'a')");
  });
});
