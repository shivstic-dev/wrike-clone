/**
 * @wrike-clone/shared — Zod validation schemas
 *
 * Every API input is validated against these schemas before reaching
 * business logic. Shared between backend (server-side validation) and
 * frontend (form validation), so rules never diverge.
 */

import { z } from 'zod';
import { TaskStatus, TaskPriority, DependencyType, TriggerEvent, TenantRole } from '../enums';

// ── Helpers ────────────────────────────────────────────────────

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slugRegex = /^[a-z0-9-]+$/;

export const uuidField = z.string().regex(uuidRegex, 'Invalid UUID format');
export const slugField = z
  .string()
  .min(2)
  .max(64)
  .regex(slugRegex, 'Only lowercase letters, numbers, and hyphens');
export const isoDate = z
  .string()
  .datetime({ offset: true })
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?(\.\d{3})?Z?$/));

// ── Auth ───────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(256),
  tenantSlug: slugField.optional(), // optional when DEFAULT_TENANT_SLUG is set
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12).max(256),
  displayName: z.string().trim().min(1).max(128),
  tenantSlug: slugField,
});

export const adminResetPasswordSchema = z.object({
  userId: uuidField,
  tempPassword: z.string().min(12).max(256),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(256),
  })
  .refine(
    (d) => d.currentPassword !== d.newPassword,
    'New password must be different from current password',
  );

// ── Tenant ─────────────────────────────────────────────────────

export const createTenantSchema = z.object({
  name: z.string().min(1).max(128),
  slug: slugField,
  domain: z.string().max(256).optional(),
});

export const bootstrapTenantSchema = z.object({
  tenant: createTenantSchema,
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(12).max(256),
    displayName: z.string().trim().min(1).max(128),
  }),
});

export const updateTenantSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    settings: z.record(z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'At least one field required');

// ── User ───────────────────────────────────────────────────────

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(TenantRole),
  message: z.string().max(500).optional(),
});

export const updateMembershipSchema = z.object({
  role: z.nativeEnum(TenantRole),
});

// ── Workspace ──────────────────────────────────────────────────

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  icon: z.string().max(64).optional(),
});

export const updateWorkspaceSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(2000).optional(),
    icon: z.string().max(64).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'At least one field required');

// ── Folder ─────────────────────────────────────────────────────

export const createFolderSchema = z.object({
  workspaceId: uuidField,
  parentFolderId: uuidField.optional(),
  name: z.string().min(1).max(128),
  description: z.string().max(2000).optional(),
  icon: z.string().max(64).optional(),
});

export const updateFolderSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(2000).optional(),
    icon: z.string().max(64).optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'At least one field required');

// ── Project ────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  folderId: uuidField,
  name: z.string().min(1).max(128),
  description: z.string().max(5000).optional(),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  budget: z.number().nonnegative().optional(),
  visibility: z.enum(['global', 'department']).optional().default('department'),
});

export const updateProjectSchema = z
  .object({
    name: z.string().min(1).max(128).optional(),
    description: z.string().max(5000).optional(),
    status: z.enum(['active', 'on_hold', 'completed', 'cancelled']).optional(),
    startDate: isoDate.nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    budget: z.number().nonnegative().optional(),
    actualCost: z.number().nonnegative().optional(),
    visibility: z.enum(['global', 'department']).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'At least one field required');

// ── Task ───────────────────────────────────────────────────────

export const taskLocationInputSchema = z
  .object({
    departmentId: uuidField.optional(),
    folderId: uuidField.optional(),
    projectId: uuidField.optional(),
  })
  .refine((value) => !!value.departmentId || !!value.projectId, {
    message: 'departmentId or projectId is required',
    path: ['departmentId'],
  });

export const moveTaskLocationSchema = z
  .object({
    folderId: uuidField.optional(),
    projectId: uuidField.optional(),
  })
  .refine((value) => !!value.folderId || !!value.projectId, {
    message: 'folderId or projectId is required',
    path: ['folderId'],
  });

export const createTaskSchema = taskLocationInputSchema.and(
  z.object({
    parentTaskId: uuidField.optional(),
    assigneeId: uuidField.optional(),
    assigneeIds: z.array(uuidField).max(50).optional(),
    title: z.string().min(1).max(500),
    description: z.string().max(10000).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    estimatedHours: z.number().nonnegative().optional(),
    startDate: isoDate.optional(),
    dueDate: isoDate.optional(),
    visibility: z.enum(['global', 'department']).optional().default('department'),
    customFields: z.record(z.unknown()).optional(),
  }),
);

export const updateTaskSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(10000).optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    assigneeId: uuidField.nullable().optional(),
    assigneeIds: z.array(uuidField).max(50).optional(),
    estimatedHours: z.number().nonnegative().optional(),
    actualHours: z.number().nonnegative().optional(),
    startDate: isoDate.nullable().optional(),
    dueDate: isoDate.nullable().optional(),
    visibility: z.enum(['global', 'department']).optional(),
    sortOrder: z.number().int().optional(),
    customFields: z.record(z.unknown()).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, 'At least one field required');

