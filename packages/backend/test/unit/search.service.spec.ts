/**
 * Search service unit tests.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SearchService } from '../../src/search/search.service';
import { DATABASE_PROVIDER } from '../../src/database/database.module';

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
    first: jest.fn(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn(),
    del: jest.fn(),
    count: jest.fn(),
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
      providers: [
        SearchService,
        { provide: DATABASE_PROVIDER, useValue: mockDb },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  describe('search (PG fallback)', () => {
    it('returns empty results when no query provided', async () => {
      qb.first
        .mockResolvedValueOnce({ count: 0 }) // task count
        .mockResolvedValueOnce({ count: 0 }); // project count

      const result = await service.search({ query: '' });
      expect(result.results).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('searches tasks by title and description', async () => {
      const mockTasks = [
        { id: 'task-1', title: 'Test Task', description: 'A test', project_id: 'p-1', status: 'todo', priority: 'medium', due_date: null },
      ];

      qb.first
        .mockResolvedValueOnce({ count: 1 })  // task count
        .mockResolvedValueOnce({ count: 0 });  // project count

      qb.limit.mockReturnThis();
      qb.offset.mockReturnThis();
      qb.orderBy.mockResolvedValueOnce(mockTasks);

      const result = await service.search({ query: 'test' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('Test Task');
      expect(result.results[0].type).toBe('task');
    });

    it('filters by projectId when provided', async () => {
      qb.first
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 0 });

      await service.search({ query: 'test', projectId: 'project-1' });

      // Verify the project filter was applied
      expect(qb.andWhere).toHaveBeenCalledWith('tasks.project_id', 'project-1');
    });

    it('returns project search results', async () => {
      const mockProjects = [
        { id: 'proj-1', name: 'My Project', description: 'A project description', status: 'active' },
      ];

      qb.first
        .mockResolvedValueOnce({ count: 0 })  // task count
        .mockResolvedValueOnce({ count: 1 });  // project count

      qb.limit.mockReturnThis();
      qb.offset.mockReturnThis();
      qb.orderBy
        .mockResolvedValueOnce([])  // tasks
        .mockResolvedValueOnce(mockProjects);  // projects

      const result = await service.search({ query: 'project', type: 'projects' });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].title).toBe('My Project');
      expect(result.results[0].type).toBe('project');
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
      await expect(
        service.removeDocument('task-1', 'task'),
      ).resolves.toBeUndefined();
    });
  });
});
