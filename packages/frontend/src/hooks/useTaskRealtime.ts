/**
 * Bridges Supabase Realtime task broadcasts into the React Query cache.
 *
 * Mounted once inside the authenticated shell. While connected, all open
 * task views update within ~50ms of any tenant-side change without issuing
 * API requests.
 */

import { useEffect, useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import type { Task } from '@wrike-clone/shared';
import { isRealtimeAvailable, subscribeToTaskEvents } from '../lib/realtime';
import { applyTaskToCache, removeTaskFromCache } from '../lib/taskCache';
import { getTenantId } from '../api/client';

// Bound once in App.tsx so the subscription never depends on being rendered
// under a QueryClientProvider (keeps isolated component tests working).
let boundQueryClient: QueryClient | null = null;

export function bindTaskRealtimeCache(client: QueryClient): void {
  boundQueryClient = client;
}

// --- Tiny reactive store for connection status (drives polling fallback) ---
type RealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'down';

let status: RealtimeStatus = isRealtimeAvailable ? 'connecting' : 'disabled';
const listeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  for (const notify of listeners) notify();
}

function subscribeStatus(notify: () => void): () => void {
  listeners.add(notify);
  return () => listeners.delete(notify);
}

export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(subscribeStatus, () => status);
}

/** True when realtime covers change propagation and polling can stay off. */
export function useRealtimeActive(): boolean {
  const current = useRealtimeStatus();
  return current === 'connected';
}

export function useTaskRealtime(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !isRealtimeAvailable) return;
    const queryClient = boundQueryClient;
    if (!queryClient) return;

    const tenantId = getTenantId();
    if (!tenantId) return;

    const unsubscribe = subscribeToTaskEvents(tenantId, {
      onCreated: (task) => applyTaskToCache(queryClient, task as Partial<Task> & { id: string }),
      onUpdated: (task) => {
        // Broadcasts carry full task snapshots, so writes are idempotent —
        // rapid bursts simply overwrite each other with newer state.
        // Merge-only: an update must never inject into filtered lists.
        applyTaskToCache(queryClient, task as Partial<Task> & { id: string }, { upsert: false });
      },
      onDeleted: (id) => removeTaskFromCache(queryClient, id),
      onStatusChange: (next) => {
        if (next === 'SUBSCRIBED') setStatus('connected');
        else if (next === 'CHANNEL_ERROR' || next === 'TIMED_OUT') setStatus('down');
        else if (next === 'CLOSED') setStatus('connecting');
      },
    });

    return unsubscribe;
  }, [enabled]);
}