export const taskFilterSchema = z.object({
  projectId: uuidField.optional(),
  assigneeId: uuidField.optional(),
  status: z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
    z.array(z.nativeEnum(TaskStatus)).optional(),
  ),
  priority: z.preprocess(
    (value) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value),
    z.array(z.nativeEnum(TaskPriority)).optional(),
  ),
  search: z.string().max(200).optional(),
  dueDateBefore: isoDate.optional(),
  dueDateAfter: isoDate.optional(),
  folderId: uuidField.optional(),
  departmentId: uuidField.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const bulkTaskUpdateSchema = z.object({
  taskIds: z.array(uuidField).min(1).max(100),
  updates: updateTaskSchema,
});

// ── Dependencies ───────────────────────────────────────────────

export const createDependencySchema = z.object({
  taskId: uuidField,
  dependsOnTaskId: uuidField,
  dependencyType: z.nativeEnum(DependencyType),
  lagDays: z.number().int().nonnegative().optional().default(0),
});

// ── Comments ───────────────────────────────────────────────────

export const createCommentSchema = z.object({
  taskId: uuidField,
  content: z.string().min(1).max(10000),
  parentCommentId: uuidField.optional(),
  attachments: z.array(z.string()).max(10).optional(),
});

// ── Time Entry ─────────────────────────────────────────────────

export const createTimeEntrySchema = z.object({
  taskId: uuidField,
  description: z.string().max(500).optional(),
  loggedDate: isoDate,
  durationMinutes: z.number().int().positive().max(1440),
  isBillable: z.boolean().optional().default(true),
});

// ── Automation ─────────────────────────────────────────────────

export const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(128),
  triggerEvent: z.nativeEnum(TriggerEvent),
  conditions: z
    .array(
      z.object({
        field: z.string(),
        operator: z.enum([
          'equals',
          'not_equals',
          'contains',
          'greater_than',
          'less_than',
          'changed_to',
          'is_set',
          'is_not_set',
        ]),
        value: z.unknown(),
      }),
    )
    .max(20),
  actions: z
    .array(
      z.object({
        type: z.enum([
          'update_field',
          'assign_user',
          'change_status',
          'send_notification',
          'create_task',
          'webhook',
          'llm_action',
        ]),
        config: z.record(z.unknown()),
      }),
    )
    .min(1)
    .max(10),
});

// ── Approvals ──────────────────────────────────────────────────

export const createApprovalSchema = z.object({
  taskId: uuidField,
  chainId: uuidField,
});

export const submitApprovalVoteSchema = z.object({
  status: z.enum(['approved', 'rejected', 'changes_requested']),
  comment: z.string().max(2000).optional(),
});

// ── Webhook ────────────────────────────────────────────────────

export const createWebhookSchema = z.object({
  url: z.string().url().max(500),
  events: z.array(z.string()).min(1).max(50),
  secret: z.string().min(16).max(256).optional(),
});

// ── Workspace Members ────────────────────────────────────────────

export const addWorkspaceMemberSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(128),
  tempPassword: z.string().min(8).max(256),
  role: z.enum(['employee', 'manager', 'department_head']),
});

export const updateWorkspaceMemberRoleSchema = z.object({
  role: z.enum(['employee', 'manager', 'department_head']),
});

export const changeDepartmentMemberRoleSchema = z.object({
  role: z.enum(['employee', 'manager']),
});

export const addTaskAssigneeSchema = z.object({
  userId: uuidField,
});

// ── Pagination ─────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  perPage: z.coerce.number().int().min(1).max(100).optional().default(25),
  sortBy: z.string().optional(),
  sortDirection: z.enum(['asc', 'desc']).optional().default('asc'),
});

export const departmentReportFilterSchema = z
  .object({
    departmentId: z.string().uuid().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    status: z.nativeEnum(TaskStatus).optional(),
    priority: z.nativeEnum(TaskPriority).optional(),
    assigneeId: z.string().uuid().optional(),
    scope: z.enum(['self', 'individual', 'combined']).optional().default('self'),
    targetUserId: z.string().uuid().optional(),
    format: z.enum(['pdf', 'xlsx']).optional(),
  })
  .refine((value) => value.scope !== 'individual' || !!value.targetUserId, {
    message: 'targetUserId is required for individual reports',
    path: ['targetUserId'],
  })
  .refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
    message: 'dateFrom must be before or equal to dateTo',
    path: ['dateTo'],
  });

// ── Type exports (infer from schemas) ──────────────────────────

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type BootstrapTenantInput = z.infer<typeof bootstrapTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type TaskLocationInput = z.infer<typeof taskLocationInputSchema>;
export type MoveTaskLocationInput = z.infer<typeof moveTaskLocationSchema>;
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFilterInput = z.infer<typeof taskFilterSchema>;
export type BulkTaskUpdateInput = z.infer<typeof bulkTaskUpdateSchema>;
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;
export type CreateApprovalInput = z.infer<typeof createApprovalSchema>;
export type SubmitApprovalVoteInput = z.infer<typeof submitApprovalVoteSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type AddWorkspaceMemberInput = z.infer<typeof addWorkspaceMemberSchema>;
export type UpdateWorkspaceMemberRoleInput = z.infer<typeof updateWorkspaceMemberRoleSchema>;
export type ChangeDepartmentMemberRoleInput = z.infer<typeof changeDepartmentMemberRoleSchema>;
export type AddTaskAssigneeInput = z.infer<typeof addTaskAssigneeSchema>;
export type DepartmentReportFilterInput = z.infer<typeof departmentReportFilterSchema>;
