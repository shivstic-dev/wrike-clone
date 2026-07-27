/**
 * Webhook service — outbound event delivery to external systems.
 * Uses BullMQ for reliable delivery with retry/backoff.
 */

import { BadRequestException, Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { lookup } from 'dns/promises';
import { isIP } from 'net';
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
    await this.assertSafeWebhookUrl(input.url);
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
          await this.assertSafeWebhookUrl(wh.url);
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
              'User-Agent': 'OpenWorkHub-Webhook/1.0',
            },
            body,
            redirect: 'error',
            signal: AbortSignal.timeout(10_000),
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
          await this.db('webhooks').where({ id: wh.id }).increment('failure_count', 1);
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

  private async assertSafeWebhookUrl(rawUrl: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Webhook URL is invalid');
    }

    const allowedProtocols =
      process.env['NODE_ENV'] === 'production' ? ['https:'] : ['https:', 'http:'];
    if (!allowedProtocols.includes(url.protocol) || url.username || url.password) {
      throw new BadRequestException('Webhook URL must use HTTPS and cannot contain credentials');
    }

    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new BadRequestException('Webhook URL cannot target localhost');
    }

    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookup(hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => this.isPrivateIp(address))) {
      throw new BadRequestException('Webhook URL resolves to a private or reserved network');
    }
  }

  private isPrivateIp(address: string): boolean {
    const normalized = address.toLowerCase();
    if (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    ) {
      return true;
    }

    const ipv4 = normalized.startsWith('::ffff:') ? normalized.slice('::ffff:'.length) : normalized;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ipv4)) return false;

    const octets = ipv4.split('.').map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
}
