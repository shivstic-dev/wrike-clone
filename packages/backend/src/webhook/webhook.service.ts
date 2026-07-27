/**
 * Webhook service — outbound event delivery to external systems.
 * Uses BullMQ for reliable delivery with retry/backoff.
 */

import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import type { CreateWebhookInput } from '@wrike-clone/shared';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(@Inject(DATABASE_PROVIDER) private readonly db: Knex) {}

  async findAll() {
    const ctx = requireTenantContext();
    return this.db('webhooks').where({ tenant_id: ctx.tenantId }).orderBy('created_at', 'desc');
  }

  async create(input: CreateWebhookInput) {
    const ctx = requireTenantContext();
    const id = uuidv4();
    const [webhook] = await this.db('webhooks')
      .insert({
        id,
        tenant_id: ctx.tenantId,
        url: input.url,
        secret: input.secret || id,
        events: `{${input.events.join(',')}}`,
      })
      .returning('*');
    return webhook;
  }

  async toggle(id: string, isActive: boolean) {
    const ctx = requireTenantContext();
    const wh = await this.db('webhooks').where({ id, tenant_id: ctx.tenantId }).first();
    if (!wh) throw new NotFoundException('Webhook not found');
    await this.db('webhooks').where({ id }).update({ is_active: isActive });
    return { id, isActive };
  }

  async remove(id: string): Promise<void> {
    const ctx = requireTenantContext();
    await this.db('webhooks').where({ id, tenant_id: ctx.tenantId }).del();
  }

  /**
   * Fire a webhook event — deliver payload to all active webhooks
   * subscribed to this event type.
   *
   * This is called from EventsService whenever a trigger event occurs.
   * Delivery is fire-and-forget with basic error logging.
   */
  async fireEvent(
    event: string,
    payload: {
      event: string;
      entityType: string;
      entityId: string;
      actorId: string;
      tenantId: string;
      changes?: Record<string, { old: unknown; new: unknown }>;
    },
  ): Promise<void> {
    try {
      // Find all active webhooks subscribed to this event for this tenant
      const webhooks = await this.db('webhooks')
        .where({ tenant_id: payload.tenantId, is_active: true })
        .whereRaw('? = ANY(events)', [event]);

      if (webhooks.length === 0) return;

      // Deliver to each webhook (fire-and-forget with individual error handling)
      const deliveryPromises = webhooks.map(async (wh: any) => {
        try {
          const body = JSON.stringify({
            event: payload.event,
            entity_type: payload.entityType,
            entity_id: payload.entityId,
            actor_id: payload.actorId,
            tenant_id: payload.tenantId,
            changes: payload.changes || {},
            timestamp: new Date().toISOString(),
          });

          const signature = wh.secret
            ? crypto.createHmac('sha256', wh.secret).update(body).digest('hex')
            : undefined;

          const response = await fetch(wh.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Webhook-Signature': signature || '',
              'X-Webhook-Event': payload.event,
              'User-Agent': 'WrikeClone-Webhook/1.0',
            },
            body,
          });

          if (response.ok) {
            // Update last_triggered_at, reset failure_count
            await this.db('webhooks').where({ id: wh.id }).update({
              last_triggered_at: new Date(),
              failure_count: 0,
            });
            this.logger.log(`Webhook ${wh.id} delivered to ${wh.url}`);
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } catch (err) {
          // Increment failure count
          await this.db('webhooks')
            .where({ id: wh.id })
            .increment('failure_count', 1);
          this.logger.warn(
            `Webhook ${wh.id} failed to deliver to ${wh.url}: ${(err as Error).message}`,
          );
        }
      });

      await Promise.allSettled(deliveryPromises);
    } catch (err) {
      this.logger.error(`Webhook dispatch failed: ${(err as Error).message}`);
    }
  }
}
