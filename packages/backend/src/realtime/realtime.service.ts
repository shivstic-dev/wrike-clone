/**
 * Supabase Realtime broadcast publisher.
 *
 * Publishes tenant-scoped task change events over a persistent Supabase
 * Realtime websocket so connected browsers receive updates in ~50ms without
 * polling the API. Keeps the free-tier backend instance cheap: one outbound
 * websocket per process instead of N clients hammering sleepy endpoints.
 *
 * Events are published on a per-tenant channel (`tenant:{id}:tasks`) using
 * the service-role key server-side; browsers subscribe anonymously and only
 * ever hear their own tenant's channel.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

export type TaskRealtimeEvent = 'task.created' | 'task.updated' | 'task.deleted';

/** Deep snake_case -> camelCase key conversion (matches API response shape). */
function toCamelCase(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toCamelCase);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = toCamelCase(val);
  }
  return out;
}

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private client: SupabaseClient | null = null;
  private readonly channels = new Map<string, RealtimeChannel>();
  private readonly joining = new Map<string, Promise<RealtimeChannel>>();
  private readonly enabled: boolean;

  constructor() {
    const url = process.env['SUPABASE_URL']?.replace(/\/+$/, '');
    const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
    this.enabled =
      process.env['REALTIME_BROADCAST_ENABLED'] !== 'false' && Boolean(url && serviceRoleKey);

    if (!this.enabled) {
      this.logger.warn(
        'Realtime broadcast disabled or Supabase env vars missing — clients fall back to polling.',
      );
      return;
    }
    this.client = createClient(url as string, serviceRoleKey as string, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    this.logger.log('Realtime broadcast publisher initialised.');
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Fire-and-forget publish. Never throws — realtime is best-effort;
   * correctness is preserved by existing invalidation/polling paths.
   * Payload keys are converted to camelCase to match the HTTP response shape
   * produced by CamelCaseResponseInterceptor, so browsers can merge the
   * broadcast straight into their React Query caches.
   */
  async publishTaskEvent(
    tenantId: string,
    event: TaskRealtimeEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.enabled || !this.client) return;

    try {
      const channel = await this.getOrCreateChannel(tenantId);
      const result = await channel.send({
        type: 'broadcast',
        event,
        payload: toCamelCase(payload) as Record<string, unknown>,
      });
      if (result !== 'ok') {
        this.logger.debug(`Broadcast '${event}' for tenant ${tenantId} not delivered (${result}).`);
      }
    } catch (err) {
      this.logger.warn(`Failed to publish '${event}' for tenant ${tenantId}: ${String(err)}`);
    }
  }

  /**
   * Channels are created lazily per tenant and reused. Supabase requires a
   * channel to reach 'subscribed' before send(); we await join once, caching
   * both the joined channel and any in-flight join so concurrent publishes
   * never create duplicate channels.
   */
  private getOrCreateChannel(tenantId: string): Promise<RealtimeChannel> {
    const existing = this.channels.get(tenantId);
    if (existing) return Promise.resolve(existing);

    const inflight = this.joining.get(tenantId);
    if (inflight) return inflight;

    const channelName = `tenant:${tenantId}:tasks`;
    const joined = new Promise<RealtimeChannel>((resolve, reject) => {
      const channel = this.client!.channel(channelName, {
        config: { broadcast: { self: false, ack: false }, presence: { key: 'backend' } },
      });
      // Publisher only sends; no inbound handlers needed before subscribing.
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          this.channels.set(tenantId, channel);
          resolve(channel);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          reject(new Error(`Join failed for ${channelName}: ${status}`));
        }
      });
    });

    this.joining.set(tenantId, joined);
    const cleanup = () => this.joining.delete(tenantId);
    void joined.then(cleanup, cleanup);

    // Never block request handling on join; a failed join just skips this event.
    joined.catch(() => this.channels.delete(tenantId));
    return joined;
  }

  async onModuleDestroy(): Promise<void> {
    for (const [tenantId, channel] of this.channels) {
      try {
        await this.client?.removeChannel(channel);
      } catch {
        this.logger.debug(`Channel teardown skipped for tenant ${tenantId}.`);
      }
    }
    this.channels.clear();
  }
}
