/**
 * Time tracking service — log and report billable hours against tasks.
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { CreateTimeEntryInput } from '@wrike-clone/shared';

@Injectable()
export class TimelogService {
  private readonly logger = new Logger(TimelogService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findByTask(taskId: string, page = 1, perPage = 50) {
    const ctx = requireTenantContext();
    const countResult = (await this.db('time_entries')
      .where({ task_id: taskId, tenant_id: ctx.tenantId, deleted_at: null })
      .count()
      .first()) as { count?: string | number } | undefined;

    const entries = await this.db('time_entries')
      .join('users', 'time_entries.user_id', 'users.id')
      .where('time_entries.task_id', taskId)
      .andWhere('time_entries.tenant_id', ctx.tenantId)
      .whereNull('time_entries.deleted_at')
      .select('time_entries.*', 'users.display_name', 'users.avatar_url')
      .orderBy('time_entries.logged_date', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage);

    const total = Number(countResult?.count || 0);
    return { data: entries, meta: { page, perPage, total } };
  }

  async create(input: CreateTimeEntryInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [entry] = await this.db('time_entries')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        task_id: input.taskId,
        user_id: ctx.userId,
        description: input.description || null,
        logged_date: input.loggedDate,
        duration_minutes: input.durationMinutes,
        is_billable: input.isBillable ?? true,
      })
      .returning('*');

    // Update total actual_hours on the task
    await this.db('tasks')
      .where({ id: input.taskId })
      .update({
        actual_hours: this.db.raw('COALESCE(actual_hours, 0) + ?', [input.durationMinutes / 60]),
      });

    return entry;
  }

  async lock(id: string): Promise<void> {
    const ctx = requireTenantContext();
    const entry = await this.db('time_entries').where({ id, tenant_id: ctx.tenantId }).first();
    if (!entry) throw new NotFoundException('Time entry not found');
    await this.db('time_entries').where({ id }).update({ is_locked: true });
  }
}
