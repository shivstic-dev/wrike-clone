/**
 * Project service — manages projects within folders.
 */

import { Injectable, NotFoundException, ForbiddenException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import { applyTaskAccessScope, applyVisibilityScope } from '../common/visibility.scope';
import type {
  CreateProjectInput,
  UpdateProjectRequest,
  PaginatedResponse,
} from '@wrike-clone/shared';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findAll(params: {
    folderId?: string;
    workspaceId?: string;
    page?: number;
    perPage?: number;
    status?: string;
  }) {
    const ctx = requireTenantContext();
    const { folderId, workspaceId, page = 1, perPage = 25, status } = params;

    let query = this.db('projects')
      .where('projects.tenant_id', ctx.tenantId)
      .whereNull('projects.deleted_at')
      .where('projects.is_system', false);

    // Apply visibility scope
    query = query.leftJoin('folders', 'projects.folder_id', 'folders.id').select('projects.*'); // re-select after join

    query = applyVisibilityScope(query, ctx, 'folders.workspace_id', 'projects.visibility');

    if (folderId) query = query.andWhere('projects.folder_id', folderId);
    if (workspaceId) query = query.andWhere('folders.workspace_id', workspaceId);
    if (status) query = query.andWhere('projects.status', status);

    const countResult = (await query.clone().clearSelect().count('projects.id').first()) as
      { count?: string | number } | undefined;
    const projects = await query
      .select('projects.*', this.db.raw('row_to_json(u.*) as owner'))
      .leftJoin({ u: 'users' }, 'projects.owner_id', 'u.id')
      .orderBy('projects.created_at', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage);

    const total = Number(countResult?.count || 0);
    return {
      data: projects,
      meta: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
    };
  }

  async findById(id: string, options: { includeSystem?: boolean } = {}) {
    const ctx = requireTenantContext();
    const project = await this.db('projects')
      .leftJoin('folders', 'projects.folder_id', 'folders.id')
      .where('projects.id', id)
      .andWhere('projects.tenant_id', ctx.tenantId)
      .whereNull('projects.deleted_at')
      .select('projects.*', 'folders.workspace_id as department_id')
      .modify((qb: any) => {
        if (!options.includeSystem) qb.where('projects.is_system', false);
        if (ctx.role !== 'admin') {
          applyVisibilityScope(qb, ctx, 'folders.workspace_id', 'projects.visibility');
        }
      })
      .first();

    if (!project) throw new NotFoundException('Project not found');

    // Get task counts by status
    let taskCountQuery = this.db('tasks').where({
      project_id: id,
      tenant_id: ctx.tenantId,
      deleted_at: null,
    });
    if (ctx.role !== 'admin') {
      taskCountQuery = applyTaskAccessScope(taskCountQuery, ctx);
    }
    const taskCounts = await taskCountQuery.select('status').count('* as count').groupBy('status');

    return { ...project, taskCounts };
  }

  async create(input: CreateProjectInput) {
    const ctx = requireTenantContext();

    const folder = await this.db('folders')
      .where({ id: input.folderId, tenant_id: ctx.tenantId })
      .first();
    if (!folder) throw new NotFoundException('Folder not found');

    const id = uuidv4();
    const [project] = await this.db('projects')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        folder_id: input.folderId,
        owner_id: ctx.userId,
        name: input.name,
        description: input.description || null,
        start_date: input.startDate || null,
        due_date: input.dueDate || null,
        priority: input.priority || 'low',
        budget: input.budget || null,
        visibility: 'department', // default: department-only
      })
      .returning('*');
    this.logger.log(`Project ${id} created in folder ${input.folderId}`);
    return project;
  }

  async update(id: string, input: UpdateProjectRequest) {
    const ctx = requireTenantContext();
    const existing = await this.findById(id, { includeSystem: true });
    if (existing.is_system) {
      throw new ForbiddenException('System projects are managed automatically');
    }
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates['name'] = input.name;
    if (input.description !== undefined) updates['description'] = input.description;
    if (input.status !== undefined) updates['status'] = input.status;
    if (input.startDate !== undefined) updates['start_date'] = input.startDate;
    if (input.dueDate !== undefined) updates['due_date'] = input.dueDate;
    if (input.priority !== undefined) updates['priority'] = input.priority;
    if (input.budget !== undefined) updates['budget'] = input.budget;
    if (input.actualCost !== undefined) updates['actual_cost'] = input.actualCost;
    if (input.visibility !== undefined) updates['visibility'] = input.visibility;
    if (input.status === 'completed') updates['completed_at'] = new Date();

    const [project] = await this.db('projects')
      .where({ id, tenant_id: ctx.tenantId })
      .update(updates)
      .returning('*');
    return project;
  }

  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const existing = await this.findById(id, { includeSystem: true });
    if (existing.is_system) {
      throw new ForbiddenException('System projects are managed automatically');
    }
    await this.db('projects')
      .where({ id, tenant_id: ctx.tenantId })
      .update({ deleted_at: new Date() });
    this.logger.log(`Project ${id} deleted`);
  }
}
