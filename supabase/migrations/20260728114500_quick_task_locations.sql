ALTER TABLE folders
  ADD COLUMN IF NOT EXISTS is_system_general BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ux_folders_system_general
  ON folders (tenant_id, workspace_id)
  WHERE is_system_general = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_projects_system_folder
  ON projects (tenant_id, folder_id)
  WHERE is_system = true AND deleted_at IS NULL;

WITH ranked_homes AS (
  SELECT tenant_id, task_id, folder_id,
         row_number() OVER (
           PARTITION BY tenant_id, task_id
           ORDER BY is_home DESC, folder_id
         ) AS row_number
  FROM task_folder_links
)
UPDATE task_folder_links link
SET is_home = (ranked.row_number = 1)
FROM ranked_homes ranked
WHERE link.tenant_id = ranked.tenant_id
  AND link.task_id = ranked.task_id
  AND link.folder_id = ranked.folder_id;

INSERT INTO task_folder_links (tenant_id, task_id, folder_id, is_home)
SELECT t.tenant_id, t.id, p.folder_id, true
FROM tasks t
JOIN projects p ON p.id = t.project_id AND p.tenant_id = t.tenant_id
WHERE NOT EXISTS (
    SELECT 1
    FROM task_folder_links existing
    WHERE existing.tenant_id = t.tenant_id
      AND existing.task_id = t.id
      AND existing.is_home = true
  )
  AND t.deleted_at IS NULL
ON CONFLICT (task_id, folder_id)
DO UPDATE SET is_home = true;

CREATE UNIQUE INDEX IF NOT EXISTS ux_task_folder_links_home
  ON task_folder_links (tenant_id, task_id)
  WHERE is_home = true;

CREATE INDEX IF NOT EXISTS idx_task_folder_links_home_folder
  ON task_folder_links (tenant_id, folder_id, task_id)
  WHERE is_home = true;
