/**
 * @wrike-clone/shared — System-wide constants
 *
 * Configuration values that rarely change but must be consistent
 * between backend and frontend.
 */

/** Default pagination sizes. */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PER_PAGE: 25,
  MAX_PER_PAGE: 100,
  MIN_PER_PAGE: 1,
} as const;

/** Task statuses that count as "in progress" for reporting. */
export const ACTIVE_STATUSES = ['in_progress', 'blocked'] as const;

/** Terminal statuses — tasks at these statuses don't advance further. */
export const TERMINAL_STATUSES = ['completed'] as const;

/** Maximum depth of folder nesting to prevent infinite recursion. */
export const FOLDER_MAX_DEPTH = 10;

/** Maximum file upload size (bytes). 100MB. */
export const MAX_FILE_SIZE_BYTES = 104_857_600;

/** Allowed image MIME types for proofing annotations. */
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

/** Allowed video MIME types for frame-level proofing. */
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'] as const;

/** Session / Auth. */
export const SESSION = {
  ACCESS_TOKEN_TTL_SEC: 900, // 15 min
  REFRESH_TOKEN_TTL_SEC: 2_592_000, // 30 days
  MAX_SESSIONS_PER_USER: 10,
} as const;

/** Rate limiting defaults. */
export const RATE_LIMIT = {
  WINDOW_MS: 60_000, // 1 minute
  MAX_REQUESTS: 100, // per window
  AUTH_WINDOW_MS: 60_000,
  AUTH_MAX_REQUESTS: 10, // stricter for auth endpoints
} as const;

/** Automation queue names. */
export const QUEUES = {
  AUTOMATION: 'automation',
  NOTIFICATIONS: 'notifications',
  WEBHOOKS: 'webhooks',
  EMAIL: 'email',
  LLM: 'llm-actions',
  FILE_PROCESSING: 'file-processing',
} as const;

/** Job statuses for async workers. */
export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying',
} as const;

/** Cache key prefixes. */
export const CACHE_KEYS = {
  TENANT: 'tenant:',
  USER_PERMISSIONS: 'perm:',
  WORKLOAD_AGG: 'workload:',
} as const;

/** Default RBAC role-permission mappings. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'], // wildcard = all permissions
  manager: [
    'workspace:read',
    'folder:read',
    'project:read',
    'task:create',
    'task:read',
    'task:write',
    'task:delete',
    'task:assign',
    'task:status:update',
    'task:comment',
  ],
  member: [
    'workspace:read',
    'folder:read',
    'project:read',
    'task:read',
    'task:status:update',
    'task:comment',
  ],
  employee: [
    'workspace:read',
    'folder:read',
    'project:read',
    'task:read',
    'task:status:update',
    'task:comment',
  ],
  guest: [
    'task:read',
    'task:comment', // can comment/proof
  ],
  collaborator: ['task:read', 'task:write', 'task:comment', 'folder:read', 'project:read'],
};
