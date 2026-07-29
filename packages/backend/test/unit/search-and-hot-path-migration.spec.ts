import type { Knex } from 'knex';

function loadMigration(): {
  up: (knex: Knex) => Promise<void>;
  down: (knex: Knex) => Promise<void>;
} {
  return require('../../src/migrations/019_search_and_hot_path_indexes') as {
    up: (knex: Knex) => Promise<void>;
    down: (knex: Knex) => Promise<void>;
  };
}

function recordingKnex(statements: string[]): Knex {
  return {
    raw: async (statement: string) => statements.push(statement),
  } as unknown as Knex;
}

describe('search and hot-path Knex migration', () => {
  it('idempotently provisions search support and the six production indexes', async () => {
    const statements: string[] = [];

    await loadMigration().up(recordingKnex(statements));

    expect(statements).toHaveLength(1);
    const sql = statements[0]!.replace(/\r\n/g, '\n');

    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS extensions;');
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;');
    expect(sql).toMatch(
      /IF extension_schema <> 'extensions' THEN\s+ALTER EXTENSION pg_trgm SET SCHEMA extensions;/,
    );
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS search_vec tsvector');
    expect(sql.match(/\bCREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\b/gi)).toHaveLength(6);
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_search_vec ON tasks USING GIN (search_vec);',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm\n      ON tasks USING GIN (title extensions.gin_trgm_ops);',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_tasks_tenant_project_status_due\n      ON tasks (tenant_id, project_id, status, due_date)\n      WHERE deleted_at IS NULL;',
    );
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS idx_tasks_tenant_assignee_open_due\n      ON tasks (tenant_id, assignee_id, due_date)\n      WHERE deleted_at IS NULL AND status <> 'completed';",
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_task_comments_tenant_task_created\n      ON task_comments (tenant_id, task_id, created_at DESC);',
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user_unread\n      ON notifications (tenant_id, user_id, created_at DESC)\n      WHERE is_read = false;',
    );
  });

  it('does not remove schema objects that may predate Knex parity', async () => {
    const statements: string[] = [];

    await loadMigration().down(recordingKnex(statements));

    expect(statements).toEqual([]);
  });
});
