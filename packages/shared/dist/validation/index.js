"use strict";
/**
 * @wrike-clone/shared — Zod validation schemas
 *
 * Every API input is validated against these schemas before reaching
 * business logic. Shared between backend (server-side validation) and
 * frontend (form validation), so rules never diverge.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.updateWorkspaceMemberRoleSchema = exports.addWorkspaceMemberSchema = exports.createWebhookSchema = exports.submitApprovalVoteSchema = exports.createApprovalSchema = exports.createAutomationRuleSchema = exports.createTimeEntrySchema = exports.createCommentSchema = exports.createDependencySchema = exports.bulkTaskUpdateSchema = exports.taskFilterSchema = exports.updateTaskSchema = exports.createTaskSchema = exports.updateProjectSchema = exports.createProjectSchema = exports.updateFolderSchema = exports.createFolderSchema = exports.updateWorkspaceSchema = exports.createWorkspaceSchema = exports.updateMembershipSchema = exports.inviteUserSchema = exports.updateTenantSchema = exports.createTenantSchema = exports.changePasswordSchema = exports.refreshTokenSchema = exports.loginSchema = exports.isoDate = exports.slugField = exports.uuidField = void 0;
const zod_1 = require("zod");
const enums_1 = require("../enums");
// ── Helpers ────────────────────────────────────────────────────
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugRegex = /^[a-z0-9-]+$/;
exports.uuidField = zod_1.z.string().regex(uuidRegex, 'Invalid UUID format');
exports.slugField = zod_1.z.string().min(2).max(64).regex(slugRegex, 'Only lowercase letters, numbers, and hyphens');
exports.isoDate = zod_1.z.string().datetime({ offset: true }).or(zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?(\.\d{3})?Z?$/));
// ── Auth ───────────────────────────────────────────────────────
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8).max(256),
    tenantSlug: exports.slugField.optional(), // optional when DEFAULT_TENANT_SLUG is set
});
exports.refreshTokenSchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(8).max(256),
}).refine((d) => d.currentPassword !== d.newPassword, 'New password must be different from current password');
// ── Tenant ─────────────────────────────────────────────────────
exports.createTenantSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128),
    slug: exports.slugField,
    domain: zod_1.z.string().max(256).optional(),
});
exports.updateTenantSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128).optional(),
    settings: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine(d => Object.keys(d).length > 0, 'At least one field required');
// ── User ───────────────────────────────────────────────────────
exports.inviteUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    role: zod_1.z.nativeEnum(enums_1.TenantRole),
    message: zod_1.z.string().max(500).optional(),
});
exports.updateMembershipSchema = zod_1.z.object({
    role: zod_1.z.nativeEnum(enums_1.TenantRole),
});
// ── Workspace ──────────────────────────────────────────────────
exports.createWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128),
    description: zod_1.z.string().max(2000).optional(),
    icon: zod_1.z.string().max(64).optional(),
});
exports.updateWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128).optional(),
    description: zod_1.z.string().max(2000).optional(),
    icon: zod_1.z.string().max(64).optional(),
}).refine(d => Object.keys(d).length > 0, 'At least one field required');
// ── Folder ─────────────────────────────────────────────────────
exports.createFolderSchema = zod_1.z.object({
    workspaceId: exports.uuidField,
    parentFolderId: exports.uuidField.optional(),
    name: zod_1.z.string().min(1).max(128),
    description: zod_1.z.string().max(2000).optional(),
    icon: zod_1.z.string().max(64).optional(),
});
exports.updateFolderSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128).optional(),
    description: zod_1.z.string().max(2000).optional(),
    icon: zod_1.z.string().max(64).optional(),
    isArchived: zod_1.z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, 'At least one field required');
// ── Project ────────────────────────────────────────────────────
exports.createProjectSchema = zod_1.z.object({
    folderId: exports.uuidField,
    name: zod_1.z.string().min(1).max(128),
    description: zod_1.z.string().max(5000).optional(),
    startDate: exports.isoDate.optional(),
    dueDate: exports.isoDate.optional(),
    priority: zod_1.z.nativeEnum(enums_1.TaskPriority).optional(),
    budget: zod_1.z.number().nonnegative().optional(),
    visibility: zod_1.z.enum(['organization', 'department']).optional().default('department'),
});
exports.updateProjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128).optional(),
    description: zod_1.z.string().max(5000).optional(),
    status: zod_1.z.enum(['active', 'on_hold', 'completed', 'cancelled']).optional(),
    startDate: exports.isoDate.nullable().optional(),
    dueDate: exports.isoDate.nullable().optional(),
    priority: zod_1.z.nativeEnum(enums_1.TaskPriority).optional(),
    budget: zod_1.z.number().nonnegative().optional(),
    actualCost: zod_1.z.number().nonnegative().optional(),
    visibility: zod_1.z.enum(['organization', 'department']).optional(),
}).refine(d => Object.keys(d).length > 0, 'At least one field required');
// ── Task ───────────────────────────────────────────────────────
exports.createTaskSchema = zod_1.z.object({
    projectId: exports.uuidField,
    parentTaskId: exports.uuidField.optional(),
    assigneeId: exports.uuidField.optional(),
    title: zod_1.z.string().min(1).max(500),
    description: zod_1.z.string().max(10000).optional(),
    status: zod_1.z.nativeEnum(enums_1.TaskStatus).optional(),
    priority: zod_1.z.nativeEnum(enums_1.TaskPriority).optional(),
    estimatedHours: zod_1.z.number().nonnegative().optional(),
    startDate: exports.isoDate.optional(),
    dueDate: exports.isoDate.optional(),
    customFields: zod_1.z.record(zod_1.z.unknown()).optional(),
});
exports.updateTaskSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(500).optional(),
    description: zod_1.z.string().max(10000).optional(),
    status: zod_1.z.nativeEnum(enums_1.TaskStatus).optional(),
    priority: zod_1.z.nativeEnum(enums_1.TaskPriority).optional(),
    assigneeId: exports.uuidField.nullable().optional(),
    estimatedHours: zod_1.z.number().nonnegative().optional(),
    actualHours: zod_1.z.number().nonnegative().optional(),
    startDate: exports.isoDate.nullable().optional(),
    dueDate: exports.isoDate.nullable().optional(),
    sortOrder: zod_1.z.number().int().optional(),
    customFields: zod_1.z.record(zod_1.z.unknown()).optional(),
}).refine(d => Object.keys(d).length > 0, 'At least one field required');
exports.taskFilterSchema = zod_1.z.object({
    projectId: exports.uuidField.optional(),
    assigneeId: exports.uuidField.optional(),
    status: zod_1.z.array(zod_1.z.nativeEnum(enums_1.TaskStatus)).optional(),
    priority: zod_1.z.array(zod_1.z.nativeEnum(enums_1.TaskPriority)).optional(),
    search: zod_1.z.string().max(200).optional(),
    dueDateBefore: exports.isoDate.optional(),
    dueDateAfter: exports.isoDate.optional(),
    folderId: exports.uuidField.optional(),
    page: zod_1.z.coerce.number().int().positive().optional().default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional().default(25),
});
exports.bulkTaskUpdateSchema = zod_1.z.object({
    taskIds: zod_1.z.array(exports.uuidField).min(1).max(100),
    updates: exports.updateTaskSchema,
});
// ── Dependencies ───────────────────────────────────────────────
exports.createDependencySchema = zod_1.z.object({
    taskId: exports.uuidField,
    dependsOnTaskId: exports.uuidField,
    dependencyType: zod_1.z.nativeEnum(enums_1.DependencyType),
    lagDays: zod_1.z.number().int().nonnegative().optional().default(0),
});
// ── Comments ───────────────────────────────────────────────────
exports.createCommentSchema = zod_1.z.object({
    taskId: exports.uuidField,
    content: zod_1.z.string().min(1).max(10000),
    parentCommentId: exports.uuidField.optional(),
    attachments: zod_1.z.array(zod_1.z.string()).max(10).optional(),
});
// ── Time Entry ─────────────────────────────────────────────────
exports.createTimeEntrySchema = zod_1.z.object({
    taskId: exports.uuidField,
    description: zod_1.z.string().max(500).optional(),
    loggedDate: exports.isoDate,
    durationMinutes: zod_1.z.number().int().positive().max(1440),
    isBillable: zod_1.z.boolean().optional().default(true),
});
// ── Automation ─────────────────────────────────────────────────
exports.createAutomationRuleSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(128),
    triggerEvent: zod_1.z.nativeEnum(enums_1.TriggerEvent),
    conditions: zod_1.z.array(zod_1.z.object({
        field: zod_1.z.string(),
        operator: zod_1.z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'changed_to', 'is_set', 'is_not_set']),
        value: zod_1.z.unknown(),
    })).max(20),
    actions: zod_1.z.array(zod_1.z.object({
        type: zod_1.z.enum(['update_field', 'assign_user', 'change_status', 'send_notification', 'create_task', 'webhook', 'llm_action']),
        config: zod_1.z.record(zod_1.z.unknown()),
    })).min(1).max(10),
});
// ── Approvals ──────────────────────────────────────────────────
exports.createApprovalSchema = zod_1.z.object({
    taskId: exports.uuidField,
    chainId: exports.uuidField,
});
exports.submitApprovalVoteSchema = zod_1.z.object({
    status: zod_1.z.enum(['approved', 'rejected', 'changes_requested']),
    comment: zod_1.z.string().max(2000).optional(),
});
// ── Webhook ────────────────────────────────────────────────────
exports.createWebhookSchema = zod_1.z.object({
    url: zod_1.z.string().url().max(500),
    events: zod_1.z.array(zod_1.z.string()).min(1).max(50),
    secret: zod_1.z.string().min(16).max(256).optional(),
});
// ── Workspace Members ────────────────────────────────────────────
exports.addWorkspaceMemberSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    displayName: zod_1.z.string().min(1).max(128),
    tempPassword: zod_1.z.string().min(8).max(256),
    role: zod_1.z.enum(['dept_admin', 'member']),
});
exports.updateWorkspaceMemberRoleSchema = zod_1.z.object({
    role: zod_1.z.enum(['dept_admin', 'member']),
});
// ── Pagination ─────────────────────────────────────────────────
exports.paginationSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().optional().default(1),
    perPage: zod_1.z.coerce.number().int().min(1).max(100).optional().default(25),
    sortBy: zod_1.z.string().optional(),
    sortDirection: zod_1.z.enum(['asc', 'desc']).optional().default('asc'),
});
//# sourceMappingURL=index.js.map