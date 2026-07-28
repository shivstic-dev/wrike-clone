import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const repositoryRoot = resolve(__dirname, '../../../..');
const migrationRoot = resolve(repositoryRoot, 'supabase/migrations');
const wrapperRoot = resolve(repositoryRoot, 'packages/backend/src/migrations');

const appliedMigrations = [
  {
    wrapper: '012_department_dashboard_v1.ts',
    filename: '20260727122026_department_dashboard_v1.sql',
    normalizedMd5: 'c15aca89d8c0958f9605ac85265ba461',
  },
  {
    wrapper: '013_department_head_assigned_by_index.ts',
    filename: '20260727122109_department_head_assigned_by_index.sql',
    normalizedMd5: '4d3cc1e504a30b96a802b566b6fcb3b8',
  },
  {
    wrapper: '014_rbac_workflows.ts',
    filename: '20260727203157_rbac_workflows.sql',
    normalizedMd5: 'ce8d224524c7695c395510eff47eda2f',
  },
  {
    wrapper: '015_rbac_workflows_advisor_fixes.ts',
    filename: '20260727203332_rbac_workflows_advisor_fixes.sql',
    normalizedMd5: 'cc8afa571c22e8ec92757a35c5962a8b',
  },
  {
    wrapper: '016_restore_knex_migration_access.ts',
    filename: '20260727205116_restore_knex_migration_access.sql',
    normalizedMd5: 'd58217f12985c88f54c70f904f341e83',
  },
  {
    wrapper: '017_quick_task_locations.ts',
    filename: '20260728094925_quick_task_locations.sql',
    normalizedMd5: '6be23160c9ad8d108b7d28e9af3d03e4',
  },
] as const;

function normalizedSql(filename: string): string {
  return readFileSync(resolve(migrationRoot, filename), 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\n+$/u, '');
}

describe('applied Supabase migration history', () => {
  it.each(appliedMigrations)(
    'preserves $filename under its applied remote version',
    ({ filename, normalizedMd5 }) => {
      const migrationPath = resolve(migrationRoot, filename);

      expect(existsSync(migrationPath)).toBe(true);
      if (!existsSync(migrationPath)) {
        return;
      }

      expect(createHash('md5').update(normalizedSql(filename)).digest('hex')).toBe(
        normalizedMd5,
      );
    },
  );

  it.each(appliedMigrations)(
    'points $wrapper at $filename',
    ({ wrapper, filename }) => {
      expect(readFileSync(resolve(wrapperRoot, wrapper), 'utf8')).toContain(filename);
    },
  );

  it('preserves the final RBAC and Knex bookkeeping invariants across forward history', () => {
    const rbacFilenames = [
      '20260727203157_rbac_workflows.sql',
      '20260727203332_rbac_workflows_advisor_fixes.sql',
      '20260727205116_restore_knex_migration_access.sql',
    ];
    const missingMigration = rbacFilenames.find(
      (filename) => !existsSync(resolve(migrationRoot, filename)),
    );
    expect(missingMigration).toBeUndefined();
    if (missingMigration) {
      return;
    }

    const rbacSql = rbacFilenames.map(normalizedSql).join('\n');

    expect(rbacSql).toContain('CREATE TABLE task_assignees');
    expect(rbacSql).toContain('CREATE TABLE role_change_log');
    expect(rbacSql).toContain('idx_task_assignees_assigned_by');
    expect(rbacSql).toContain('ALTER TABLE task_assignees FORCE ROW LEVEL SECURITY');
    expect(rbacSql).toContain('ALTER TABLE role_change_log FORCE ROW LEVEL SECURITY');
    expect(rbacSql).toContain('DROP POLICY IF EXISTS knex_migrations_no_api_access');
    expect(rbacSql).toContain('ALTER TABLE knex_migrations DISABLE ROW LEVEL SECURITY');
    expect(rbacSql).toContain(
      'ALTER TABLE knex_migrations_lock DISABLE ROW LEVEL SECURITY',
    );
  });
});
