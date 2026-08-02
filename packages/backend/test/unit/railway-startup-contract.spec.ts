import { spawnSync } from 'child_process';
import { resolve } from 'path';

function toGitBashPath(path: string): string {
  return path.replace(/^([A-Za-z]):/, (_match, drive: string) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}

describe('Railway startup contract', () => {
  it('fails closed when NODE_ENV is not production', () => {
    const resolvedScript = resolve(__dirname, '../../../../scripts/railway-start.sh');
    const script = process.platform === 'win32' ? toGitBashPath(resolvedScript) : resolvedScript;
    const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
    const result = spawnSync(bash, [script], {
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: '/usr/bin:/bin',
        NODE_ENV: 'staging',
        DATABASE_URL: 'postgresql://pooler.invalid/runtime',
        MIGRATE_DATABASE_URL: 'postgresql://direct.invalid/migrations',
      },
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout || ''}${result.stderr || ''}`).toContain(
      '[ERROR] NODE_ENV must be production',
    );
  });

  it('starts migrations with the established DATABASE_URL alone', () => {
    const resolvedScript = resolve(__dirname, '../../../../scripts/railway-start.sh');
    const script = process.platform === 'win32' ? toGitBashPath(resolvedScript) : resolvedScript;
    const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : 'bash';
    const result = spawnSync(bash, [script], {
      encoding: 'utf8',
      timeout: 5_000,
      env: {
        ...process.env,
        PATH: '/usr/bin:/bin',
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://pooler.invalid/runtime',
        MIGRATE_DATABASE_URL: '',
      },
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;

    expect(output).toContain('[INFO] Running migrations...');
    expect(output).not.toContain('MIGRATE_DATABASE_URL is required');
  });
});
