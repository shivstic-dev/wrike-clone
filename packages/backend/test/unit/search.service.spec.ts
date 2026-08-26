/**
 * Search service unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from '../../src/search/search.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';

const meiliSearch = jest.fn();

jest.mock(
  'meilisearch',
  () =>
    jest.fn().mockImplementation(() => ({
      index: jest.fn(() => ({ search: meiliSearch })),
    })),
  { virtual: true },
);

// Mock tenant context
jest.mock('../../src/common/tenant-context', () => ({
  requireTenantContext: jest.fn(() => ({
    tenantId: 'test-tenant',
    userId: 'test-user',
    role: 'admin',
    permissions: ['*'],
  })),
}));

function createQb() {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    whereNull: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn(),
    del: jest.fn(),
    count: jest.fn().mockReturnThis(),
    returning: jest.fn(),
    from: jest.fn(),
    select: jest.fn().mockReturnThis(),
    raw: jest.fn(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    clone: jest.fn().mockReturnThis(),
    clearSelect: jest.fn().mockReturnThis(),
    andWhereRaw: jest.fn().mockReturnThis(),
  };
}

describe('SearchService', () => {
  let service: SearchService;
  let qb: ReturnType<typeof createQb>;
  let mockDb: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    qb = createQb();

    mockDb = jest.fn().mockReturnValue(qb) as jest.Mock;
    qb.first.mockResolvedValue({ count: 0 });

    // Remove MEILISEARCH_HOST for PG-only tests
    delete process.env['MEILISEARCH_HOST'];

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: DATABASE_PROVIDER, useValue: mockDb }],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search (PG fallback)', () => {
    it('returns empty results when no query provided', async () => {
      qb.first
        .mockResolvedValueOnce({ count: 0 }) // task count
        .mockResolvedValueOnce({ count: 0 }); // project count
      qb.orderBy.mockResolvedValueOnce([]);
      qb.offset.mockReturnValueOnce(qb).mockResolvedValueOnce([]);

      const result = await service.search({ query: '' });
      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('searches tasks by title and description', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Test Task',
          description: 'A test',
          project_id: 'p-1',
          status: 'todo',
          priority: 'medium',
          due_date: null,
        },
      ];

      qb.first
        .mockResolvedValueOnce({ count: 1 }) // task count
        .mockResolvedValueOnce({ count: 0 }); // project count

      qb.limit.mockReturnThis();
      qb.offset.mockReturnValueOnce(qb).mockResolvedValueOnce([]);
      qb.orderBy.mockResolvedValueOnce(mockTasks);

      const result = await service.search({ query: 'test' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.title).toBe('Test Task');
      expect(result.results[0]!.type).toBe('task');
    });

    it('filters by projectId when provided', async () => {
      qb.first.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 });
      qb.orderBy.mockResolvedValueOnce([]);
      qb.offset.mockReturnValueOnce(qb).mockResolvedValueOnce([]);

      await service.search({ query: 'test', projectId: 'project-1' });

      // Verify the project filter was applied
      expect(qb.andWhere).toHaveBeenCalledWith('tasks.project_id', 'project-1');
    });

    it('applies shared task authorization to task rows and their count', async () => {
      const tenantContext = jest.requireMock('../../src/common/tenant-context');
      tenantContext.requireTenantContext.mockReturnValueOnce({
        tenantId: 'test-tenant',
        userId: 'manager-1',
        role: 'member',
        permissions: [],
      });
      qb.first.mockResolvedValueOnce({ count: 0 });
      qb.orderBy.mockResolvedValueOnce([]);

      await service.search({ query: '', type: 'tasks' });

      expect(qb.where).toHaveBeenCalledWith('tasks.tenant_id', 'test-tenant');
      expect(qb.andWhere.mock.calls.some(([predicate]) => typeof predicate === 'function')).toBe(
        true,
      );
      const scopeCall = qb.andWhere.mock.invocationCallOrder.find(
        (_, index) => typeof qb.andWhere.mock.calls[index]?.[0] === 'function',
      );
      expect(scopeCall).toBeLessThan(qb.clone.mock.invocationCallOrder[0]!);
    });

    it('returns project search results', async () => {
      const mockProjects = [
        {
          id: 'proj-1',
          name: 'My Project',
          description: 'A project description',
          status: 'active',
        },
      ];

      qb.first
        .mockResolvedValueOnce({ count: 0 }) // task count
        .mockResolvedValueOnce({ count: 1 }); // project count

      qb.limit.mockReturnThis();
      qb.offset.mockReturnThis();
      qb.offset.mockResolvedValueOnce(mockProjects);

      const result = await service.search({ query: 'project', type: 'projects' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.title).toBe('My Project');
      expect(result.results[0]!.type).toBe('project');
    });

    it('applies tenant-safe project visibility to both count and result rows for non-admins', async () => {
      const tenantContext = jest.requireMock('../../src/common/tenant-context');
      tenantContext.requireTenantContext.mockReturnValueOnce({
        tenantId: 'test-tenant',
        userId: 'member-1',
        role: 'member',
        permissions: [],
      });
      qb.first.mockResolvedValueOnce({ count: 1 });
      qb.offset.mockResolvedValueOnce([
        {
          id: 'visible-project',
          name: 'Visible Project',
          description: null,
          status: 'active',
        },
      ]);

      const result = await service.search({ query: '', type: 'projects' });

      expect(qb.where).toHaveBeenCalledWith('projects.tenant_id', 'test-tenant');
      expect(qb.leftJoin).toHaveBeenCalledWith('folders', 'projects.folder_id', 'folders.id');

      const visibilityCallIndex = qb.where.mock.calls.findIndex(
        ([predicate]) => typeof predicate === 'function',
      );
      expect(visibilityCallIndex).toBeGreaterThanOrEqual(0);
      const visibilityPredicate = qb.where.mock.calls[visibilityCallIndex]![0];
      const membershipSubquery = {
        select: jest.fn().mockReturnThis(),
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
      };
      let visibilityScope: { where: jest.Mock; orWhereIn: jest.Mock };
      visibilityScope = {
        where: jest.fn().mockReturnThis(),
        orWhereIn: jest.fn((_column: string, subquery: () => void): typeof visibilityScope => {
          subquery.call(membershipSubquery);
          return visibilityScope;
        }),
      };
      visibilityPredicate(visibilityScope);

      expect(visibilityScope.where).toHaveBeenCalledWith('projects.visibility', 'global');
      expect(visibilityScope.orWhereIn).toHaveBeenCalledWith(
        'folders.workspace_id',
        expect.any(Function),
      );
      expect(membershipSubquery.where).toHaveBeenCalledWith('user_id', 'member-1');
      expect(membershipSubquery.andWhere).toHaveBeenCalledWith('tenant_id', 'test-tenant');
      expect(qb.where.mock.invocationCallOrder[visibilityCallIndex]).toBeLessThan(
        qb.clone.mock.invocationCallOrder[0]!,
      );
      expect(result.total).toBe(1);
      expect(result.results.map(({ id }) => id)).toEqual(['visible-project']);
    });

    it('preserves tenant scoping while bypassing project visibility for admins', async () => {
      qb.first.mockResolvedValueOnce({ count: 0 });
      qb.offset.mockResolvedValueOnce([]);

      await service.search({ query: '', type: 'projects' });

      expect(qb.where).toHaveBeenCalledWith('projects.tenant_id', 'test-tenant');
      expect(qb.where.mock.calls.some(([predicate]) => typeof predicate === 'function')).toBe(
        false,
      );
    });
  });

  describe('search (Meilisearch configured)', () => {
    it('uses tenant-scoped PostgreSQL instead of returning untrusted index hits or totals', async () => {
      process.env['MEILISEARCH_HOST'] = 'http://meili.test';
      const module = await Test.createTestingModule({
        providers: [SearchService, { provide: DATABASE_PROVIDER, useValue: mockDb }],
      }).compile();
      const configuredService = module.get<SearchService>(SearchService);
      qb.first.mockResolvedValueOnce({ count: 0 });
      qb.orderBy.mockResolvedValueOnce([]);

      await configuredService.search({ query: '', type: 'tasks' });

      expect(meiliSearch).not.toHaveBeenCalled();
      expect(mockDb).toHaveBeenCalledWith('tasks');
      expect(qb.where).toHaveBeenCalledWith('tasks.tenant_id', 'test-tenant');
    });
  });

  describe('indexDocument', () => {
    it('skips indexing when Meilisearch is not configured', async () => {
      // MEILISEARCH_HOST is already deleted
      await expect(
        service.indexDocument({
          id: 'task-1',
          type: 'task',
          title: 'Test',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('removeDocument', () => {
    it('skips removal when Meilisearch is not configured', async () => {
      await expect(service.removeDocument('task-1', 'task')).resolves.toBeUndefined();
    });
  });
});
