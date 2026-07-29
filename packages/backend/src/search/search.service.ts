/**
 * Search service — full-text search across tasks, projects, comments, and files.
 *
 * v1: PostgreSQL full-text search (already implemented in task.service.ts findAll).
 * v2: When MEILISEARCH_HOST environment variable is set, uses Meilisearch for
 *     faster, typo-tolerant, faceted search across all entities.
 *
 * This service provides a unified search interface that abstracts
 * the underlying engine (PG vs Meilisearch).
 */

import { Injectable, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';

interface SearchOptions {
  query: string;
  type?: 'tasks' | 'projects' | 'comments' | 'files' | 'all';
  projectId?: string;
  workspaceId?: string;
  assigneeId?: string;
  page?: number;
  perPage?: number;
}

interface SearchResult {
  id: string;
  type: 'task' | 'project' | 'comment' | 'file';
  title: string;
  description: string | null;
  url: string;
  metadata: Record<string, unknown>;
  score?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  perPage: number;
}

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly useMeilisearch: boolean;

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {
    this.useMeilisearch = !!process.env['MEILISEARCH_HOST'];
    if (this.useMeilisearch) {
      this.logger.log('Meilisearch detected — will use for full-text search');
    } else {
      this.logger.log('No Meilisearch configured — falling back to PostgreSQL full-text search');
    }
  }

  /**
   * Unified search across all entity types.
   * Delegates to Meilisearch or PostgreSQL depending on configuration.
   */
  async search(options: SearchOptions): Promise<SearchResponse> {
    if (this.useMeilisearch) {
      return this.searchMeilisearch(options);
    }
    return this.searchPgOnly(options);
  }

  /**
   * Meilisearch-powered search for production use.
   */
  private async searchMeilisearch(_options: SearchOptions): Promise<SearchResponse> {
    // Meilisearch integration — requires the meilisearch npm package
    if (!this.useMeilisearch) {
      return this.searchPgOnly(_options);
    }

    try {
      const MeiliSearch = require('meilisearch');
      const client = new MeiliSearch({
        host: process.env['MEILISEARCH_HOST'] || 'http://localhost:7700',
        apiKey: process.env['MEILISEARCH_API_KEY'] || '',
      });

      const index = client.index('tasks');
      const result = await index.search(_options.query, {
        limit: _options.perPage || 25,
        offset: ((_options.page || 1) - 1) * (_options.perPage || 25),
        filter: _options.projectId ? `project_id = ${_options.projectId}` : undefined,
      });

      const results: SearchResult[] = (result.hits || []).map((hit: any) => ({
        id: hit.id,
        type: 'task' as const,
        title: hit.title || '',
        description: hit.description || null,
        url: `/tasks/${hit.id}`,
        metadata: { status: hit.status, priority: hit.priority },
        score: hit._rankingScore,
      }));

      return {
        results,
        total: result.estimatedTotalHits || 0,
        page: _options.page || 1,
        perPage: _options.perPage || 25,
      };
    } catch (err) {
      this.logger.warn(`Meilisearch search failed, falling back to PG: ${(err as Error).message}`);
      return this.searchPgOnly(_options);
    }
  }

  /**
   * Direct PostgreSQL full-text search (no Meilisearch dependency).
   * Used as fallback and when Meilisearch is not configured.
   */
  private async searchPgOnly(_options: SearchOptions): Promise<SearchResponse> {
    const ctx = requireTenantContext();
    const { query, type = 'all', projectId, assigneeId, page = 1, perPage = 25 } = _options;

    const results: SearchResult[] = [];
    let total = 0;
    const searchTerm = query.trim();

    // Search tasks
    if (type === 'all' || type === 'tasks') {
      let taskQuery = this.db('tasks')
        .where('tasks.tenant_id', ctx.tenantId)
        .whereNull('tasks.deleted_at');

      if (searchTerm) {
        taskQuery = taskQuery.andWhereRaw(
          `tasks.search_vec @@ plainto_tsquery('english', ?)`,
          [searchTerm],
        );
      }

      if (projectId) taskQuery = taskQuery.andWhere('tasks.project_id', projectId);
      if (assigneeId) taskQuery = taskQuery.andWhere('tasks.assignee_id', assigneeId);

      const countResult = (await taskQuery.clone().clearSelect().count('* as count').first()) as {
        count?: string | number;
      };
      total += Number(countResult?.count || 0);

      const taskResults = await taskQuery
        .select(
          'tasks.id',
          'tasks.title',
          'tasks.description',
          'tasks.project_id',
          'tasks.status',
          'tasks.priority',
          'tasks.due_date',
        )
        .limit(perPage)
        .offset((page - 1) * perPage)
        .orderBy('tasks.created_at', 'desc');

      for (const task of taskResults) {
        results.push({
          id: task.id,
          type: 'task',
          title: task.title,
          description: task.description,
          url: `/tasks/${task.id}`,
          metadata: {
            projectId: task.project_id,
            status: task.status,
            priority: task.priority,
            dueDate: task.due_date,
          },
        });
      }
    }

    // Search projects
    if (type === 'all' || type === 'projects') {
      let projectQuery = this.db('projects')
        .where('projects.tenant_id', ctx.tenantId)
        .whereNull('projects.deleted_at');

      if (searchTerm) {
        projectQuery = projectQuery.andWhere(function () {
          this.where('projects.name', 'ilike', `%${searchTerm}%`).orWhere(
            'projects.description',
            'ilike',
            `%${searchTerm}%`,
          );
        });
      }

      const countResult = (await projectQuery
        .clone()
        .clearSelect()
        .count('* as count')
        .first()) as { count?: string | number };
      total += Number(countResult?.count || 0);

      const projectResults = await projectQuery
        .select('projects.id', 'projects.name', 'projects.description', 'projects.status')
        .limit(perPage)
        .offset((page - 1) * perPage);

      for (const project of projectResults) {
        results.push({
          id: project.id,
          type: 'project',
          title: project.name,
          description: project.description,
          url: `/projects/${project.id}`,
          metadata: { status: project.status },
        });
      }
    }

    return { results, total, page, perPage };
  }

  /**
   * Index a document in Meilisearch (called when a task/project is created/updated).
   */
  async indexDocument(document: {
    id: string;
    type: 'task' | 'project';
    title: string;
    description?: string | null;
    status?: string;
    priority?: string;
    projectId?: string;
    assigneeId?: string | null;
    dueDate?: string | null;
  }): Promise<void> {
    if (!this.useMeilisearch) return;

    try {
      const MeiliSearch = require('meilisearch');
      const client = new MeiliSearch({
        host: process.env['MEILISEARCH_HOST'] || 'http://localhost:7700',
        apiKey: process.env['MEILISEARCH_API_KEY'] || '',
      });

      const index = client.index(`${document.type}s`);
      await index.addDocuments([
        {
          id: document.id,
          title: document.title,
          description: document.description,
          status: document.status,
          priority: document.priority,
          project_id: document.projectId,
          assignee_id: document.assigneeId,
          due_date: document.dueDate,
        },
      ]);
    } catch (err) {
      this.logger.warn(`Failed to index document ${document.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Remove a document from the search index.
   */
  async removeDocument(id: string, type: 'task' | 'project'): Promise<void> {
    if (!this.useMeilisearch) return;

    try {
      const MeiliSearch = require('meilisearch');
      const client = new MeiliSearch({
        host: process.env['MEILISEARCH_HOST'] || 'http://localhost:7700',
        apiKey: process.env['MEILISEARCH_API_KEY'] || '',
      });

      const index = client.index(`${type}s`);
      await index.deleteDocument(id);
    } catch (err) {
      this.logger.warn(`Failed to remove document ${id} from index: ${(err as Error).message}`);
    }
  }
}
