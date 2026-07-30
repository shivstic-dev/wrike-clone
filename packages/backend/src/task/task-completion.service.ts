import {
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { Knex } from 'knex';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { TaskCompletionRequest, BulkTaskCompletionRequest } from '@wrike-clone/shared';
import { TaskStatus, HandoffStatus } from '@wrike-clone/shared';
import { DepartmentAccessService } from '../rbac/department-access.service';
import { TaskService } from './task.service';

@Injectable()
export class TaskCompletionService {
  private readonly logger = new Logger(TaskCompletionService.name);

  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccessService: DepartmentAccessService,
    private readonly taskService: TaskService,
  ) {}

  async complete(taskId: string, input: TaskCompletionRequest) {
    const ctx = requireTenantContext();
    const now = new Date().toISOString();

    return this.db.transaction(async (trx) => {
      const task = await trx('tasks')
        .where({ id: taskId, tenant_id: ctx.tenantId })
        .whereNull('deleted_at')
        .first();

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      await this.departmentAccessService.assertCanChangeStatus(
        task.department_id,
        task.id,
        task.assignee_id,
      );


      if (!task.handoff_required || input.outcome === 'confirmed') {
        const nextStatus = TaskStatus.COMPLETED;
        const handoffState = task.handoff_required ? HandoffStatus.CONFIRMED : HandoffStatus.NOT_REQUIRED;

        await trx('tasks')
          .where({ id: taskId, tenant_id: ctx.tenantId })
          .update({
            status: nextStatus,
            completed_at: now,
            handoff_status: handoffState,
            handoff_confirmed_by: task.handoff_required ? ctx.userId : null,
            handoff_confirmed_at: task.handoff_required ? now : null,
            updated_at: now,
          });
      } else {
        // outcome === 'not_yet'
        await trx('tasks')
          .where({ id: taskId, tenant_id: ctx.tenantId })
          .update({
            handoff_status: HandoffStatus.READY,
            handoff_ready_at: now,
            status: task.status === TaskStatus.COMPLETED ? TaskStatus.IN_PROGRESS : task.status,
            completed_at: null,
            updated_at: now,
          });
      }

      return this.taskService.findById(taskId);
    });
  }

  async completeMany(input: BulkTaskCompletionRequest) {
    const results = [];
    const errors = [];

    for (const item of input.items) {
      try {
        const updatedTask = await this.complete(item.taskId, { outcome: item.outcome });
        results.push(updatedTask);
      } catch (err: any) {
        errors.push({
          taskId: item.taskId,
          code: err.status === 403 ? 'FORBIDDEN' : 'NOT_FOUND',
          message: err.message || 'Failed to complete task',
        });
      }
    }

    return { data: results, errors };
  }
}
