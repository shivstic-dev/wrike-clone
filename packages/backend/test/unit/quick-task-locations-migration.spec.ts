import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260728094925_quick_task_locations.sql'),
  'utf8',
);

describe('quick task locations migration', () => {
  it('adds explicit system flags and one-home uniqueness', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_system_general BOOLEAN');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS is_system BOOLEAN');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_system_general');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_system_folder');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_task_folder_links_home');
  });

  it('backfills missing task home folders from the current project folder', () => {
    expect(sql).toContain('INSERT INTO task_folder_links');
    expect(sql).toContain('JOIN projects p ON p.id = t.project_id');
    expect(sql).toContain('WHERE NOT EXISTS');
  });

  it('only normalizes duplicate true homes and promotes the project-folder link', () => {
    expect(sql).toMatch(
      /WITH ranked_homes AS \([\s\S]*FROM task_folder_links\s+WHERE is_home = true/,
    );
    expect(sql).toMatch(
      /ON CONFLICT \(task_id, folder_id\)\s+DO UPDATE SET is_home = true;/,
    );
  });
});
