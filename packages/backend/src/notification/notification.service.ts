/**
 * Notification service.
 * Creates and delivers in-app notifications. Integrates with WebSocket
 * for real-time delivery. v1 uses synchronous fan-out (no BullMQ).
 */

import { Injectable, Inject } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { TriggerEvent } from '../common/events.service';

export interface CreateNotificationInput {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  priority?: number;
}

@Injectable()
export class NotificationService {
  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findAll(page = 1, perPage = 50) {
    const ctx = requireTenantContext();
    const countResult = (await this.db('notifications')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId })
      .count()
      .first()) as { count?: string | number } | undefined;

    const data = await this.db('notifications')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId })
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset((page - 1) * perPage);

    const unreadCount = await this.db('notifications')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId, is_read: false })
      .count('* as count')
      .first();

    return {
      data,
      meta: {
        page,
        perPage,
        total: Number(countResult?.count || 0),
        unreadCount: Number(unreadCount?.count || 0),
      },
    };
  }

  async create(input: CreateNotificationInput, executor: Knex | Knex.Transaction = this.db) {
    const ctx = requireTenantContext();
    const [notification] = await executor('notifications')
      .insert({
        id: uuidv4(),
        tenant_id: ctx.tenantId,
        user_id: input.userId,
        type: input.type,
        title: input.title,
        body: input.body || null,
        data: input.data ? JSON.stringify(input.data) : '{}',
        priority: input.priority || 0,
      })
      .returning('*');
    return notification;
  }

  async markAsRead(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('notifications')
      .where({ id, tenant_id: ctx.tenantId, user_id: ctx.userId })
      .update({ is_read: true });
  }

  async markAllAsRead(): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('notifications')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId, is_read: false })
      .update({ is_read: true });
  }

  async getUnreadCount(): Promise<number> {
    const ctx = requireTenantContext();
    const result = await this.db('notifications')
      .where({ tenant_id: ctx.tenantId, user_id: ctx.userId, is_read: false })
      .count('* as count')
      .first();
    return Number(result?.count || 0);
  }

  /**
   * Fan-out notifications in response to a trigger event (synchronous v1).
   * Phase 6: this will be dispatched via BullMQ when Redis is available.
   */
  async fanOutSync(_event: string, _payload: TriggerEvent): Promise<void> {
    try {
      const ctx = requireTenantContext();

      // v1: Create notification for the task assignee on assignment
      if (_event === 'task:assigned' && _payload.changes?.assigneeId?.new) {
        const assigneeId = _payload.changes.assigneeId.new as string;
        await this.create({
          userId: assigneeId,
          type: 'task_assigned',
          title: 'You have been assigned a task',
          body: `Task ${_payload.entityId} was assigned to you`,
          data: { entityType: _payload.entityType, entityId: _payload.entityId },
        });
      }

      // v1: Notify task assignee on comments
      if (_event === 'task:comment:added') {
        // Find the task owner
        const task = await this.db('tasks')
          .where({ id: _payload.entityId, tenant_id: ctx.tenantId })
          .first();
        if (task && task.assignee_id && task.assignee_id !== _payload.actorId) {
          await this.create({
            userId: task.assignee_id,
            type: 'task_commented',
            title: 'New comment on your task',
            body: `A comment was added to ${task.title}`,
            data: { entityType: _payload.entityType, entityId: _payload.entityId },
          });
        }
      }
    } catch (err) {
      // Log but never throw from notification fan-out
      console.warn(`Notification fanOutSync error: ${(err as Error).message}`);
    }
  }
}
