/**
 * Supabase Realtime subscriber.
 *
 * Listens for backend-published task broadcasts on the tenant channel and
 * patches the React Query cache directly — sub-second cross-user updates
 * with zero extra API load on the free-tier backend.
 *
 * Gracefully degrades: if VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not
 * configured, `isRealtimeAvailable` is false and hooks fall back to
 * visibility-aware adaptive polling.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_URL : undefined;
const SUPABASE_ANON_KEY =
  typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SUPABASE_ANON_KEY : undefined;

export const isRealtimeAvailable = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

export interface TaskBroadcastPayload {
  task?: Record<string, unknown> & { id?: string };
  id?: string;
}

export interface TaskRealtimeHandlers {
  onCreated: (task: Record<string, unknown>) => void;
  onUpdated: (task: Record<string, unknown>, changes?: unknown) => void;
  onDeleted: (id: string) => void;
  onStatusChange: (status: 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED') => void;
}

/** Subscribe to this tenant's task broadcast channel. Returns an unsubscribe fn. */
export function subscribeToTaskEvents(
  tenantId: string,
  handlers: TaskRealtimeHandlers,
): () => void {
  if (!isRealtimeAvailable || !tenantId) return () => undefined;

  const supabase = getClient();
  let channel: RealtimeChannel | null = supabase.channel(`tenant:${tenantId}:tasks`, {
    config: { broadcast: { self: false, ack: false }, presence: { key: crypto.randomUUID() } },
  });

  channel
    .on('broadcast', { event: 'task.created' }, ({ payload }) => {
      if (payload?.task?.id) handlers.onCreated(payload.task as Record<string, unknown>);
    })
    .on('broadcast', { event: 'task.updated' }, ({ payload }) => {
      if (payload?.task?.id) {
        handlers.onUpdated(payload.task as Record<string, unknown>, payload.changes as unknown);
      }
    })
    .on('broadcast', { event: 'task.deleted' }, ({ payload }) => {
      if (payload?.id) handlers.onDeleted(String(payload.id));
    })
    .subscribe((status) => handlers.onStatusChange(status));

  return () => {
    if (channel) {
      void supabase.removeChannel(channel);
      channel = null;
    }
  };
}
