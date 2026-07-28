import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TaskLocationFields } from './TaskLocationFields';

const departments = [
  { id: 'department-1', name: 'Programs' },
  { id: 'department-2', name: 'Fundraising' },
];

const locations = [
  {
    folderId: 'general-folder',
    folderName: 'General',
    isGeneral: true,
    projects: [],
  },
  {
    folderId: 'campaigns-folder',
    folderName: 'Campaigns',
    isGeneral: false,
    projects: [{ projectId: 'spring-project', projectName: 'Spring appeal' }],
  },
];

function renderFields(folderId = '', projectId = '') {
  return renderToStaticMarkup(
    <TaskLocationFields
      departmentId="department-1"
      folderId={folderId}
      projectId={projectId}
      departments={departments}
      locations={locations}
      onDepartmentChange={vi.fn()}
      onFolderChange={vi.fn()}
      onProjectChange={vi.fn()}
    />,
  );
}

describe('TaskLocationFields', () => {
  it('renders a labelled Department to Folder to Project path with General defaults', () => {
    const markup = renderFields();

    expect(markup).toContain('<label for="quick-task-department"');
    expect(markup).toContain('<label for="quick-task-folder"');
    expect(markup).toContain('<label for="quick-task-project"');
    expect(markup).toContain('Department');
    expect(markup).toContain('Folder');
    expect(markup).toContain('Project');
    expect(markup).toContain('General (default)');
    expect(markup).toContain('General Tasks');
  });

  it('does not repeat the system General folder in folder choices', () => {
    const markup = renderFields();

    expect(markup.match(/General \(default\)/g)).toHaveLength(1);
    expect(markup).toContain('Campaigns');
  });

  it('lists projects only from the selected folder', () => {
    const markup = renderFields('campaigns-folder', 'spring-project');
    const projectSelect = markup.match(/<select[^>]*id="quick-task-project"[^>]*>/)?.[0];

    expect(markup).toContain('Spring appeal');
    expect(projectSelect).toBeDefined();
    expect(projectSelect).not.toContain('disabled');
  });
});
