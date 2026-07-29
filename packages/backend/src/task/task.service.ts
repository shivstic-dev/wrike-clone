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
import { TaskStatus, TaskPriority } from '@wrike-clone/shared';
import { DepartmentAccessService } from '../rbac/department-access.service';
import { TaskLocationService } from './task-location.service';
import { TaskCompletionService } from './task-completion.service';

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
    private readonly taskLocations: TaskLocationService,
    private readonly taskCompletion: TaskCompletionService,
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
      handoffStatus,
      sortBy = 'created_at',
      sortDirection = 'desc',
    } = filter as typeof filter & { sortBy?: string; sortDirection?: string };

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
      .leftJoin({ handoff_owner: 'users' }, 'handoff_owner.id', 'tasks.handoff_owner_id');

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
    if (handoffStatus) query = query.andWhere('tasks.handoff_status', handoffStatus);
    if (departmentId) {
      query = query.andWhere('tasks.department_id', departmentId);
    }
    if (search) {
      query = query.andWhereRaw(
        `tasks.search_vec @@ plainto_tsquery('english', ?)`,
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
        'home_folder.id as folder_id',
        'home_folder.name as folder_name',
        'task_project.name as project_name',
        'task_project.is_system as is_system_project',
        this.db.raw(
          `CASE WHEN handoff_owner.id IS NULL THEN NULL ELSE json_build_object('id', handoff_owner.id, 'display_name', handoff_owner.display_name, 'email', handoff_owner.email) END as handoff_owner`,
        ),
        this.db.raw(
          `json_build_object('id', u.id, 'display_name', u.display_name, 'avatar_url', u.avatar_url) as assignee`,
        ),
      )
      .leftJoin({ u: 'users' }, 'tasks.assignee_id', 'u.id')
      .orderBy(sortColumn, sortDir)
      .limit(perPage)
      .offset((page - 1) * perPage);

    return {
      data: await this.attachAssignees(tasks),
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
      .leftJoin({ home_link: 'task_folder_links' }, function () {
        this.on('home_link.task_id', '=', 'tasks.id')
          .andOn('home_link.tenant_id', '=', 'tasks.tenant_id')
          .andOnVal('home_link.is_home', '=', true);
      })
      .leftJoin({ task_project: 'projects' }, 'task_project.id', 'tasks.project_id')
      .leftJoin({ home_folder: 'folders' }, 'home_folder.id', 'home_link.folder_id')
      .leftJoin({ handoff_owner: 'users' }, 'handoff_owner.id', 'tasks.handoff_owner_id')
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

  private async getTaskAssignees(taskId: string) {
    const ctx = requireTenantContext();
    return this.db('task_assignees')
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

  private async validateAssignees(departmentId: string, assigneeIds: string[]): Promise<void> {
    for (const userId of assigneeIds) {
      await this.validateAssigneeInDepartment(departmentId, userId);
      await this.departmentAccess.assertCanAssignTo(departmentId, userId);
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
    if (input.status === TaskStatus.COMPLETED && input.handoffRequired !== false) {
      throw this.handoffRequiredConflict();
    }
    const id = uuidv4();
    const assigneeIds = this.uniqueAssigneeIds(input);

    const task = await this.db.transaction(async (trx) => {
      const location = await this.taskLocations.resolveForCreate(input, trx);
      await this.departmentAccess.assertCanCreateTask(location.departmentId);
      if (input.visibility === 'global') {
        await this.departmentAccess.assertCanSetVisibility(location.departmentId);
      }
      await this.validateAssignees(location.departmentId, assigneeIds);

      const [created] = await trx('tasks')
        .insert({
          id,
          tenant_id: ctx.tenantId,
          project_id: location.projectId,
          department_id: location.departmentId,
          parent_task_id: input.parentTaskId || null,
          assignee_id: assigneeIds[0] || null,
          created_by_id: ctx.userId,
          handoff_required: input.handoffRequired ?? true,
          handoff_status: input.handoffRequired === false ? 'not_required' : 'pending',
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
    return { ...task, assignees: await this.getTaskAssignees(id) };
  }

  /**
   * Update a task (partial update — only provided fields change).
   */
  async update(id: string, input: UpdateTaskInput) {
    const ctx = requireTenantContext();
    const existing = await this.findVisibleTask(id);
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
      );
    } else {
      await this.departmentAccess.assertCanManageTask(existing.department_id);
    }
    if (input.visibility !== undefined && input.visibility !== existing.visibility) {
      await this.departmentAccess.assertCanSetVisibility(existing.department_id);
    }
    const assigneesProvided = input.assigneeIds !== undefined || input.assigneeId !== undefined;
    const desiredAssigneeIds = assigneesProvided ? this.uniqueAssigneeIds(input) : [];
    if (assigneesProvided) {
      await this.validateAssignees(existing.department_id, desiredAssigneeIds);
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

    if (assigneesProvided) {
      const existingRows = await this.getTaskAssignees(id);
      const existingIds = existingRows.map((row) => row.user_id as string);
      if (JSON.stringify(existingIds) !== JSON.stringify(desiredAssigneeIds)) {
        changes['assigneeIds'] = { old: existingIds, new: desiredAssigneeIds };
      }
      updates['assignee_id'] = desiredAssigneeIds[0] || null;
      if (changes['assigneeIds'] && desiredAssigneeIds.some((assigneeId) => !existingIds.includes(assigneeId))) {
        updates['handoff_owner_id'] = ctx.userId;
      }
      delete changes['assigneeId'];
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

    const updated = await this.db.transaction(async (trx) => {
      if (input.status && input.status !== TaskStatus.COMPLETED && existing.status === TaskStatus.COMPLETED) {
        const reopened = await this.taskCompletion.reopenInTransaction(trx, existing, input.status);
        const nonStatusUpdates = { ...updates };
        delete nonStatusUpdates.status;
        delete nonStatusUpdates.completed_at;
        const hasNonStatusChanges = Object.keys(nonStatusUpdates).some(
          (field) => field !== 'updated_at',
        );
        if (!hasNonStatusChanges) return reopened;

        const [row] = await trx('tasks')
          .where({ id, tenant_id: ctx.tenantId })
          .update(nonStatusUpdates)
          .returning('*');
        if (assigneesProvided) {
          await this.replaceTaskAssignees(id, desiredAssigneeIds, trx);
        }
        return row;
      }
      const [row] = await trx('tasks')
        .where({ id, tenant_id: ctx.tenantId })
        .update(updates)
        .returning('*');
      if (assigneesProvided) {
        await this.replaceTaskAssignees(id, desiredAssigneeIds, trx);
      }
      return row;
    });

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

    return { ...updated, assignees: await this.getTaskAssignees(id) };
  }

  /**
   * Delete a task (soft-delete).
   */
  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const existing = await this.findVisibleTask(id);
    await this.departmentAccess.assertCanManageTask(existing.department_id);

    await this.db.transaction(async (trx) => {
      await trx('task_assignees').where({ task_id: id, tenant_id: ctx.tenantId }).del();
      await trx('tasks').where({ id, tenant_id: ctx.tenantId }).update({ deleted_at: new Date() });
    });
    await this.logActivity(ctx.userId, 'task', id, 'task:deleted', {});
    this.logger.log(`Task ${id} soft-deleted`);
  }

  async findMyTasks(filter: TaskFilterInput) {
    const ctx = requireTenantContext();
    return this.findAll({ ...filter, assigneeId: ctx.userId });
  }

  async moveLocation(id: string, input: MoveTaskLocationInput) {
    await this.taskLocations.move(id, input);
    return this.findById(id);
  }

  async findDepartmentTasksGrouped(departmentId: string) {
    const ctx = requireTenantContext();
    const viewerRole = await this.departmentAccess.assertCanViewGroupedTasks(departmentId);
    const members = await this.db('workspace_members')
      .join('users', 'workspace_members.user_id', 'users.id')
      .leftJoin('department_heads', function () {
        this.on('department_heads.department_id', '=', 'workspace_members.workspace_id').andOn(
          'department_heads.user_id',
          '=',
          'workspace_members.user_id',
        );
      })
      .leftJoin('tenant_memberships', function () {
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
      .select(
        'users.id as user_id',
        'users.display_name',
        'users.email',
        'users.avatar_url',
        this.db.raw(`
          CASE
            WHEN department_heads.id IS NOT NULL THEN 'department_head'
            WHEN workspace_members.role = 'manager' OR tenant_memberships.role = 'manager'
              THEN 'manager'
            ELSE 'employee'
          END AS role
        `),
      )
      .orderBy('users.display_name', 'asc');

    const visibleMembers =
      viewerRole === 'manager'
        ? members.filter((member) => member.role === 'employee' || member.user_id === ctx.userId)
        : members;
    const visibleIds = visibleMembers.map((member) => member.user_id as string);

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

    if (viewerRole === 'manager') {
      taskQuery = taskQuery.andWhere((taskScope) =>
        taskScope
          .whereIn('tasks.assignee_id', visibleIds)
          .orWhereExists(function () {
            this.select(1)
              .from('task_assignees as grouped_ta')
              .whereRaw('grouped_ta.task_id = tasks.id')
              .andWhere('grouped_ta.tenant_id', ctx.tenantId)
              .whereIn('grouped_ta.user_id', visibleIds);
          })
          .orWhere((unassigned) =>
            unassigned.whereNull('tasks.assignee_id').whereNotExists(function () {
              this.select(1)
                .from('task_assignees as grouped_any_ta')
                .whereRaw('grouped_any_ta.task_id = tasks.id')
                .andWhere('grouped_any_ta.tenant_id', ctx.tenantId);
            }),
          ),
      );
    }

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
    const task = await this.findVisibleTask(taskId);
    await this.departmentAccess.assertCanManageTask(task.department_id);
    await this.validateAssignees(task.department_id, [userId]);
    const current = await this.getTaskAssignees(taskId);
    const ids = current.map((assignee) => assignee.user_id as string);
    const changed = !ids.includes(userId);
    if (changed) ids.push(userId);
    await this.db.transaction(async (trx) => {
      await this.replaceTaskAssignees(taskId, ids, trx);
      await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .update({
          assignee_id: ids[0] || null,
          ...(changed ? { handoff_owner_id: ctx.userId } : {}),
          updated_at: new Date(),
        });
    });
    await this.logActivity(ctx.userId, 'task', taskId, 'task:assignee:added', { userId });
    if (changed) {
      await this.createAssignmentNotification({ ...task, assignee_id: userId });
    }
    return this.findById(taskId);
  }

  async removeAssignee(taskId: string, userId: string) {
    const ctx = requireTenantContext();
    const task = await this.findVisibleTask(taskId);
    await this.departmentAccess.assertCanManageTask(task.department_id);
    await this.departmentAccess.assertCanAssignTo(task.department_id, userId);
    const current = await this.getTaskAssignees(taskId);
    if (!current.some((assignee) => assignee.user_id === userId)) {
      throw new NotFoundException('Task assignee not found');
    }
    const ids = current.map((assignee) => assignee.user_id as string).filter((id) => id !== userId);
    await this.db.transaction(async (trx) => {
      await this.replaceTaskAssignees(taskId, ids, trx);
      await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .update({ assignee_id: ids[0] || null, updated_at: new Date() });
    });
    await this.logActivity(ctx.userId, 'task', taskId, 'task:assignee:removed', { userId });
    return this.findById(taskId);
  }

  /**
   * Bulk update tasks (e.g., drag-drop status change on kanban).
   * Uses a single transaction for uniform changes.
   */
  async bulkUpdate(input: BulkTaskUpdateInput) {
    const ctx = requireTenantContext();
    if (input.updates.status === TaskStatus.COMPLETED) throw this.handoffRequiredConflict();
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
        await this.departmentAccess.assertCanChangeStatus(
          task.department_id,
          task.id,
          task.assignee_id,
        );
      } else {
        await this.departmentAccess.assertCanManageTask(task.department_id);
      }
      if (input.updates.visibility !== undefined && input.updates.visibility !== task.visibility) {
        await this.departmentAccess.assertCanSetVisibility(task.department_id);
      }
      if (input.updates.assigneeId !== undefined || input.updates.assigneeIds !== undefined) {
        await this.validateAssignees(task.department_id, this.uniqueAssigneeIds(input.updates));
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
      if (input.updates.assigneeIds !== undefined) {
        dbUpdates['assignee_id'] = this.uniqueAssigneeIds(input.updates)[0] || null;
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
          if (dbUpdates['status'] && dbUpdates['status'] !== TaskStatus.COMPLETED) {
            for (const task of existingTasks) {
              if (task.status === TaskStatus.COMPLETED) {
                await this.taskCompletion.reopenInTransaction(trx, task, dbUpdates['status'] as TaskStatus);
              }
            }
          }
          const rows = await trx('tasks')
            .whereIn('id', input.taskIds)
            .andWhere('tenant_id', ctx.tenantId)
            .whereNull('deleted_at')
            .update(dbUpdates)
            .returning('*');
          let rowsWithOwners = rows;
          if (input.updates.assigneeId !== undefined || input.updates.assigneeIds !== undefined) {
            const assigneeIds = this.uniqueAssigneeIds(input.updates);
            const currentAssignees = await trx('task_assignees')
              .where({ tenant_id: ctx.tenantId })
              .whereIn('task_id', input.taskIds)
              .select('task_id', 'user_id');
            const currentByTask = new Map<string, Set<string>>();
            for (const assignee of currentAssignees) {
              const ids = currentByTask.get(assignee.task_id) || new Set<string>();
              ids.add(assignee.user_id);
              currentByTask.set(assignee.task_id, ids);
            }
            const ownerTaskIds = input.taskIds.filter((taskId) =>
              assigneeIds.some((assigneeId) => !currentByTask.get(taskId)?.has(assigneeId)),
            );
            if (ownerTaskIds.length > 0) {
              const ownerRows = await trx('tasks')
                .whereIn('id', ownerTaskIds)
                .andWhere('tenant_id', ctx.tenantId)
                .update({ handoff_owner_id: ctx.userId, updated_at: new Date() })
                .returning('*');
              const ownerByTaskId = new Map(ownerRows.map((task) => [task.id, task]));
              rowsWithOwners = rows.map((task) => ownerByTaskId.get(task.id) || task);
            }
            for (const task of rowsWithOwners) {
              await this.replaceTaskAssignees(task.id, assigneeIds, trx);
            }
          }
          return rowsWithOwners;
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
          if (input.updates.assigneeId !== undefined || input.updates.assigneeIds !== undefined) {
            await this.logActivity(ctx.userId, 'task', task.id, 'task:assigned', {
              assigneeIds: { new: this.uniqueAssigneeIds(input.updates) },
            });
          }
          if (
            input.updates.assigneeId !== undefined ||
            input.updates.assigneeIds !== undefined ||
            input.updates.priority !== undefined
          ) {
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

  private handoffRequiredConflict(): ConflictException {
    return new ConflictException({
      code: 'HANDOFF_CONFIRMATION_REQUIRED',
      message: 'Confirm final handoff before completing this task.',
    });
  }
}
