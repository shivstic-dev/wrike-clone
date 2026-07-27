"use strict";
/**
 * @wrike-clone/shared — System-wide constants
 *
 * Configuration values that rarely change but must be consistent
 * between backend and frontend.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROLE_PERMISSIONS = exports.CACHE_KEYS = exports.JOB_STATUS = exports.QUEUES = exports.RATE_LIMIT = exports.SESSION = exports.ALLOWED_VIDEO_TYPES = exports.ALLOWED_IMAGE_TYPES = exports.MAX_FILE_SIZE_BYTES = exports.FOLDER_MAX_DEPTH = exports.TERMINAL_STATUSES = exports.ACTIVE_STATUSES = exports.PAGINATION = void 0;
/** Default pagination sizes. */
exports.PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_PER_PAGE: 25,
    MAX_PER_PAGE: 100,
    MIN_PER_PAGE: 1,
};
/** Task statuses that count as "in progress" for reporting. */
exports.ACTIVE_STATUSES = ['in_progress', 'blocked'];
/** Terminal statuses — tasks at these statuses don't advance further. */
exports.TERMINAL_STATUSES = ['completed'];
/** Maximum depth of folder nesting to prevent infinite recursion. */
exports.FOLDER_MAX_DEPTH = 10;
/** Maximum file upload size (bytes). 100MB. */
exports.MAX_FILE_SIZE_BYTES = 104_857_600;
/** Allowed image MIME types for proofing annotations. */
exports.ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
/** Allowed video MIME types for frame-level proofing. */
exports.ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm'];
/** Session / Auth. */
exports.SESSION = {
    ACCESS_TOKEN_TTL_SEC: 900, // 15 min
    REFRESH_TOKEN_TTL_SEC: 2_592_000, // 30 days
    MAX_SESSIONS_PER_USER: 10,
};
/** Rate limiting defaults. */
exports.RATE_LIMIT = {
    WINDOW_MS: 60_000, // 1 minute
    MAX_REQUESTS: 100, // per window
    AUTH_WINDOW_MS: 60_000,
    AUTH_MAX_REQUESTS: 10, // stricter for auth endpoints
};
/** Automation queue names. */
exports.QUEUES = {
    AUTOMATION: 'automation',
    NOTIFICATIONS: 'notifications',
    WEBHOOKS: 'webhooks',
    EMAIL: 'email',
    LLM: 'llm-actions',
    FILE_PROCESSING: 'file-processing',
};
/** Job statuses for async workers. */
exports.JOB_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying',
};
/** Cache key prefixes. */
exports.CACHE_KEYS = {
    TENANT: 'tenant:',
    USER_PERMISSIONS: 'perm:',
    WORKLOAD_AGG: 'workload:',
};
/** Default RBAC role-permission mappings. */
exports.DEFAULT_ROLE_PERMISSIONS = {
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
//# sourceMappingURL=index.js.map