import { FolderService } from '../../src/folder/folder.service';
import { ProjectService } from '../../src/project/project.service';
import { tenantContext } from '../../src/common/tenant-context';

const adminContext = {
  tenantId: 'tenant-1',
  userId: 'admin-1',
  membershipId: 'membership-1',
  role: 'admin' as const,
  permissions: ['*'],
};

function runAsAdmin<T>(operation: () => Promise<T>): Promise<T> {
  return tenantContext.run(adminContext, operation);
}

function createProtectionQuery(firstRow: Record<string, unknown>) {
  const query: any = {};
  for (const method of [
    'where',
    'andWhere',
    'whereNull',
    'leftJoin',
    'join',
    'select',
    'clearSelect',
    'count',
    'clone',
    'orderBy',
    'limit',
    'offset',
    'update',
    'groupBy',
  ]) {
    query[method] = jest.fn(() => query);
  }
  query.modify = jest.fn((callback: (builder: typeof query) => void) => {
    callback(query);
    return query;
  });
  query.first = jest.fn().mockResolvedValue(firstRow);
  query.returning = jest.fn().mockResolvedValue([firstRow]);
  query.then = (resolve: (value: unknown[]) => unknown) => Promise.resolve([]).then(resolve);
  return query;
}

describe('System container protection', () => {
  const projectQuery = createProtectionQuery({ count: 0 });
  const folderQuery = createProtectionQuery({
    id: 'folder-1',
    is_system_general: true,
  });
  const projectDb = Object.assign(jest.fn(() => projectQuery), {
    raw: jest.fn(),
  });
  const folderDb = jest.fn(() => folderQuery);
  const projectService = new ProjectService(projectDb as never);
  const folderService = new FolderService(folderDb as never);

  beforeEach(() => {
    jest.clearAllMocks();
    projectQuery.first.mockResolvedValue({ count: 0 });
    folderQuery.first.mockResolvedValue({
      id: 'folder-1',
      is_system_general: true,
    });
  });

  it('excludes system projects from normal project lists', async () => {
    await runAsAdmin(() => projectService.findAll({ workspaceId: 'dept-1' }));

    expect(projectQuery.where).toHaveBeenCalledWith('projects.is_system', false);
  });

  it('filters hidden system projects from ordinary reads', async () => {
    projectQuery.first.mockResolvedValueOnce({ id: 'project-1', is_system: true });

    await runAsAdmin(() => projectService.findById('project-1'));

    expect(projectQuery.where).toHaveBeenCalledWith('projects.is_system', false);
  });

  it('keeps the system General folder readable', async () => {
    await expect(runAsAdmin(() => folderService.findById('folder-1'))).resolves.toMatchObject({
      id: 'folder-1',
      is_system_general: true,
    });
  });

  it('rejects renaming the system General folder', async () => {
    await expect(
      runAsAdmin(() => folderService.update('folder-1', { name: 'Renamed' })),
    ).rejects.toThrow('The General folder is managed by the system');
  });

  it('rejects updating a hidden system project', async () => {
    projectQuery.first.mockResolvedValueOnce({
      id: 'project-1',
      is_system: true,
    });

    await expect(
      runAsAdmin(() => projectService.update('project-1', { name: 'Renamed' })),
    ).rejects.toThrow('System projects are managed automatically');
  });

  it('rejects deleting a hidden system project', async () => {
    projectQuery.first.mockResolvedValueOnce({
      id: 'project-1',
      is_system: true,
    });

    await expect(runAsAdmin(() => projectService.remove('project-1'))).rejects.toThrow(
      'System projects are managed automatically',
    );
  });

  it('rejects archiving the system General folder', async () => {
    await expect(
      runAsAdmin(() => folderService.update('folder-1', { isArchived: true })),
    ).rejects.toThrow('The General folder is managed by the system');
  });

  it('rejects deleting the system General folder', async () => {
    await expect(runAsAdmin(() => folderService.remove('folder-1'))).rejects.toThrow(
      'The General folder is managed by the system',
    );
  });
});
