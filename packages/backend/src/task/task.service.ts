/**
 * Task service — core business logic for work items.
 * All queries are scoped to the current tenant via RLS and the tenant context.
 */

import {
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import { applyVisibilityScope } from '../common/visibility.scope';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilterInput,
  BulkTaskUpdateInput,
  CreateDependencyInput,
  CreateCommentInput,
} from '@wrike-clone/shared';
import { TaskStatus, TaskPriority } from '@wrike-clone/shared';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  // Whitelist of columns the task list may be sorted by, mapped to their
  // fully-qualified form. findAll() joins tasks -> projects -> folders -> users,
  // several of which share column names (e.g. created_at), so an unqualified
  // ORDER BY column is ambiguous to Postgres and throws a 500. Qualifying via
  // this whitelist also prevents passing an arbitrary column name straight
  // from the query string into the query builder.
  private static readonly SORTABLE_COLUMNS: Record<string, string> = {
    created_at: 'tasks.created_at',
    updated_at: 'tasks.updated_at',
    due_date: 'tasks.due_date',
    start_date: 'tasks.start_date',
    priority: 'tasks.priority',
    status: 'tasks.status',
    title: 'tasks.title',
    sort_order: 'tasks.sort_order',
  };

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  /**
   * Find tasks with filtering, sorting, and pagination.
   */
  async findAll(filter: TaskFilterInput) {
    const ctx = requireTenantContext();
    const {
      page = 1,
      perPage = 25,
      projectId,
      assigneeId,
      status,
      priority,
      search,
      dueDateBefore,
      dueDateAfter,
      folderId,
      sortBy = 'created_at',
      sortDirection = 'desc',
    } = filter as typeof filter & { sortBy?: string; sortDirection?: string };

    const sortColumn = TaskService.SORTABLE_COLUMNS[sortBy] ?? 'tasks.created_at';
    const sortDir = sortDirection === 'asc' ? 'asc' : 'desc';

    let query = this.db('tasks')
      .where('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at');

    // Apply visibility scope (Phase 1: department-based access control)
    // Join through project → folder → workspace to resolve workspace_id
    query = query
      .leftJoin('projects', 'tasks.project_id', 'projects.id')
      .leftJoin('folders', 'projects.folder_id', 'folders.id');

    query = applyVisibilityScope(query, ctx, 'folders.workspace_id', 'tasks.visibility');

    // Apply filters
    if (projectId) query = query.andWhere('tasks.project_id', projectId);
    if (assigneeId) query = query.andWhere('tasks.assignee_id', assigneeId);
    if (status && status.length > 0) query = query.whereIn('tasks.status', status);
    if (priority && priority.length > 0) query = query.whereIn('tasks.priority', priority);
    if (dueDateBefore) query = query.andWhere('tasks.due_date', '<=', dueDateBefore);
    if (dueDateAfter) query = query.andWhere('tasks.due_date', '>=', dueDateAfter);
    if (folderId) {
      query = query
        .join('task_folder_links', 'tasks.id', 'task_folder_links.task_id')
        .andWhere('task_folder_links.folder_id', folderId);
    }
    if (search) {
      query = query.andWhereRaw(
        `to_tsvector('english', coalesce(tasks.title, '') || ' ' || coalesce(tasks.description, '')) @@ plainto_tsquery('english', ?)`,
        [search],
      );
    }

    // Count total
    const countResult = await query.clone().clearSelect().count('tasks.id').first() as { count?: string | number } | undefined;
    const total = Number(countResult?.count || 0);

    // Fetch page
    const tasks = await query
      .select(
        'tasks.*',
        this.db.raw(
          `json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url) as assignee`,
        ),
      )
      .leftJoin({ u: 'users' }, 'tasks.assignee_id', 'u.id')
      .orderBy(sortColumn, sortDir)
      .limit(perPage)
      .offset((page - 1) * perPage);

    return {
      data: tasks,
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };
  }

  /**
   * Get a single task by ID with full details.
   */
  async findById(id: string) {
    const ctx = requireTenantContext();
    const task = await this.db('tasks')
      .leftJoin('projects', 'tasks.project_id', 'projects.id')
      .leftJoin('folders', 'projects.folder_id', 'folders.id')
      .where('tasks.id', id)
      .andWhere('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at')
      .select('tasks.*')
      .modify((qb: any) => {
        if (ctx.role !== 'admin') applyVisibilityScope(qb, ctx, 'folders.workspace_id', 'tasks.visibility');
      })
      .first();

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Fetch related data
    const [comments, dependencies, assignees, attachments] = await Promise.all([
      this.db('task_comments').where({ task_id: id, deleted_at: null }).orderBy('created_at', 'asc'),
      this.db('task_dependencies').where({ task_id: id }),
      this.db('task_assignees').where({ task_id: id }),
      this.db('file_versions')
        .join('files', 'file_versions.file_id', 'files.id')
        .where('files.task_id', id)
        .orderBy('file_versions.created_at', 'desc'),
    ]);

    return {
      ...task,
      comments,
      dependencies,
      assignees,
      attachments,
    };
  }

  /**
   * Create a new task.
   */
  /**
   * Validate that an assignee is a member of the task's workspace
   * (or the task/project is organization-visible).
   */
  private async validateAssigneeInWorkspace(projectId: string, assigneeId: string | null): Promise<void> {
    if (!assigneeId) return; // unassigned is always ok

    const ctx = requireTenantContext();

    // Find the workspace for this project
    const project = await this.db('projects')
      .where({ id: projectId, tenant_id: ctx.tenantId })
      .first();

    if (!project) return; // will be caught by the creating code

    // Organization-visible projects allow any member as assignee
    if (project.visibility === 'organization') return;

    // For department-visible projects, assignee must be a workspace member
    const folder = await this.db('folders')
      .where({ id: project.folder_id, tenant_id: ctx.tenantId })
      .first();

    if (!folder) return;

    const member = await this.db('workspace_members')
      .where({ workspace_id: folder.workspace_id, user_id: assigneeId })
      .first();

    if (!member) {
      throw new Error('Assignee must be a member of the project\'s workspace (department)');
    }
  }

  async create(input: CreateTaskInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    // Verify project exists and belongs to tenant
    const project = await this.db('projects')
      .where({ id: input.projectId, tenant_id: ctx.tenantId })
      .first();
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate assignee belongs to the task's workspace (G8 fix)
    await this.validateAssigneeInWorkspace(input.projectId, input.assigneeId || null);

    const [task] = await this.db('tasks')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        project_id: input.projectId,
        parent_task_id: input.parentTaskId || null,
        assignee_id: input.assigneeId || null,
        created_by_id: ctx.userId,
        title: input.title,
        description: input.description || null,
        status: input.status || TaskStatus.TODO,
        priority: input.priority || TaskPriority.NONE,
        estimated_hours: input.estimatedHours || null,
        start_date: input.startDate || null,
        due_date: input.dueDate || null,
        visibility: project.visibility || 'department', // inherit from project
        custom_fields: input.customFields ? JSON.stringify(input.customFields) : '{}',
        sort_order: 0,
      })
      .returning('*');

    // Log activity
    await this.logActivity(ctx.userId, 'task', id, 'task:created', {});

    this.logger.log(`Task ${id} created in project ${input.projectId}`);
    return task;
  }

  /**
   * Update a task (partial update — only provided fields change).
   */
  async update(id: string, input: UpdateTaskInput) {
    const ctx = requireTenantContext();
    const existing = await this.db('tasks')
      .where({ id, tenant_id: ctx.tenantId, deleted_at: null })
      .first();
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    const updates: Record<string, unknown> = {};

    const fieldMap: Record<string, string> = {
      title: 'title',
      description: 'description',
      status: 'status',
      priority: 'priority',
      assigneeId: 'assignee_id',
      estimatedHours: 'estimated_hours',
      actualHours: 'actual_hours',
      startDate: 'start_date',
      dueDate: 'due_date',
      sortOrder: 'sort_order',
      customFields: 'custom_fields',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      const value = (input as any)[key];
      if (value !== undefined) {
        const oldValue = existing[dbField];
        updates[dbField] = value;
        if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
          changes[key] = { old: oldValue, new: value };
        }
      }
    }

    if (Object.keys(changes).length === 0) {
      return existing;
    }

    // Serialize custom_fields if updating
    if (updates['custom_fields'] && typeof updates['custom_fields'] === 'object') {
      updates['custom_fields'] = JSON.stringify(updates['custom_fields']);
    }

    // Auto-set completed_at when moved to done
    if (updates['status'] === 'done' && existing.status !== 'done') {
      updates['completed_at'] = new Date();
    }

    const [updated] = await this.db('tasks')
      .where({ id, tenant_id: ctx.tenantId })
      .update(updates)
      .returning('*');

    // Log activity
    if (Object.keys(changes).length > 0) {
      await this.logActivity(ctx.userId, 'task', id, 'task:updated', changes);
    }

    return updated;
  }

  /**
   * Delete a task (soft-delete).
   */
  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const existing = await this.db('tasks')
      .where({ id, tenant_id: ctx.tenantId, deleted_at: null })
      .first();
    if (!existing) {
      throw new NotFoundException('Task not found');
    }

    await this.db('tasks').where({ id }).update({ deleted_at: new Date() });
    await this.logActivity(ctx.userId, 'task', id, 'task:deleted', {});
    this.logger.log(`Task ${id} soft-deleted`);
  }

  /**
   * Bulk update tasks (e.g., drag-drop status change on kanban).
   * Uses a single transaction for uniform changes.
   */
  async bulkUpdate(input: BulkTaskUpdateInput) {
    const ctx = requireTenantContext();

    // Check if all updates are the same (uniform change — the common case)
    const keys = Object.keys(input.updates);
    if (keys.length > 0 && input.taskIds.length > 0) {
      // Try uniform update first: UPDATE ... WHERE id = ANY(?) AND tenant_id = ?
      const dbUpdates: Record<string, unknown> = {};

      const fieldMap: Record<string, string> = {
        title: 'title',
        description: 'description',
        status: 'status',
        priority: 'priority',
        assigneeId: 'assignee_id',
        estimatedHours: 'estimated_hours',
        actualHours: 'actual_hours',
        startDate: 'start_date',
        dueDate: 'due_date',
        sortOrder: 'sort_order',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        const value = (input.updates as any)[key];
        if (value !== undefined) {
          dbUpdates[dbField] = value;
        }
      }

      // Auto-set completed_at when moved to done
      if (dbUpdates['status'] === 'done') {
        dbUpdates['completed_at'] = new Date();
      }

      // Perform a single batched UPDATE inside a transaction
      if (Object.keys(dbUpdates).length > 0) {
        const updated = await this.db.transaction(async (trx) => {
          return trx('tasks')
            .whereIn('id', input.taskIds)
            .andWhere('tenant_id', ctx.tenantId)
            .whereNull('deleted_at')
            .update(dbUpdates)
            .returning('*');
        });

        // Log activity
        for (const task of updated) {
          await this.logActivity(ctx.userId, 'task', task.id, 'task:updated', {
            bulkUpdate: { fields: Object.keys(input.updates) },
          });
        }

        return updated;
      }
    }

    // Fallback: per-row updates inside a single transaction
    return this.db.transaction(async (trx) => {
      const results = [];
      for (const taskId of input.taskIds) {
        try {
          const existing = await trx('tasks')
            .where({ id: taskId, tenant_id: ctx.tenantId, deleted_at: null })
            .first();
          if (!existing) continue;

          const updates: Record<string, unknown> = {};
          for (const [key, dbField] of Object.entries({
            status: 'status',
            priority: 'priority',
            assigneeId: 'assignee_id',
            sortOrder: 'sort_order',
          })) {
            const value = (input.updates as any)[key];
            if (value !== undefined) {
              updates[dbField] = value;
            }
          }

          if (Object.keys(updates).length > 0) {
            if (updates['status'] === 'done' && existing.status !== 'done') {
              updates['completed_at'] = new Date();
            }

            const [updated] = await trx('tasks')
              .where({ id: taskId, tenant_id: ctx.tenantId })
              .update(updates)
              .returning('*');
            results.push(updated);
          }
        } catch (err) {
          this.logger.warn(`Bulk update failed for task ${taskId}: ${(err as Error).message}`);
        }
      }
      return results;
    });
  }

  /**
   * Create a dependency between two tasks.
   */
  async createDependency(input: CreateDependencyInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    // Validate both tasks exist in tenant
    const [task, dependsOn] = await Promise.all([
      this.db('tasks').where({ id: input.taskId, tenant_id: ctx.tenantId }).first(),
      this.db('tasks').where({ id: input.dependsOnTaskId, tenant_id: ctx.tenantId }).first(),
    ]);

    if (!task || !dependsOn) {
      throw new NotFoundException('Task not found');
    }

    // Prevent self-dependency
    if (input.taskId === input.dependsOnTaskId) {
      throw new Error('A task cannot depend on itself');
    }

    const [dependency] = await this.db('task_dependencies')
      .insert({
        id,
        task_id: input.taskId,
        depends_on_task_id: input.dependsOnTaskId,
        dependency_type: input.dependencyType,
        lag_days: input.lagDays || 0,
      })
      .returning('*');

    return dependency;
  }

  /**
   * Remove a dependency.
   */
  async removeDependency(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const dep = await this.db('task_dependencies')
      .join('tasks', 'task_dependencies.task_id', 'tasks.id')
      .where('task_dependencies.id', id)
      .andWhere('tasks.tenant_id', ctx.tenantId)
      .first();

    if (!dep) {
      throw new NotFoundException('Dependency not found');
    }

    await this.db('task_dependencies').where({ id }).del();
  }

  /**
   * Add a comment to a task.
   */
  async addComment(input: CreateCommentInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    const task = await this.db('tasks')
      .where({ id: input.taskId, tenant_id: ctx.tenantId })
      .first();
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const [comment] = await this.db('task_comments')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        task_id: input.taskId,
        author_id: ctx.userId,
        content: input.content,
        parent_comment_id: input.parentCommentId || null,
        attachments: input.attachments ? `{${input.attachments.join(',')}}` : '{}',
      })
      .returning('*');

    await this.logActivity(ctx.userId, 'task', input.taskId, 'task:comment:added', {});
    return comment;
  }

  /**
   * Log an activity entry.
   */
  private async logActivity(
    actorId: string,
    entityType: string,
    entityId: string,
    action: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    try {
      const ctx = requireTenantContext();
      await this.db('activity_logs').insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        actor_id: actorId,
        entity_type: entityType,
        entity_id: entityId,
        action,
        changes: JSON.stringify(changes),
        metadata: '{}',
      });
    } catch (err) {
      this.logger.warn(`Failed to log activity: ${(err as Error).message}`);
    }
  }
}
