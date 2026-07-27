/**
 * Frontend-local enum value constants.
 * Mirrors the values from @wrike-clone/shared enums for runtime use,
 * since the shared package uses CommonJS output that Rollup can't statically analyze.
 */
export const TASK_STATUS = {
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
} as const;

export const TASK_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;
