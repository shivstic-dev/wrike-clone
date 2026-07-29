import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  BulkTaskCompletionRequest,
  BulkTaskCompletionResult,
  HandoffStatus,
  TaskCompletionRequest,
  TaskStatus,
} from '@wrike-clone/shared';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { requireTenantContext } from '../common/tenant-context';
import { DATABASE_PROVIDER } from '../database/database.module';
import { NotificationService } from '../notification/notification.service';
import { DepartmentAccessService } from '../rbac/department-access.service';

type TaskRow = Record<string, any>;

@Injectable()
export class TaskCompletionService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
    private readonly notifications: NotificationService,
  ) {}

  async complete(taskId: string, input: TaskCompletionRequest): Promise<Record<string, unknown>> {
    const ctx = requireTenantContext();

    return this.db.transaction(async (trx) => {
      const task = await this.lockTask(trx, taskId);
      await this.departmentAccess.assertCanChangeStatus(
        task.department_id,
        task.id,
        task.assignee_id,
      );

      if (input.outcome === 'not_yet') {
        return this.markReadyForHandoff(trx, task);
      }

      return this.confirmAndComplete(trx, task, ctx.userId);
    });
  }

  async completeMany(input: BulkTaskCompletionRequest): Promise<BulkTaskCompletionResult> {
    const data: any[] = [];
    const errors: BulkTaskCompletionResult['errors'] = [];

    for (const item of input.items) {
      try {
        data.push(await this.complete(item.taskId, { outcome: item.outcome }));
      } catch (error) {
        errors.push({ taskId: item.taskId, ...this.toBulkError(error) });
      }
    }

    return { data: data as BulkTaskCompletionResult['data'], errors };
  }

  async reopenInTransaction(
    trx: Knex.Transaction,
    task: Record<string, unknown>,
    nextStatus: TaskStatus,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenantContext();
    const existing = task as TaskRow;
    const updates: Record<string, unknown> = {
      status: nextStatus,
      completed_at: nextStatus === TaskStatus.COMPLETED ? existing.completed_at || new Date() : null,
      updated_at: new Date(),
    };

    if (existing.handoff_required) {
      updates.handoff_status = HandoffStatus.PENDING;
      updates.handoff_ready_at = null;
      updates.handoff_confirmed_by = null;
      updates.handoff_confirmed_at = null;
    } else {
      updates.handoff_status = HandoffStatus.NOT_REQUIRED;
    }

    const [updated] = await trx('tasks')
      .where({ id: existing.id, tenant_id: ctx.tenantId })
      .whereNull('deleted_at')
      .update(updates)
      .returning('*');
    if (!updated) throw new NotFoundException('Task not found');
    return updated;
  }

  private async lockTask(trx: Knex.Transaction, taskId: string): Promise<TaskRow> {
    const ctx = requireTenantContext();
    const task = await trx('tasks')
      .where({ id: taskId, tenant_id: ctx.tenantId })
      .whereNull('deleted_at')
      .forUpdate()
      .first();
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async confirmAndComplete(
    trx: Knex.Transaction,
    task: TaskRow,
    actorId: string,
  ): Promise<TaskRow> {
    if (task.status === TaskStatus.COMPLETED) return task;

    const updates: Record<string, unknown> = {
      status: TaskStatus.COMPLETED,
      completed_at: new Date(),
      updated_at: new Date(),
    };
    if (task.handoff_required) {
      updates.handoff_status = HandoffStatus.CONFIRMED;
      updates.handoff_confirmed_by = actorId;
      updates.handoff_confirmed_at = new Date();
    }

    const [updated] = await trx('tasks')
      .where({ id: task.id, tenant_id: task.tenant_id })
      .update(updates)
      .returning('*');
    if (!updated) throw new NotFoundException('Task not found');

    await this.logActivity(trx, task.id, 'task:handoff:confirmed', {
      status: { old: task.status, new: TaskStatus.COMPLETED },
      handoffStatus: { old: task.handoff_status, new: updates.handoff_status || task.handoff_status },
    });
    return updated;
  }

  private async markReadyForHandoff(trx: Knex.Transaction, task: TaskRow): Promise<TaskRow> {
    if (!task.handoff_required) {
      throw new ConflictException({
        code: 'HANDOFF_CONFIRMATION_REQUIRED',
        message: 'Confirm final handoff before completing this task.',
      });
    }

    const nextStatus = task.status === TaskStatus.COMPLETED ? TaskStatus.IN_PROGRESS : task.status;
    const changesNeeded = task.handoff_status !== HandoffStatus.READY || nextStatus !== task.status;
    let updated = task;
    if (changesNeeded) {
      const [row] = await trx('tasks')
        .where({ id: task.id, tenant_id: task.tenant_id })
        .update({
          status: nextStatus,
          completed_at: nextStatus === TaskStatus.COMPLETED ? task.completed_at : null,
          handoff_status: HandoffStatus.READY,
          handoff_ready_at: task.handoff_ready_at || new Date(),
          updated_at: new Date(),
        })
        .returning('*');
      if (!row) throw new NotFoundException('Task not found');
      updated = row;
      await this.logActivity(trx, task.id, 'task:handoff:ready', {
        status: { old: task.status, new: nextStatus },
        handoffStatus: { old: task.handoff_status, new: HandoffStatus.READY },
      });
    }

    await this.createReadyNotifications(trx, task);
    return updated;
  }

  private async createReadyNotifications(trx: Knex.Transaction, task: TaskRow): Promise<void> {
    const ctx = requireTenantContext();
    const assignees = await trx('task_assignees')
      .where({ tenant_id: ctx.tenantId, task_id: task.id })
      .select('user_id');
    const recipients = new Set<string>(assignees.map((row: { user_id: string }) => row.user_id));
    if (task.handoff_owner_id) recipients.add(task.handoff_owner_id);

    for (const userId of recipients) {
      const existing = await trx('notifications')
        .where({
          tenant_id: ctx.tenantId,
          user_id: userId,
          type: 'handoff_ready',
          is_read: false,
        })
        .whereRaw("data::jsonb @> ?::jsonb", [JSON.stringify({ taskId: task.id })])
        .first();
      if (existing) continue;
      await this.notifications.create(
        {
          userId,
          type: 'handoff_ready',
          title: 'Ready for handoff',
          body: `Confirm whether “${task.title}” has been shared with the intended recipient.`,
          data: { taskId: task.id, handoffOwnerId: task.handoff_owner_id || null },
        },
        trx,
      );
    }
  }

  private async logActivity(
    trx: Knex.Transaction,
    taskId: string,
    action: string,
    changes: Record<string, unknown>,
  ): Promise<void> {
    const ctx = requireTenantContext();
    await trx('activity_logs').insert({
      id: uuidv4(),
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      entity_type: 'task',
      entity_id: taskId,
      action,
      changes: JSON.stringify(changes),
      metadata: '{}',
    });
  }

  private toBulkError(error: unknown): Omit<BulkTaskCompletionResult['errors'][number], 'taskId'> {
    const response = typeof (error as any)?.getResponse === 'function'
      ? (error as any).getResponse()
      : undefined;
    if ((error as any)?.status === 404) {
      return { code: 'NOT_FOUND', message: 'Task not found' };
    }
    if (response && typeof response === 'object' && (response as any).code === 'HANDOFF_CONFIRMATION_REQUIRED') {
      return { code: 'HANDOFF_CONFIRMATION_REQUIRED', message: (response as any).message };
    }
    return { code: 'FORBIDDEN', message: (error as Error)?.message || 'Task completion is not permitted' };
  }
}
