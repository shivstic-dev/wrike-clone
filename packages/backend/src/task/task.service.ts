/**
 * Task service — core business logic for work items.
 * All queries are scoped to the current tenant via RLS and the tenant context.
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import { applyTaskAccessScope } from '../common/visibility.scope';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskFilterInput,
  BulkTaskUpdateInput,
  CreateDependencyInput,
  CreateCommentInput,
  MoveTaskLocationInput,
} from '@wrike-clone/shared';
import { TaskStatus, TaskPriority, HandoffStatus } from '@wrike-clone/shared';

import { DepartmentAccessService } from '../rbac/department-access.service';
import { TaskLocationService } from './task-location.service';
import { MemoryCacheService } from '../common/cache/memory-cache.service';
import { TaskCompletionService } from './task-completion.service';
import { RealtimeService } from '../realtime/realtime.service';

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

  private static readonly TASK_SELECT_COLUMNS = [
    'tasks.id',
    'tasks.tenant_id',
    'tasks.project_id',
    'tasks.department_id',
    'tasks.parent_task_id',
    'tasks.assignee_id',
    'tasks.created_by_id',
    'tasks.handoff_required',
    'tasks.handoff_status',
    'tasks.handoff_owner_id',
    'tasks.handoff_ready_at',
    'tasks.handoff_confirmed_by',
    'tasks.handoff_confirmed_at',
    'tasks.title',
    'tasks.description',
    'tasks.status',
    'tasks.priority',
    'tasks.estimated_hours',
    'tasks.actual_hours',
    'tasks.start_date',
    'tasks.due_date',
    'tasks.completed_at',
    'tasks.visibility',
    'tasks.sort_order',
    'tasks.custom_fields',
    'tasks.created_at',
    'tasks.updated_at',
    'tasks.deleted_at',
  ];

  private static buildListProjection(db: Knex): Array<string | Knex.Raw> {
    return [
      ...TaskService.TASK_SELECT_COLUMNS,
      'workspaces.name as department_name',
      'home_folder.id as folder_id',
      'home_folder.name as folder_name',
      'task_project.name as project_name',
      'task_project.is_system as is_system_project',
      db.raw(
        `CASE WHEN handoff_owner.id IS NULL THEN NULL ELSE json_build_object('id', handoff_owner.id, 'display_name', handoff_owner.display_name, 'email', handoff_owner.email) END as handoff_owner`,
      ),
      db.raw(
        `json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url) as assignee`,
      ),
    ];
  }

  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
    private readonly taskLocations: TaskLocationService,
    private readonly taskCompletion: TaskCompletionService,
    private readonly cache: MemoryCacheService,
    private readonly realtime: RealtimeService,
  ) {}

  invalidateTenantCache(tenantId: string): void {
    this.cache.invalidatePattern(`^(tasks|stats):${tenantId}`);
  }

  /**
   * Get aggregate dashboard stats for current tenant.
   * Cached for 60s.
   */
  async getDashboardStats() {
    const ctx = requireTenantContext();
    const cacheKey = `stats:${ctx.tenantId}:${ctx.userId}:${ctx.membershipId}:${ctx.role}`;
    const cached = this.cache.get<{
      total: number;
      byStatus: Record<string, number>;
      overdue: number;
    }>(cacheKey);

    if (cached) {
      return cached;
    }

    const baseQuery = applyTaskAccessScope(
      this.db('tasks').where('tasks.tenant_id', ctx.tenantId).whereNull('tasks.deleted_at'),
      ctx,
    );

    const countResult = (await baseQuery.clone().count('id as count').first()) as
      { count?: string | number } | undefined;
    const total = Number(countResult?.count || 0);

    const statusResults = await baseQuery
      .clone()
      .select('status')
      .count('id as count')
      .groupBy('status');

    const byStatus: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      completed: 0,
      cancelled: 0,
    };

    const rows = Array.isArray(statusResults) ? statusResults : [];

    for (const row of rows as Array<{ status: string; count: string | number }>) {
      if (row.status) {
        byStatus[row.status] = Number(row.count || 0);
      }
    }

    const overdueResult = (await baseQuery
      .clone()
      .where('status', '<>', 'completed')
      .andWhere('due_date', '<', new Date())
      .count('id as count')
      .first()) as { count?: string | number } | undefined;
    const overdue = Number(overdueResult?.count || 0);

    const stats = {
      total,
      byStatus,
      overdue,
    };

    this.cache.set(cacheKey, stats, 60);
    return stats;
  }

  /**
   * Find tasks with filtering, sorting, and pagination.
   */
  async findAll(filter: TaskFilterInput) {
    const ctx = requireTenantContext();
    const cacheKey = `tasks:${ctx.tenantId}:${ctx.userId}:${ctx.membershipId}:${ctx.role}:${JSON.stringify(filter)}`;
    const cached = this.cache.get<{ data: any[]; meta: any }>(cacheKey);
    if (cached) {
      return cached;
    }

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
      handoffStatus,
      sortBy = 'created_at',
      sortDirection = 'desc',
    } = filter as typeof filter & {
      sortBy?: string;
      sortDirection?: string;
      handoffStatus?: string;
    };

    const sortColumn = TaskService.SORTABLE_COLUMNS[sortBy] ?? 'tasks.created_at';
    const sortDir = sortDirection === 'asc' ? 'asc' : 'desc';

    let query = this.db('tasks')
      .where('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at');

    // Apply visibility scope and expose the canonical task home.
    query = query
      .leftJoin('workspaces', 'tasks.department_id', 'workspaces.id')
      .leftJoin({ home_link: 'task_folder_links' }, function () {
        this.on('home_link.task_id', '=', 'tasks.id')
          .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
          .andOnVal('home_link.is_home', '=', true);
      })
      .leftJoin({ task_project: 'projects' }, 'task_project.id', 'tasks.project_id')
      .leftJoin({ home_folder: 'folders' }, 'home_folder.id', 'home_link.folder_id')
      .leftJoin({ handoff_owner_membership: 'tenant_memberships' }, function () {
        this.on('handoff_owner_membership.tenant_id', '=', 'tasks.tenant_id').andOn(
          'handoff_owner_membership.user_id',
          '=',
          'tasks.handoff_owner_id',
        );
      })
      .leftJoin({ handoff_owner: 'users' }, 'handoff_owner.id', 'handoff_owner_membership.user_id');

    if (!tenantAdmin) {
      query = applyTaskAccessScope(query, { ...ctx, role: 'member' });
    }

    // Apply filters
    if (projectId) query = query.andWhere('tasks.project_id', projectId);
    if (assigneeId) {
      query = query.andWhere((assignee) =>
        assignee.where('tasks.assignee_id', assigneeId).orWhereExists(function () {
          this.select(1)
            .from('task_assignees as filtered_ta')
            .whereRaw('filtered_ta.task_id = tasks.id')
            .andWhere('filtered_ta.tenant_id', ctx.tenantId)
            .andWhere('filtered_ta.user_id', assigneeId);
        }),
      );
    }
    if (status && status.length > 0) query = query.whereIn('tasks.status', status);
    if (priority && priority.length > 0) query = query.whereIn('tasks.priority', priority);
    if (dueDateBefore) query = query.andWhere('tasks.due_date', '<=', dueDateBefore);
    if (dueDateAfter) query = query.andWhere('tasks.due_date', '>=', dueDateAfter);
    if (folderId) query = query.andWhere('home_link.folder_id', folderId);
    if (departmentId) {
      query = query.andWhere('tasks.department_id', departmentId);
    }
    if (handoffStatus) {
      query = query.andWhere('tasks.handoff_status', handoffStatus);
    }
    if (search) {
      query = query.andWhereRaw(`tasks.search_vec @@ plainto_tsquery('english', ?)`, [search]);
    }

    // Count total
    let countQuery = this.db('tasks')
      .where('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at');

    if (!tenantAdmin) {
      countQuery = applyTaskAccessScope(countQuery, { ...ctx, role: 'member' });
    }

    if (projectId) countQuery = countQuery.andWhere('tasks.project_id', projectId);
    if (assigneeId) {
      countQuery = countQuery.andWhere((assignee) =>
        assignee.where('tasks.assignee_id', assigneeId).orWhereExists(function () {
          this.select(1)
            .from('task_assignees as filtered_ta')
            .whereRaw('filtered_ta.task_id = tasks.id')
            .andWhere('filtered_ta.tenant_id', ctx.tenantId)
            .andWhere('filtered_ta.user_id', assigneeId);
        }),
      );
    }
    if (status && status.length > 0) countQuery = countQuery.whereIn('tasks.status', status);
    if (priority && priority.length > 0)
      countQuery = countQuery.whereIn('tasks.priority', priority);
    if (dueDateBefore) countQuery = countQuery.andWhere('tasks.due_date', '<=', dueDateBefore);
    if (dueDateAfter) countQuery = countQuery.andWhere('tasks.due_date', '>=', dueDateAfter);
    if (folderId) {
      countQuery = countQuery
        .join({ home_link: 'task_folder_links' }, function () {
          this.on('home_link.task_id', '=', 'tasks.id')
            .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
            .andOnVal('home_link.is_home', '=', true);
        })
        .andWhere('home_link.folder_id', folderId);
    }
    if (departmentId) {
      countQuery = countQuery.andWhere('tasks.department_id', departmentId);
    }
    if (handoffStatus) {
      countQuery = countQuery.andWhere('tasks.handoff_status', handoffStatus);
    }
    if (search) {
      countQuery = countQuery.andWhereRaw(`tasks.search_vec @@ plainto_tsquery('english', ?)`, [
        search,
      ]);
    }

    const countResult = (await countQuery.count('tasks.id').first()) as
      { count?: string | number } | undefined;
    const total = Number(countResult?.count || 0);

    // Fetch page with explicit select whitelist (omitting tasks.search_vec)
    const tasks = await query
      .select(...TaskService.buildListProjection(this.db))
      .leftJoin({ u: 'users' }, 'tasks.assignee_id', 'u.id')
      .orderBy(sortColumn, sortDir)
      .limit(perPage)
      .offset((page - 1) * perPage);

    const result = {
      data: await this.attachAssignees(tasks),
      meta: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    };

    this.cache.set(cacheKey, result, 15);
    return result;
  }

  private async findVisibleTask(
    id: string,
    executor: Knex | Knex.Transaction = this.db,
    options: { forUpdate?: boolean } = {},
  ) {
    const ctx = requireTenantContext();
    const tenantAdmin = await this.departmentAccess.isTenantAdmin(executor);
    const query = executor('tasks')
      .leftJoin('workspaces', 'tasks.department_id', 'workspaces.id')
      .leftJoin({ home_link: 'task_folder_links' }, function () {
        this.on('home_link.task_id', '=', 'tasks.id')
          .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
          .andOnVal('home_link.is_home', '=', true);
      })
      .leftJoin({ task_project: 'projects' }, 'task_project.id', 'tasks.project_id')
      .leftJoin({ home_folder: 'folders' }, 'home_folder.id', 'home_link.folder_id')
      .leftJoin({ handoff_owner_membership: 'tenant_memberships' }, function () {
        this.on('handoff_owner_membership.tenant_id', '=', 'tasks.tenant_id').andOn(
          'handoff_owner_membership.user_id',
          '=',
          'tasks.handoff_owner_id',
        );
      })
      .leftJoin({ handoff_owner: 'users' }, 'handoff_owner.id', 'handoff_owner_membership.user_id')
      .where('tasks.id', id)
      .andWhere('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at')
      .select(
        'tasks.*',
        'workspaces.name as department_name',
        'home_folder.id as folder_id',
        'home_folder.name as folder_name',
        'task_project.name as project_name',
        'task_project.is_system as is_system_project',
        this.db.raw(
          `CASE WHEN handoff_owner.id IS NULL THEN NULL ELSE json_build_object('id', handoff_owner.id, 'display_name', handoff_owner.display_name, 'email', handoff_owner.email) END as handoff_owner`,
        ),
      )
      .modify((qb: Knex.QueryBuilder) => {
        if (!tenantAdmin) {
          applyTaskAccessScope(qb, { ...ctx, role: 'member' });
        }
      });
    if (options.forUpdate) query.forUpdate('tasks');
    const task = await query.first();
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
    const [comments, dependencies, assignees, attachments] = await Promise.all([
      this.findComments(id),
      this.db('task_dependencies').where({ task_id: id }),
      this.getTaskAssignees(id),
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

  async findComments(taskId: string) {
    const ctx = requireTenantContext();
    await this.findVisibleTask(taskId);

    return this.db('task_comments')
      .where({ task_id: taskId, tenant_id: ctx.tenantId })
      .whereNull('deleted_at')
      .orderBy('created_at', 'asc');
  }

  private async getTaskAssignees(taskId: string, executor: Knex | Knex.Transaction = this.db) {
    const ctx = requireTenantContext();
    return executor('task_assignees')
      .join('users', 'task_assignees.user_id', 'users.id')
      .where({
        'task_assignees.tenant_id': ctx.tenantId,
        'task_assignees.task_id': taskId,
      })
      .select(
        'task_assignees.id',
        'task_assignees.task_id',
        'task_assignees.user_id',
        'task_assignees.assigned_by_id',
        'task_assignees.is_primary',
        'task_assignees.assigned_at',
        'users.display_name',
        'users.email',
        'users.avatar_url',
      )
      .orderBy('task_assignees.is_primary', 'desc')
      .orderBy('users.display_name', 'asc');
  }

  private async attachAssignees(tasks: Array<Record<string, any>>) {
    if (tasks.length === 0) return tasks;
    const ctx = requireTenantContext();
    const taskIds = tasks.map((task) => task.id as string);
    const result = await this.db('task_assignees')
      .join('users', 'task_assignees.user_id', 'users.id')
      .where('task_assignees.tenant_id', ctx.tenantId)
      .whereIn('task_assignees.task_id', taskIds)
      .select(
        'task_assignees.id',
        'task_assignees.task_id',
        'task_assignees.user_id',
        'task_assignees.assigned_by_id',
        'task_assignees.is_primary',
        'task_assignees.assigned_at',
        'users.display_name',
        'users.email',
        'users.avatar_url',
      )
      .orderBy('task_assignees.is_primary', 'desc');
    const rows = Array.isArray(result) ? result : [];
    const byTask = new Map<string, Array<Record<string, unknown>>>();
    for (const row of rows) {
      const values = byTask.get(row.task_id) || [];
      values.push(row);
      byTask.set(row.task_id, values);
    }
    return tasks.map((task) => ({ ...task, assignees: byTask.get(task.id) || [] }));
  }

  private uniqueAssigneeIds(input: {
    assigneeId?: string | null;
    assigneeIds?: string[];
  }): string[] {
    const ids = [...(input.assigneeId ? [input.assigneeId] : []), ...(input.assigneeIds || [])];
    return [...new Set(ids)];
  }

  private async validateAssignees(
    departmentId: string,
    assigneeIds: string[],
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<void> {
    for (const userId of assigneeIds) {
      await this.validateAssigneeInDepartment(departmentId, userId, executor);
      await this.departmentAccess.assertCanAssignTo(departmentId, userId, executor);
    }
  }

  private async replaceTaskAssignees(
    taskId: string,
    assigneeIds: string[],
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<void> {
    const ctx = requireTenantContext();
    await executor('task_assignees').where({ tenant_id: ctx.tenantId, task_id: taskId }).del();
    if (assigneeIds.length === 0) return;
    await executor('task_assignees').insert(
      assigneeIds.map((userId, index) => ({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        task_id: taskId,
        user_id: userId,
        assigned_by_id: ctx.userId,
        is_primary: index === 0,
      })),
    );
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
    executor: Knex | Knex.Transaction = this.db,
  ): Promise<void> {
    if (!assigneeId) return; // unassigned is always ok

    const ctx = requireTenantContext();
    const member = await executor('workspace_members')
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
    if (input.status === TaskStatus.COMPLETED && input.handoffRequired !== false) {
      throw this.handoffRequiredConflict();
    }
    const id = uuidv4();
    const assigneeIds = this.uniqueAssigneeIds(input);

    const task = await this.db.transaction(async (trx) => {
      const location = await this.taskLocations.resolveForCreate(input, trx);
      await this.departmentAccess.assertCanCreateTask(location.departmentId, trx);
      if (input.visibility === 'global') {
        await this.departmentAccess.assertCanSetVisibility(location.departmentId, trx);
      }
      await this.validateAssignees(location.departmentId, assigneeIds, trx);
      const handoffRequired = input.handoffRequired ?? true;
      const handoffStatus = handoffRequired ? HandoffStatus.PENDING : HandoffStatus.NOT_REQUIRED;
      if (input.status === TaskStatus.COMPLETED && handoffRequired) {
        throw new ConflictException({
          code: 'HANDOFF_CONFIRMATION_REQUIRED',
          message: 'Confirm final handoff before completing this task.',
        });
      }

      const [created] = await trx('tasks')
        .insert({
          id,
          tenant_id: ctx.tenantId,
          project_id: location.projectId,
          department_id: location.departmentId,
          parent_task_id: input.parentTaskId || null,
          assignee_id: assigneeIds[0] || null,
          created_by_id: ctx.userId,
          handoff_required: handoffRequired,
          handoff_status: handoffStatus,
          handoff_owner_id: ctx.userId,
          title: input.title,
          description: input.description || null,
          status: input.status || TaskStatus.TODO,
          completed_at: input.status === TaskStatus.COMPLETED ? new Date() : null,
          priority: input.priority || TaskPriority.LOW,
          estimated_hours: input.estimatedHours || null,
          start_date: input.startDate || null,
          due_date: input.dueDate || null,
          visibility: input.visibility || 'department',
          custom_fields: input.customFields ? JSON.stringify(input.customFields) : '{}',
          sort_order: 0,
        })
        .returning('*');
      await this.replaceTaskAssignees(id, assigneeIds, trx);
      await this.taskLocations.writeHomeLink(id, location.folderId, trx);
      return { ...created, ...location };
    });

    // Log activity
    await this.logActivity(ctx.userId, 'task', id, 'task:created', {});
    if (task.assignee_id) {
      await this.logActivity(ctx.userId, 'task', id, 'task:assigned', {
        assigneeId: { old: null, new: task.assignee_id },
      });
      await this.createAssignmentNotification(task);
    }

    this.logger.log(`Task ${id} created in project ${task.projectId}`);
    this.invalidateTenantCache(ctx.tenantId);
    const result = { ...task, assignees: await this.getTaskAssignees(id) };
    void this.realtime.publishTaskEvent(ctx.tenantId, 'task.created', {
      task: result as unknown as Record<string, unknown>,
    });
    return result;
  }

  /**
   * Update a task (partial update — only provided fields change).
   */
  async update(id: string, input: UpdateTaskInput) {
    const ctx = requireTenantContext();
    const assigneesProvided = input.assigneeIds !== undefined || input.assigneeId !== undefined;
    const desiredAssigneeIds = assigneesProvided ? this.uniqueAssigneeIds(input) : [];
    const mutation = await this.db.transaction(async (trx) => {
      const existing = await this.findVisibleTask(id, trx, { forUpdate: true });
      const requestedFields = Object.keys(input as Record<string, unknown>);
      const statusOnly = requestedFields.length === 1 && requestedFields[0] === 'status';

      if (input.status === TaskStatus.COMPLETED && existing.status !== TaskStatus.COMPLETED) {
        throw this.handoffRequiredConflict();
      }

      if (statusOnly) {
        await this.departmentAccess.assertCanChangeStatus(
          existing.department_id,
          existing.id,
          existing.assignee_id,
          trx,
        );
      } else {
        await this.departmentAccess.assertCanManageTask(existing.department_id, existing.id, trx);
      }
      if (input.visibility !== undefined && input.visibility !== existing.visibility) {
        await this.departmentAccess.assertCanSetVisibility(existing.department_id, trx);
      }
      if (assigneesProvided) {
        await this.validateAssignees(existing.department_id, desiredAssigneeIds, trx);
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
        handoffRequired: 'handoff_required',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        const value = (input as any)[key];
        if (value !== undefined) {
          updates[dbField] = value;
          if (JSON.stringify(existing[dbField]) !== JSON.stringify(value)) {
            changes[key] = { old: existing[dbField], new: value };
          }
        }
      }

      if (assigneesProvided) {
        const existingRows = await this.getTaskAssignees(id, trx);
        const existingIds = existingRows.map((row) => row.user_id as string);
        if (JSON.stringify(existingIds) !== JSON.stringify(desiredAssigneeIds)) {
          changes['assigneeIds'] = { old: existingIds, new: desiredAssigneeIds };
          if (desiredAssigneeIds.some((assigneeId) => !existingIds.includes(assigneeId))) {
            updates['handoff_owner_id'] = ctx.userId;
          }
        }
        updates['assignee_id'] = desiredAssigneeIds[0] || null;
        delete changes['assigneeId'];
      }

      if (
        input.handoffRequired === true &&
        existing.handoff_required !== true &&
        (input.status ?? existing.status) === TaskStatus.COMPLETED
      ) {
        throw new ConflictException({
          code: 'HANDOFF_CONFIRMATION_REQUIRED',
          message: 'Reopen this task before requiring handoff confirmation.',
        });
      }

      if (
        input.handoffRequired !== undefined &&
        input.handoffRequired !== existing.handoff_required
      ) {
        updates['handoff_status'] = input.handoffRequired
          ? HandoffStatus.PENDING
          : HandoffStatus.NOT_REQUIRED;
        updates['handoff_ready_at'] = null;
        updates['handoff_confirmed_by'] = null;
        updates['handoff_confirmed_at'] = null;
      }

      if (Object.keys(changes).length === 0) return { updated: existing, changes };
      if (updates['custom_fields'] && typeof updates['custom_fields'] === 'object') {
        updates['custom_fields'] = JSON.stringify(updates['custom_fields']);
      }
      if (updates['status'] === TaskStatus.COMPLETED && existing.status !== TaskStatus.COMPLETED) {
        const handoffRequired =
          updates['handoff_required'] !== undefined
            ? Boolean(updates['handoff_required'])
            : existing.handoff_required !== false;
        if (handoffRequired && existing.handoff_status !== HandoffStatus.CONFIRMED) {
          throw new ConflictException({
            code: 'HANDOFF_CONFIRMATION_REQUIRED',
            message: 'Confirm final handoff before completing this task.',
          });
        }
        updates['completed_at'] = new Date();
      } else if (updates['status'] && updates['status'] !== TaskStatus.COMPLETED) {
        updates['completed_at'] = null;
      }
      updates['updated_at'] = new Date();

      const reopening =
        existing.status === TaskStatus.COMPLETED &&
        updates['status'] !== undefined &&
        updates['status'] !== TaskStatus.COMPLETED;
      let row = existing;
      if (reopening) {
        row = await this.taskCompletion.reopenInTransaction(
          trx,
          existing,
          updates['status'] as TaskStatus,
        );
        delete updates['status'];
        delete updates['completed_at'];
      }
      if (Object.keys(updates).length > 0) {
        [row] = await trx('tasks')
          .where({ id, tenant_id: ctx.tenantId })
          .update(updates)
          .returning('*');
      }
      if (assigneesProvided) {
        await this.replaceTaskAssignees(id, desiredAssigneeIds, trx);
      }
      return { updated: row, changes };
    });
    const { updated, changes } = mutation;

    // Log activity
    if (Object.keys(changes).length > 0) {
      await this.logActivity(ctx.userId, 'task', id, 'task:updated', changes);
      if (changes['status']) {
        await this.logActivity(ctx.userId, 'task', id, 'task:status:changed', {
          status: changes['status'],
        });
      }
      if (changes['assigneeId'] || changes['assigneeIds']) {
        await this.logActivity(ctx.userId, 'task', id, 'task:assigned', {
          assignees: changes['assigneeIds'] || changes['assigneeId'],
        });
      }
    }

    if (changes['assigneeId'] || changes['assigneeIds'] || changes['priority']) {
      await this.db('notification_log')
        .where({ tenant_id: ctx.tenantId, task_id: id })
        .andWhere('rule_type', 'like', 'priority_%')
        .del();
      if (updated.assignee_id) {
        await this.createAssignmentNotification(updated);
      }
    }

    this.invalidateTenantCache(ctx.tenantId);
    const result = { ...updated, assignees: await this.getTaskAssignees(id) };
    if (Object.keys(changes).length > 0) {
      void this.realtime.publishTaskEvent(ctx.tenantId, 'task.updated', {
        task: result as unknown as Record<string, unknown>,
        changes,
      });
    }
    return result;
  }

  /**
   * Delete a task (soft-delete).
   */
  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db.transaction(async (trx) => {
      const existing = await this.findVisibleTask(id, trx, { forUpdate: true });
      await this.departmentAccess.assertCanManageTask(existing.department_id, existing.id, trx);
      await trx('task_assignees').where({ task_id: id, tenant_id: ctx.tenantId }).del();
      await trx('tasks').where({ id, tenant_id: ctx.tenantId }).update({ deleted_at: new Date() });
    });
    await this.logActivity(ctx.userId, 'task', id, 'task:deleted', {});
    this.invalidateTenantCache(ctx.tenantId);
    void this.realtime.publishTaskEvent(ctx.tenantId, 'task.deleted', { id });
    this.logger.log(`Task ${id} soft-deleted`);
  }

  async findMyTasks(filter: TaskFilterInput) {
    const ctx = requireTenantContext();
    return this.findAll({ ...filter, assigneeId: ctx.userId });
  }

  async moveLocation(id: string, input: MoveTaskLocationInput) {
    const ctx = requireTenantContext();
    await this.taskLocations.move(id, input);
    this.invalidateTenantCache(ctx.tenantId);
    return this.findById(id);
  }

  async findDepartmentTasksGrouped(departmentId: string) {
    const ctx = requireTenantContext();
    const viewerRole = await this.departmentAccess.assertCanViewGroupedTasks(departmentId);
    const members = await this.db('workspace_members')
      .join('users', 'workspace_members.user_id', 'users.id')
      .join('tenant_memberships', function () {
        this.on('tenant_memberships.tenant_id', '=', 'workspace_members.tenant_id').andOn(
          'tenant_memberships.user_id',
          '=',
          'workspace_members.user_id',
        );
      })
      .where({
        'workspace_members.tenant_id': ctx.tenantId,
        'workspace_members.workspace_id': departmentId,
      })
      .andWhere('tenant_memberships.is_active', true)
      .whereNot('tenant_memberships.role', 'admin')
      .whereNotExists(function () {
        this.select(1)
          .from('department_heads as grouped_dh')
          .whereRaw('grouped_dh.department_id = workspace_members.workspace_id')
          .andWhere('grouped_dh.tenant_id', ctx.tenantId)
          .whereRaw('grouped_dh.user_id = workspace_members.user_id');
      })
      .select(
        'users.id as user_id',
        'users.display_name',
        'users.email',
        'users.avatar_url',
        this.db.raw(`
          CASE
            WHEN workspace_members.role = 'manager' OR tenant_memberships.role = 'manager'
              THEN 'manager'
            ELSE 'employee'
          END AS role
        `),
      )
      .orderBy('users.display_name', 'asc');

    const visibleMembers = members;

    let taskQuery = this.db('tasks')
      .leftJoin('workspaces', 'tasks.department_id', 'workspaces.id')
      .leftJoin({ home_link: 'task_folder_links' }, function () {
        this.on('home_link.task_id', '=', 'tasks.id')
          .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
          .andOnVal('home_link.is_home', '=', true);
      })
      .leftJoin({ task_project: 'projects' }, 'task_project.id', 'tasks.project_id')
      .leftJoin({ home_folder: 'folders' }, 'home_folder.id', 'home_link.folder_id')
      .where({
        'tasks.tenant_id': ctx.tenantId,
        'tasks.department_id': departmentId,
      })
      .whereNull('tasks.deleted_at')
      .select(
        'tasks.*',
        'workspaces.name as department_name',
        'home_folder.id as folder_id',
        'home_folder.name as folder_name',
        'task_project.name as project_name',
        'task_project.is_system as is_system_project',
      )
      .orderByRaw(
        `CASE WHEN tasks.due_date < NOW() AND tasks.status <> 'completed' THEN 0 ELSE 1 END`,
      )
      .orderBy('tasks.due_date', 'asc', 'last')
      .orderBy('tasks.created_at', 'desc');

    taskQuery = applyTaskAccessScope(taskQuery, {
      ...ctx,
      role: viewerRole === 'admin' ? 'admin' : 'member',
    });

    const tasks = await this.attachAssignees(await taskQuery);
    const groupFor = (member: Record<string, any>) => ({
      user: member,
      tasks: tasks.filter((task) =>
        task.assignees.some((assignee: Record<string, any>) => assignee.user_id === member.user_id),
      ),
    });
    const assignedTaskIds = new Set(
      tasks.flatMap((task) =>
        task.assignees.map((assignee: Record<string, any>) => assignee.task_id as string),
      ),
    );

    return {
      viewerRole,
      myTasks: tasks.filter((task) =>
        task.assignees.some((assignee: Record<string, any>) => assignee.user_id === ctx.userId),
      ),
      managerGroups: visibleMembers.filter((member) => member.role === 'manager').map(groupFor),
      employeeGroups: visibleMembers.filter((member) => member.role === 'employee').map(groupFor),
      unassigned: tasks.filter((task) => !assignedTaskIds.has(task.id)),
      members,
    };
  }

  async addAssignee(taskId: string, userId: string) {
    const ctx = requireTenantContext();
    const mutation = await this.db.transaction(async (trx) => {
      const task = await this.findVisibleTask(taskId, trx, { forUpdate: true });
      await this.departmentAccess.assertCanManageTask(task.department_id, task.id, trx);
      await this.validateAssignees(task.department_id, [userId], trx);
      const current = await this.getTaskAssignees(taskId, trx);
      const ids = current.map((assignee) => assignee.user_id as string);
      if (ids.includes(userId)) return { changed: false, task };
      ids.push(userId);
      await this.replaceTaskAssignees(taskId, ids, trx);
      await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .update({
          assignee_id: ids[0] || null,
          handoff_owner_id: ctx.userId,
          updated_at: new Date(),
        });
      return { changed: true, task };
    });
    if (!mutation.changed) return this.findById(taskId);
    await this.logActivity(ctx.userId, 'task', taskId, 'task:assignee:added', { userId });
    await this.createAssignmentNotification({ ...mutation.task, assignee_id: userId });
    this.invalidateTenantCache(ctx.tenantId);
    return this.findById(taskId);
  }

  async removeAssignee(taskId: string, userId: string) {
    const ctx = requireTenantContext();
    await this.db.transaction(async (trx) => {
      const task = await this.findVisibleTask(taskId, trx, { forUpdate: true });
      await this.departmentAccess.assertCanManageTask(task.department_id, task.id, trx);
      await this.departmentAccess.assertCanAssignTo(task.department_id, userId, trx);
      const current = await this.getTaskAssignees(taskId, trx);
      if (!current.some((assignee) => assignee.user_id === userId)) {
        throw new NotFoundException('Task assignee not found');
      }
      const ids = current
        .map((assignee) => assignee.user_id as string)
        .filter((id) => id !== userId);
      await this.replaceTaskAssignees(taskId, ids, trx);
      await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .update({ assignee_id: ids[0] || null, updated_at: new Date() });
    });
    await this.logActivity(ctx.userId, 'task', taskId, 'task:assignee:removed', { userId });
    this.invalidateTenantCache(ctx.tenantId);
    return this.findById(taskId);
  }

  /**
   * Bulk update tasks (e.g., drag-drop status change on kanban).
   * Uses a single transaction for uniform changes.
   */
  async bulkUpdate(input: BulkTaskUpdateInput) {
    const ctx = requireTenantContext();
    if (input.updates.status === TaskStatus.COMPLETED) throw this.handoffRequiredConflict();
    const assigneesProvided =
      input.updates.assigneeId !== undefined || input.updates.assigneeIds !== undefined;
    const desiredAssigneeIds = assigneesProvided ? this.uniqueAssigneeIds(input.updates) : [];
    const updateFields = Object.keys(input.updates as Record<string, unknown>);
    const statusOnly = updateFields.length === 1 && updateFields[0] === 'status';
    const updated = await this.db.transaction(async (trx) => {
      const handoffOwnerTaskIds = new Set<string>();
      const existingTaskQuery = trx('tasks')
        .whereIn('id', input.taskIds)
        .andWhere('tenant_id', ctx.tenantId)
        .whereNull('deleted_at');
      applyTaskAccessScope(existingTaskQuery, ctx);
      existingTaskQuery.forUpdate('tasks');
      const existingTasks = await existingTaskQuery;
      if (existingTasks.length !== input.taskIds.length) {
        throw new NotFoundException('One or more tasks were not found');
      }

      for (const task of existingTasks) {
        if (statusOnly) {
          await this.departmentAccess.assertCanChangeStatus(
            task.department_id,
            task.id,
            task.assignee_id,
            trx,
          );
        } else {
          await this.departmentAccess.assertCanManageTask(task.department_id, task.id, trx);
        }
        if (
          input.updates.visibility !== undefined &&
          input.updates.visibility !== task.visibility
        ) {
          await this.departmentAccess.assertCanSetVisibility(task.department_id, trx);
        }
        if (assigneesProvided) {
          await this.validateAssignees(task.department_id, desiredAssigneeIds, trx);
        }
        if (
          input.updates.handoffRequired === true &&
          task.handoff_required !== true &&
          (input.updates.status ?? task.status) === TaskStatus.COMPLETED
        ) {
          throw new ConflictException({
            code: 'HANDOFF_CONFIRMATION_REQUIRED',
            message: 'Reopen completed tasks before requiring handoff confirmation.',
          });
        }
      }

      if (assigneesProvided) {
        const assignmentRows = (await trx('task_assignees')
          .whereIn('task_id', input.taskIds)
          .andWhere('tenant_id', ctx.tenantId)) as Array<{
          task_id: string;
          user_id: string;
        }>;
        const assignmentsByTask = new Map<string, string[]>();
        for (const row of assignmentRows) {
          const ids = assignmentsByTask.get(row.task_id) ?? [];
          ids.push(row.user_id);
          assignmentsByTask.set(row.task_id, ids);
        }
        for (const task of existingTasks) {
          const currentIds = assignmentsByTask.get(task.id) ?? [];
          if (desiredAssigneeIds.some((assigneeId) => !currentIds.includes(assigneeId))) {
            handoffOwnerTaskIds.add(task.id);
          }
        }
        const assignmentsUnchanged = existingTasks.every(
          (task) =>
            JSON.stringify(this.normalizedAssigneeSet(assignmentsByTask.get(task.id) ?? [])) ===
            JSON.stringify(this.normalizedAssigneeSet(desiredAssigneeIds)),
        );
        const assignmentOnly = updateFields.every(
          (field) => field === 'assigneeId' || field === 'assigneeIds',
        );
        if (assignmentsUnchanged && assignmentOnly) {
          return { rows: existingTasks, didMutate: false };
        }
      }

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
        customFields: 'custom_fields',
        handoffRequired: 'handoff_required',
      };

      for (const [key, dbField] of Object.entries(fieldMap)) {
        const value = (input.updates as any)[key];
        if (value !== undefined) {
          dbUpdates[dbField] = value;
        }
      }
      if (input.updates.assigneeIds !== undefined) {
        dbUpdates['assignee_id'] = this.uniqueAssigneeIds(input.updates)[0] || null;
      }
      if (dbUpdates['custom_fields'] && typeof dbUpdates['custom_fields'] === 'object') {
        dbUpdates['custom_fields'] = JSON.stringify(dbUpdates['custom_fields']);
      }
      if (input.updates.handoffRequired !== undefined) {
        dbUpdates['handoff_status'] = input.updates.handoffRequired
          ? HandoffStatus.PENDING
          : HandoffStatus.NOT_REQUIRED;
        dbUpdates['handoff_ready_at'] = null;
        dbUpdates['handoff_confirmed_by'] = null;
        dbUpdates['handoff_confirmed_at'] = null;
      }
      if (dbUpdates['status']) {
        dbUpdates['completed_at'] = null;
      }
      dbUpdates['updated_at'] = new Date();

      if (input.updates.status !== undefined) {
        for (const task of existingTasks) {
          if (task.status === TaskStatus.COMPLETED) {
            await this.taskCompletion.reopenInTransaction(trx, task, input.updates.status);
          }
        }
      }
      let rows = await trx('tasks')
        .whereIn('id', input.taskIds)
        .andWhere('tenant_id', ctx.tenantId)
        .whereNull('deleted_at')
        .update(dbUpdates)
        .returning('*');
      if (assigneesProvided) {
        if (handoffOwnerTaskIds.size > 0) {
          const ownerRows = await trx('tasks')
            .whereIn('id', [...handoffOwnerTaskIds])
            .andWhere('tenant_id', ctx.tenantId)
            .update({ handoff_owner_id: ctx.userId, updated_at: new Date() })
            .returning('*');
          const ownerByTaskId = new Map(ownerRows.map((task) => [task.id, task]));
          rows = rows.map((task) => ownerByTaskId.get(task.id) || task);
        }
        for (const task of rows) {
          await this.replaceTaskAssignees(task.id, desiredAssigneeIds, trx);
        }
      }
      return { rows, didMutate: true };
    });

    if (!updated.didMutate) return updated.rows;

    for (const task of updated.rows) {
      await this.logActivity(ctx.userId, 'task', task.id, 'task:updated', {
        bulkUpdate: { fields: Object.keys(input.updates) },
      });
      if (input.updates.status !== undefined) {
        await this.logActivity(ctx.userId, 'task', task.id, 'task:status:changed', {
          status: { new: input.updates.status },
        });
      }
      if (assigneesProvided) {
        await this.logActivity(ctx.userId, 'task', task.id, 'task:assigned', {
          assigneeIds: { new: desiredAssigneeIds },
        });
      }
      if (assigneesProvided || input.updates.priority !== undefined) {
        await this.db('notification_log')
          .where({ tenant_id: ctx.tenantId, task_id: task.id })
          .andWhere('rule_type', 'like', 'priority_%')
          .del();
        if (task.assignee_id) await this.createAssignmentNotification(task);
      }
    }
    this.invalidateTenantCache(ctx.tenantId);
    return updated.rows;
  }

  private normalizedAssigneeSet(ids: string[]): string[] {
    return [...new Set(ids)].sort();
  }

  /**
   * Create a dependency between two tasks.
   */
  async createDependency(input: CreateDependencyInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    if (input.taskId === input.dependsOnTaskId) {
      throw new BadRequestException('A task cannot depend on itself');
    }
    return this.db.transaction(async (trx) => {
      const tasks = await trx('tasks')
        .whereIn('id', [input.taskId, input.dependsOnTaskId].sort())
        .andWhere('tenant_id', ctx.tenantId)
        .whereNull('deleted_at')
        .forUpdate();
      const task = tasks.find((row) => row.id === input.taskId);
      const dependsOn = tasks.find((row) => row.id === input.dependsOnTaskId);
      if (!task || !dependsOn) throw new NotFoundException('Task not found');
      await this.departmentAccess.assertCanManageTask(task.department_id, task.id, trx);
      await this.departmentAccess.assertCanManageTask(dependsOn.department_id, dependsOn.id, trx);

      const [dependency] = await trx('task_dependencies')
        .insert({
          id,
          tenant_id: ctx.tenantId,
          task_id: input.taskId,
          depends_on_task_id: input.dependsOnTaskId,
          dependency_type: input.dependencyType,
          lag_days: input.lagDays || 0,
        })
        .returning('*');
      return dependency;
    });
  }

  /**
   * Remove a dependency.
   */
  async removeDependency(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db.transaction(async (trx) => {
      const dep = await trx('task_dependencies')
        .join('tasks', 'task_dependencies.task_id', 'tasks.id')
        .where('task_dependencies.id', id)
        .andWhere('task_dependencies.tenant_id', ctx.tenantId)
        .andWhere('tasks.tenant_id', ctx.tenantId)
        .forUpdate()
        .first();
      if (!dep) throw new NotFoundException('Dependency not found');
      await this.departmentAccess.assertCanManageTask(dep.department_id, dep.task_id, trx);
      await trx('task_dependencies').where({ id, tenant_id: ctx.tenantId }).del();
    });
  }

  /**
   * Add a comment to a task.
   */
  async addComment(input: CreateCommentInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();

    const comment = await this.db.transaction(async (trx) => {
      await this.findVisibleTask(input.taskId, trx, { forUpdate: true });
      const [created] = await trx('task_comments')
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
      return created;
    });

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

  private handoffRequiredConflict(): ConflictException {
    return new ConflictException({
      code: 'HANDOFF_CONFIRMATION_REQUIRED',
      message: 'Confirm final handoff before completing this task.',
    });
  }
}
