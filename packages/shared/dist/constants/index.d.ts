/**
 * @wrike-clone/shared — System-wide constants
 *
 * Configuration values that rarely change but must be consistent
 * between backend and frontend.
 */
/** Default pagination sizes. */
export declare const PAGINATION: {
    readonly DEFAULT_PAGE: 1;
    readonly DEFAULT_PER_PAGE: 25;
    readonly MAX_PER_PAGE: 100;
    readonly MIN_PER_PAGE: 1;
};
/** Task statuses that count as "in progress" for reporting. */
export declare const ACTIVE_STATUSES: readonly ["in_progress", "blocked"];
/** Terminal statuses — tasks at these statuses don't advance further. */
export declare const TERMINAL_STATUSES: readonly ["completed"];
/** Maximum depth of folder nesting to prevent infinite recursion. */
export declare const FOLDER_MAX_DEPTH = 10;
/** Maximum file upload size (bytes). 100MB. */
export declare const MAX_FILE_SIZE_BYTES = 104857600;
/** Allowed image MIME types for proofing annotations. */
export declare const ALLOWED_IMAGE_TYPES: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Allowed video MIME types for frame-level proofing. */
export declare const ALLOWED_VIDEO_TYPES: readonly ["video/mp4", "video/webm"];
/** Session / Auth. */
export declare const SESSION: {
    readonly ACCESS_TOKEN_TTL_SEC: 900;
    readonly REFRESH_TOKEN_TTL_SEC: 2592000;
    readonly MAX_SESSIONS_PER_USER: 10;
};
/** Rate limiting defaults. */
export declare const RATE_LIMIT: {
    readonly WINDOW_MS: 60000;
    readonly MAX_REQUESTS: 100;
    readonly AUTH_WINDOW_MS: 60000;
    readonly AUTH_MAX_REQUESTS: 10;
};
/** Automation queue names. */
export declare const QUEUES: {
    readonly AUTOMATION: "automation";
    readonly NOTIFICATIONS: "notifications";
    readonly WEBHOOKS: "webhooks";
    readonly EMAIL: "email";
    readonly LLM: "llm-actions";
    readonly FILE_PROCESSING: "file-processing";
};
/** Job statuses for async workers. */
export declare const JOB_STATUS: {
    readonly PENDING: "pending";
    readonly PROCESSING: "processing";
    readonly COMPLETED: "completed";
    readonly FAILED: "failed";
    readonly RETRYING: "retrying";
};
/** Cache key prefixes. */
export declare const CACHE_KEYS: {
    readonly TENANT: "tenant:";
    readonly USER_PERMISSIONS: "perm:";
    readonly WORKLOAD_AGG: "workload:";
};
/** Default RBAC role-permission mappings. */
export declare const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]>;
//# sourceMappingURL=index.d.ts.map