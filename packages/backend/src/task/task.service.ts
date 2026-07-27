/**
 * Task service — core business logic for work items.
 * All queries are scoped to the current tenant via RLS and the tenant context.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
import { DepartmentAccessService } from '../rbac/department-access.service';

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

  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  /**
   * Find tasks with filtering, sorting, and pagination.
   */
  async findAll(filter: TaskFilterInput) {
    const ctx = requireTenantContext();
    const tenantAdmin = await this.departmentAccess.isTenantAdmin();
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
      departmentId,
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
      .leftJoin('folders', 'projects.folder_id', 'folders.id')
      .leftJoin('workspaces', 'tasks.department_id', 'workspaces.id');

    if (!tenantAdmin) {
      query = applyVisibilityScope(
        query,
        { ...ctx, role: 'member' },
        'tasks.department_id',
        'tasks.visibility',
      );
    }

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
    if (departmentId) {
      query = query.andWhere((builder) =>
        builder.where('tasks.department_id', departmentId).orWhere('tasks.visibility', 'global'),
      );
    }
    if (search) {
      query = query.andWhereRaw(
        `to_tsvector('english', coalesce(tasks.title, '') || ' ' || coalesce(tasks.description, '')) @@ plainto_tsquery('english', ?)`,
        [search],
      );
    }

    // Count total
    const countResult = (await query.clone().clearSelect().count('tasks.id').first()) as
      { count?: string | number } | undefined;
    const total = Number(countResult?.count || 0);

    // Fetch page
    const tasks = await query
      .select(
        'tasks.*',
        'workspaces.name as department_name',
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

  private async findVisibleTask(id: string) {
    const ctx = requireTenantContext();
    const tenantAdmin = await this.departmentAccess.isTenantAdmin();
    const task = await this.db('tasks')
      .leftJoin('workspaces', 'tasks.department_id', 'workspaces.id')
      .where('tasks.id', id)
      .andWhere('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at')
      .select('tasks.*', 'workspaces.name as department_name')
      .modify((qb: Knex.QueryBuilder) => {
        if (!tenantAdmin) {
          applyVisibilityScope(
            qb,
            { ...ctx, role: 'member' },
            'tasks.department_id',
            'tasks.visibility',
          );
        }
      })
      .first();
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  /**
   * Get a single task by ID with full details.
   */
  async findById(id: string) {
    const task = await this.findVisibleTask(id);

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Fetch related data
    const [comments, dependencies, assignee, attachments] = await Promise.all([
      this.findComments(id),
      this.db('task_dependencies').where({ task_id: id }),
      task.assignee_id
        ? this.db('users')
            .where({ id: task.assignee_id })
            .select('id', 'display_name', 'avatar_url')
            .first()
        : Promise.resolve(null),
      this.db('file_versions')
        .join('files', 'file_versions.file_id', 'files.id')
        .where('files.task_id', id)
        .orderBy('file_versions.created_at', 'desc'),
    ]);

    return {
      ...task,
      comments,
      dependencies,
      assignees: assignee ? [assignee] : [],
      attachments,
    };
  }

  async findComments(taskId: string) {
    const ctx = requireTenantContext();
    await this.findVisibleTask(taskId);

    return this.db('task_comments')
      .where({ task_id: taskId, tenant_id: ctx.tenantId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  /**
   * Create a new task.
   */
  /**
   * Validate that an assignee is a member of the task's workspace
   * (or the task/project is organization-visible).
   */
  private async validateAssigneeInDepartment(
    departmentId: string,
    assigneeId: string | null,
  ): Promise<void> {
    if (!assigneeId) return; // unassigned is always ok

    const ctx = requireTenantContext();
    const member = await this.db('workspace_members')
      .where({
        tenant_id: ctx.tenantId,
        workspace_id: departmentId,
        user_id: assigneeId,
      })
      .first();

    if (!member) {
      throw new BadRequestException('Assignee must be a member of the task department');
    }
  }

  async create(input: CreateTaskInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    // Verify project exists and belongs to tenant
    const project = await this.db('projects')
      .join('folders', 'projects.folder_id', 'folders.id')
      .where('projects.id', input.projectId)
      .andWhere('projects.tenant_id', ctx.tenantId)
      .select('projects.*', 'folders.workspace_id as department_id')
      .first();
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    await this.departmentAccess.assertCanCreateTask(project.department_id);
    if (input.visibility === 'global') {
      await this.departmentAccess.assertCanSetVisibility(project.department_id);
    }
    await this.validateAssigneeInDepartment(project.department_id, input.assigneeId || null);

    const [task] = await this.db('tasks')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        project_id: input.projectId,
        department_id: project.department_id,
        parent_task_id: input.parentTaskId || null,
        assignee_id: input.assigneeId || null,
        created_by_id: ctx.userId,
        title: input.title,
        description: input.description || null,
        status: input.status || TaskStatus.TODO,
        priority: input.priority || TaskPriority.LOW,
        estimated_hours: input.estimatedHours || null,
        start_date: input.startDate || null,
        due_date: input.dueDate || null,
        visibility: input.visibility || 'department',
        custom_fields: input.customFields ? JSON.stringify(input.customFields) : '{}',
        sort_order: 0,
      })
      .returning('*');

    // Log activity
    await this.logActivity(ctx.userId, 'task', id, 'task:created', {});
    if (task.assignee_id) {
      await this.logActivity(ctx.userId, 'task', id, 'task:assigned', {
        assigneeId: { old: null, new: task.assignee_id },
      });
      await this.createAssignmentNotification(task);
    }

    this.logger.log(`Task ${id} created in project ${input.projectId}`);
    return task;
  }

  /**
   * Update a task (partial update — only provided fields change).
   */
  async update(id: string, input: UpdateTaskInput) {
    const ctx = requireTenantContext();
    const existing = await this.findVisibleTask(id);
    const requestedFields = Object.keys(input as Record<string, unknown>);
    const statusOnly = requestedFields.length === 1 && requestedFields[0] === 'status';

    if (statusOnly) {
      await this.departmentAccess.assertCanChangeStatus(
        existing.department_id,
        existing.assignee_id,
      );
    } else {
      await this.departmentAccess.assertCanManageTask(existing.department_id);
    }
    if (input.visibility !== undefined && input.visibility !== existing.visibility) {
      await this.departmentAccess.assertCanSetVisibility(existing.department_id);
    }
    if (input.assigneeId !== undefined && input.assigneeId !== existing.assignee_id) {
      await this.validateAssigneeInDepartment(existing.department_id, input.assigneeId);
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
      visibility: 'visibility',
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

    // Auto-set completed_at when moved to completed.
    if (updates['status'] === 'completed' && existing.status !== 'completed') {
      updates['completed_at'] = new Date();
    } else if (updates['status'] && updates['status'] !== 'completed') {
      updates['completed_at'] = null;
    }
    updates['updated_at'] = new Date();

    const [updated] = await this.db('tasks')
      .where({ id, tenant_id: ctx.tenantId })
      .update(updates)
      .returning('*');

    // Log activity
    if (Object.keys(changes).length > 0) {
      await this.logActivity(ctx.userId, 'task', id, 'task:updated', changes);
      if (changes['status']) {
        await this.logActivity(ctx.userId, 'task', id, 'task:status:changed', {
          status: changes['status'],
        });
      }
      if (changes['assigneeId']) {
        await this.logActivity(ctx.userId, 'task', id, 'task:assigned', {
          assigneeId: changes['assigneeId'],
        });
      }
    }

    if (changes['assigneeId'] || changes['priority']) {
      await this.db('notification_log')
        .where({ tenant_id: ctx.tenantId, task_id: id })
        .andWhere('rule_type', 'like', 'priority_%')
        .del();
      if (updated.assignee_id) {
        await this.createAssignmentNotification(updated);
      }
    }

    return updated;
  }

  /**
   * Delete a task (soft-delete).
   */
  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const existing = await this.findVisibleTask(id);
    await this.departmentAccess.assertCanManageTask(existing.department_id);

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
    const existingTasks = await this.db('tasks')
      .whereIn('id', input.taskIds)
      .andWhere('tenant_id', ctx.tenantId)
      .whereNull('deleted_at');
    if (existingTasks.length !== input.taskIds.length) {
      throw new NotFoundException('One or more tasks were not found');
    }

    const updateFields = Object.keys(input.updates as Record<string, unknown>);
    const statusOnly = updateFields.length === 1 && updateFields[0] === 'status';
    for (const task of existingTasks) {
      if (statusOnly) {
        await this.departmentAccess.assertCanChangeStatus(task.department_id, task.assignee_id);
      } else {
        await this.departmentAccess.assertCanManageTask(task.department_id);
      }
      if (input.updates.visibility !== undefined && input.updates.visibility !== task.visibility) {
        await this.departmentAccess.assertCanSetVisibility(task.department_id);
      }
      if (input.updates.assigneeId !== undefined && input.updates.assigneeId !== task.assignee_id) {
        await this.validateAssigneeInDepartment(task.department_id, input.updates.assigneeId);
      }
    }

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
        visibility: 'visibility',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        const value = (input.updates as any)[key];
        if (value !== undefined) {
          dbUpdates[dbField] = value;
        }
      }

      if (dbUpdates['status'] === 'completed') {
        dbUpdates['completed_at'] = new Date();
      } else if (dbUpdates['status']) {
        dbUpdates['completed_at'] = null;
      }
      dbUpdates['updated_at'] = new Date();

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
          if (input.updates.status !== undefined) {
            await this.logActivity(ctx.userId, 'task', task.id, 'task:status:changed', {
              status: { new: input.updates.status },
            });
          }
          if (input.updates.assigneeId !== undefined) {
            await this.logActivity(ctx.userId, 'task', task.id, 'task:assigned', {
              assigneeId: { new: input.updates.assigneeId },
            });
          }
          if (input.updates.assigneeId !== undefined || input.updates.priority !== undefined) {
            await this.db('notification_log')
              .where({ tenant_id: ctx.tenantId, task_id: task.id })
              .andWhere('rule_type', 'like', 'priority_%')
              .del();
            if (task.assignee_id) await this.createAssignmentNotification(task);
          }
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
            visibility: 'visibility',
          })) {
            const value = (input.updates as any)[key];
            if (value !== undefined) {
              updates[dbField] = value;
            }
          }

          if (Object.keys(updates).length > 0) {
            if (updates['status'] === 'completed' && existing.status !== 'completed') {
              updates['completed_at'] = new Date();
            } else if (updates['status'] && updates['status'] !== 'completed') {
              updates['completed_at'] = null;
            }
            updates['updated_at'] = new Date();

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
    await this.departmentAccess.assertCanManageTask(task.department_id);
    await this.departmentAccess.assertCanManageTask(dependsOn.department_id);

    // Prevent self-dependency
    if (input.taskId === input.dependsOnTaskId) {
      throw new BadRequestException('A task cannot depend on itself');
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
    await this.departmentAccess.assertCanManageTask(dep.department_id);

    await this.db('task_dependencies').where({ id }).del();
  }

  /**
   * Add a comment to a task.
   */
  async addComment(input: CreateCommentInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    await this.findVisibleTask(input.taskId);

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

  private async createAssignmentNotification(task: Record<string, any>): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('notifications').insert({
      id: uuidv4(),
      tenant_id: ctx.tenantId,
      user_id: task.assignee_id,
      type:
        task.priority === TaskPriority.HIGH || task.priority === TaskPriority.CRITICAL
          ? 'priority_task_assigned'
          : 'task_assigned',
      title:
        task.priority === TaskPriority.CRITICAL
          ? 'Critical task assigned'
          : task.priority === TaskPriority.HIGH
            ? 'High-priority task assigned'
            : 'Task assigned',
      body: task.title,
      data: JSON.stringify({
        entityType: 'task',
        entityId: task.id,
        departmentId: task.department_id,
        priority: task.priority,
      }),
      priority:
        task.priority === TaskPriority.CRITICAL ? 2 : task.priority === TaskPriority.HIGH ? 1 : 0,
    });
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
