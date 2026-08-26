/**
 * Visibility-aware adaptive polling fallback.
 *
 * When Supabase Realtime is connected, polling is off entirely. When it is
 * unavailable (missing env vars or a dropped channel), task queries poll at
 * a base interval that decays while the tab stays hidden — so background
 * tabs cost zero requests and never wake the sleeping free-tier backend.
 */

import { useEffect, useState } from 'react';

const BASE_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 60_000;

/**
 * refetchInterval resolver for React Query.
 * Usage: `refetchInterval: adaptivePollingRefetchInterval(realtimeActive)`
 */
export function adaptivePollingRefetchInterval(realtimeActive: boolean): number | false {
  if (realtimeActive) return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return false;
  }
  return BASE_INTERVAL_MS;
}

/**
 * Returns how long the tab has been hidden, for hooks that want to force a
 * single refresh when the user returns (React Query's refetchOnWindowFocus
 * is disabled app-wide, so we do it per-query via enabled gating).
 */
export function useTabVisible(): boolean {
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return visible;
}

export const POLLING_MAX_BACKOFF_MS = MAX_BACKOFF_MS;
