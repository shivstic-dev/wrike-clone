/**
 * @wrike-clone/shared — Zod validation schemas
 *
 * Every API input is validated against these schemas before reaching
 * business logic. Shared between backend (server-side validation) and
 * frontend (form validation), so rules never diverge.
 */
import { z } from 'zod';
import { TaskStatus, TaskPriority, DependencyType, TriggerEvent, TenantRole } from '../enums';
export declare const uuidField: z.ZodString;
export declare const slugField: z.ZodString;
export declare const isoDate: z.ZodUnion<[z.ZodString, z.ZodString]>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    tenantSlug: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    tenantSlug?: string | undefined;
}, {
    email: string;
    password: string;
    tenantSlug?: string | undefined;
}>;
export declare const refreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export declare const changePasswordSchema: z.ZodEffects<z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export declare const createTenantSchema: z.ZodObject<{
    name: z.ZodString;
    slug: z.ZodString;
    domain: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    slug: string;
    domain?: string | undefined;
}, {
    name: string;
    slug: string;
    domain?: string | undefined;
}>;
export declare const updateTenantSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    settings: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}, {
    name?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}>, {
    name?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}, {
    name?: string | undefined;
    settings?: Record<string, unknown> | undefined;
}>;
export declare const inviteUserSchema: z.ZodObject<{
    email: z.ZodString;
    role: z.ZodNativeEnum<typeof TenantRole>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: TenantRole;
    message?: string | undefined;
}, {
    email: string;
    role: TenantRole;
    message?: string | undefined;
}>;
export declare const updateMembershipSchema: z.ZodObject<{
    role: z.ZodNativeEnum<typeof TenantRole>;
}, "strip", z.ZodTypeAny, {
    role: TenantRole;
}, {
    role: TenantRole;
}>;
export declare const createWorkspaceSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    icon?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
    icon?: string | undefined;
}>;
export declare const updateWorkspaceSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
}>, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
}>;
export declare const createFolderSchema: z.ZodObject<{
    workspaceId: z.ZodString;
    parentFolderId: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    workspaceId: string;
    description?: string | undefined;
    icon?: string | undefined;
    parentFolderId?: string | undefined;
}, {
    name: string;
    workspaceId: string;
    description?: string | undefined;
    icon?: string | undefined;
    parentFolderId?: string | undefined;
}>;
export declare const updateFolderSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
    isArchived: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
    isArchived?: boolean | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
    isArchived?: boolean | undefined;
}>, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
    isArchived?: boolean | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    icon?: string | undefined;
    isArchived?: boolean | undefined;
}>;
export declare const createProjectSchema: z.ZodObject<{
    folderId: z.ZodString;
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodString]>>;
    dueDate: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodString]>>;
    priority: z.ZodOptional<z.ZodNativeEnum<typeof TaskPriority>>;
    budget: z.ZodOptional<z.ZodNumber>;
    visibility: z.ZodDefault<z.ZodOptional<z.ZodEnum<["organization", "department"]>>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    folderId: string;
    visibility: "organization" | "department";
    description?: string | undefined;
    startDate?: string | undefined;
    dueDate?: string | undefined;
    priority?: TaskPriority | undefined;
    budget?: number | undefined;
}, {
    name: string;
    folderId: string;
    description?: string | undefined;
    startDate?: string | undefined;
    dueDate?: string | undefined;
    priority?: TaskPriority | undefined;
    budget?: number | undefined;
    visibility?: "organization" | "department" | undefined;
}>;
export declare const updateProjectSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["active", "on_hold", "completed", "cancelled"]>>;
    startDate: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
    dueDate: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
    priority: z.ZodOptional<z.ZodNativeEnum<typeof TaskPriority>>;
    budget: z.ZodOptional<z.ZodNumber>;
    actualCost: z.ZodOptional<z.ZodNumber>;
    visibility: z.ZodOptional<z.ZodEnum<["organization", "department"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "active" | "on_hold" | "completed" | "cancelled" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    budget?: number | undefined;
    visibility?: "organization" | "department" | undefined;
    actualCost?: number | undefined;
}, {
    status?: "active" | "on_hold" | "completed" | "cancelled" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    budget?: number | undefined;
    visibility?: "organization" | "department" | undefined;
    actualCost?: number | undefined;
}>, {
    status?: "active" | "on_hold" | "completed" | "cancelled" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    budget?: number | undefined;
    visibility?: "organization" | "department" | undefined;
    actualCost?: number | undefined;
}, {
    status?: "active" | "on_hold" | "completed" | "cancelled" | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    budget?: number | undefined;
    visibility?: "organization" | "department" | undefined;
    actualCost?: number | undefined;
}>;
export declare const createTaskSchema: z.ZodObject<{
    projectId: z.ZodString;
    parentTaskId: z.ZodOptional<z.ZodString>;
    assigneeId: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof TaskStatus>>;
    priority: z.ZodOptional<z.ZodNativeEnum<typeof TaskPriority>>;
    estimatedHours: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodString]>>;
    dueDate: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodString]>>;
    customFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    projectId: string;
    title: string;
    status?: TaskStatus | undefined;
    description?: string | undefined;
    startDate?: string | undefined;
    dueDate?: string | undefined;
    priority?: TaskPriority | undefined;
    parentTaskId?: string | undefined;
    assigneeId?: string | undefined;
    estimatedHours?: number | undefined;
    customFields?: Record<string, unknown> | undefined;
}, {
    projectId: string;
    title: string;
    status?: TaskStatus | undefined;
    description?: string | undefined;
    startDate?: string | undefined;
    dueDate?: string | undefined;
    priority?: TaskPriority | undefined;
    parentTaskId?: string | undefined;
    assigneeId?: string | undefined;
    estimatedHours?: number | undefined;
    customFields?: Record<string, unknown> | undefined;
}>;
export declare const updateTaskSchema: z.ZodEffects<z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof TaskStatus>>;
    priority: z.ZodOptional<z.ZodNativeEnum<typeof TaskPriority>>;
    assigneeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    estimatedHours: z.ZodOptional<z.ZodNumber>;
    actualHours: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
    dueDate: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
    sortOrder: z.ZodOptional<z.ZodNumber>;
    customFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status?: TaskStatus | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    assigneeId?: string | null | undefined;
    title?: string | undefined;
    estimatedHours?: number | undefined;
    customFields?: Record<string, unknown> | undefined;
    actualHours?: number | undefined;
    sortOrder?: number | undefined;
}, {
    status?: TaskStatus | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    assigneeId?: string | null | undefined;
    title?: string | undefined;
    estimatedHours?: number | undefined;
    customFields?: Record<string, unknown> | undefined;
    actualHours?: number | undefined;
    sortOrder?: number | undefined;
}>, {
    status?: TaskStatus | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    assigneeId?: string | null | undefined;
    title?: string | undefined;
    estimatedHours?: number | undefined;
    customFields?: Record<string, unknown> | undefined;
    actualHours?: number | undefined;
    sortOrder?: number | undefined;
}, {
    status?: TaskStatus | undefined;
    description?: string | undefined;
    startDate?: string | null | undefined;
    dueDate?: string | null | undefined;
    priority?: TaskPriority | undefined;
    assigneeId?: string | null | undefined;
    title?: string | undefined;
    estimatedHours?: number | undefined;
    customFields?: Record<string, unknown> | undefined;
    actualHours?: number | undefined;
    sortOrder?: number | undefined;
}>;
export declare const taskFilterSchema: z.ZodObject<{
    projectId: z.ZodOptional<z.ZodString>;
    assigneeId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof TaskStatus>, "many">>;
    priority: z.ZodOptional<z.ZodArray<z.ZodNativeEnum<typeof TaskPriority>, "many">>;
    search: z.ZodOptional<z.ZodString>;
    dueDateBefore: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodString]>>;
    dueDateAfter: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodString]>>;
    folderId: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    perPage: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    perPage: number;
    status?: TaskStatus[] | undefined;
    folderId?: string | undefined;
    priority?: TaskPriority[] | undefined;
    projectId?: string | undefined;
    assigneeId?: string | undefined;
    search?: string | undefined;
    dueDateBefore?: string | undefined;
    dueDateAfter?: string | undefined;
}, {
    status?: TaskStatus[] | undefined;
    folderId?: string | undefined;
    priority?: TaskPriority[] | undefined;
    projectId?: string | undefined;
    assigneeId?: string | undefined;
    search?: string | undefined;
    dueDateBefore?: string | undefined;
    dueDateAfter?: string | undefined;
    page?: number | undefined;
    perPage?: number | undefined;
}>;
export declare const bulkTaskUpdateSchema: z.ZodObject<{
    taskIds: z.ZodArray<z.ZodString, "many">;
    updates: z.ZodEffects<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        status: z.ZodOptional<z.ZodNativeEnum<typeof TaskStatus>>;
        priority: z.ZodOptional<z.ZodNativeEnum<typeof TaskPriority>>;
        assigneeId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        estimatedHours: z.ZodOptional<z.ZodNumber>;
        actualHours: z.ZodOptional<z.ZodNumber>;
        startDate: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
        dueDate: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodString, z.ZodString]>>>;
        sortOrder: z.ZodOptional<z.ZodNumber>;
        customFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        status?: TaskStatus | undefined;
        description?: string | undefined;
        startDate?: string | null | undefined;
        dueDate?: string | null | undefined;
        priority?: TaskPriority | undefined;
        assigneeId?: string | null | undefined;
        title?: string | undefined;
        estimatedHours?: number | undefined;
        customFields?: Record<string, unknown> | undefined;
        actualHours?: number | undefined;
        sortOrder?: number | undefined;
    }, {
        status?: TaskStatus | undefined;
        description?: string | undefined;
        startDate?: string | null | undefined;
        dueDate?: string | null | undefined;
        priority?: TaskPriority | undefined;
        assigneeId?: string | null | undefined;
        title?: string | undefined;
        estimatedHours?: number | undefined;
        customFields?: Record<string, unknown> | undefined;
        actualHours?: number | undefined;
        sortOrder?: number | undefined;
    }>, {
        status?: TaskStatus | undefined;
        description?: string | undefined;
        startDate?: string | null | undefined;
        dueDate?: string | null | undefined;
        priority?: TaskPriority | undefined;
        assigneeId?: string | null | undefined;
        title?: string | undefined;
        estimatedHours?: number | undefined;
        customFields?: Record<string, unknown> | undefined;
        actualHours?: number | undefined;
        sortOrder?: number | undefined;
    }, {
        status?: TaskStatus | undefined;
        description?: string | undefined;
        startDate?: string | null | undefined;
        dueDate?: string | null | undefined;
        priority?: TaskPriority | undefined;
        assigneeId?: string | null | undefined;
        title?: string | undefined;
        estimatedHours?: number | undefined;
        customFields?: Record<string, unknown> | undefined;
        actualHours?: number | undefined;
        sortOrder?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    taskIds: string[];
    updates: {
        status?: TaskStatus | undefined;
        description?: string | undefined;
        startDate?: string | null | undefined;
        dueDate?: string | null | undefined;
        priority?: TaskPriority | undefined;
        assigneeId?: string | null | undefined;
        title?: string | undefined;
        estimatedHours?: number | undefined;
        customFields?: Record<string, unknown> | undefined;
        actualHours?: number | undefined;
        sortOrder?: number | undefined;
    };
}, {
    taskIds: string[];
    updates: {
        status?: TaskStatus | undefined;
        description?: string | undefined;
        startDate?: string | null | undefined;
        dueDate?: string | null | undefined;
        priority?: TaskPriority | undefined;
        assigneeId?: string | null | undefined;
        title?: string | undefined;
        estimatedHours?: number | undefined;
        customFields?: Record<string, unknown> | undefined;
        actualHours?: number | undefined;
        sortOrder?: number | undefined;
    };
}>;
export declare const createDependencySchema: z.ZodObject<{
    taskId: z.ZodString;
    dependsOnTaskId: z.ZodString;
    dependencyType: z.ZodNativeEnum<typeof DependencyType>;
    lagDays: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType: DependencyType;
    lagDays: number;
}, {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType: DependencyType;
    lagDays?: number | undefined;
}>;
export declare const createCommentSchema: z.ZodObject<{
    taskId: z.ZodString;
    content: z.ZodString;
    parentCommentId: z.ZodOptional<z.ZodString>;
    attachments: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    taskId: string;
    content: string;
    parentCommentId?: string | undefined;
    attachments?: string[] | undefined;
}, {
    taskId: string;
    content: string;
    parentCommentId?: string | undefined;
    attachments?: string[] | undefined;
}>;
export declare const createTimeEntrySchema: z.ZodObject<{
    taskId: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    loggedDate: z.ZodUnion<[z.ZodString, z.ZodString]>;
    durationMinutes: z.ZodNumber;
    isBillable: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    taskId: string;
    loggedDate: string;
    durationMinutes: number;
    isBillable: boolean;
    description?: string | undefined;
}, {
    taskId: string;
    loggedDate: string;
    durationMinutes: number;
    description?: string | undefined;
    isBillable?: boolean | undefined;
}>;
export declare const createAutomationRuleSchema: z.ZodObject<{
    name: z.ZodString;
    triggerEvent: z.ZodNativeEnum<typeof TriggerEvent>;
    conditions: z.ZodArray<z.ZodObject<{
        field: z.ZodString;
        operator: z.ZodEnum<["equals", "not_equals", "contains", "greater_than", "less_than", "changed_to", "is_set", "is_not_set"]>;
        value: z.ZodUnknown;
    }, "strip", z.ZodTypeAny, {
        field: string;
        operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "changed_to" | "is_set" | "is_not_set";
        value?: unknown;
    }, {
        field: string;
        operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "changed_to" | "is_set" | "is_not_set";
        value?: unknown;
    }>, "many">;
    actions: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["update_field", "assign_user", "change_status", "send_notification", "create_task", "webhook", "llm_action"]>;
        config: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "update_field" | "assign_user" | "change_status" | "send_notification" | "create_task" | "webhook" | "llm_action";
        config: Record<string, unknown>;
    }, {
        type: "update_field" | "assign_user" | "change_status" | "send_notification" | "create_task" | "webhook" | "llm_action";
        config: Record<string, unknown>;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    triggerEvent: TriggerEvent;
    conditions: {
        field: string;
        operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "changed_to" | "is_set" | "is_not_set";
        value?: unknown;
    }[];
    actions: {
        type: "update_field" | "assign_user" | "change_status" | "send_notification" | "create_task" | "webhook" | "llm_action";
        config: Record<string, unknown>;
    }[];
}, {
    name: string;
    triggerEvent: TriggerEvent;
    conditions: {
        field: string;
        operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "changed_to" | "is_set" | "is_not_set";
        value?: unknown;
    }[];
    actions: {
        type: "update_field" | "assign_user" | "change_status" | "send_notification" | "create_task" | "webhook" | "llm_action";
        config: Record<string, unknown>;
    }[];
}>;
export declare const createApprovalSchema: z.ZodObject<{
    taskId: z.ZodString;
    chainId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    taskId: string;
    chainId: string;
}, {
    taskId: string;
    chainId: string;
}>;
export declare const submitApprovalVoteSchema: z.ZodObject<{
    status: z.ZodEnum<["approved", "rejected", "changes_requested"]>;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "approved" | "rejected" | "changes_requested";
    comment?: string | undefined;
}, {
    status: "approved" | "rejected" | "changes_requested";
    comment?: string | undefined;
}>;
export declare const createWebhookSchema: z.ZodObject<{
    url: z.ZodString;
    events: z.ZodArray<z.ZodString, "many">;
    secret: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    url: string;
    events: string[];
    secret?: string | undefined;
}, {
    url: string;
    events: string[];
    secret?: string | undefined;
}>;
export declare const addWorkspaceMemberSchema: z.ZodObject<{
    email: z.ZodString;
    displayName: z.ZodString;
    tempPassword: z.ZodString;
    role: z.ZodEnum<["dept_admin", "member"]>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: "dept_admin" | "member";
    displayName: string;
    tempPassword: string;
}, {
    email: string;
    role: "dept_admin" | "member";
    displayName: string;
    tempPassword: string;
}>;
export declare const updateWorkspaceMemberRoleSchema: z.ZodObject<{
    role: z.ZodEnum<["dept_admin", "member"]>;
}, "strip", z.ZodTypeAny, {
    role: "dept_admin" | "member";
}, {
    role: "dept_admin" | "member";
}>;
export declare const paginationSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    perPage: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    sortBy: z.ZodOptional<z.ZodString>;
    sortDirection: z.ZodDefault<z.ZodOptional<z.ZodEnum<["asc", "desc"]>>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    perPage: number;
    sortDirection: "asc" | "desc";
    sortBy?: string | undefined;
}, {
    page?: number | undefined;
    perPage?: number | undefined;
    sortBy?: string | undefined;
    sortDirection?: "asc" | "desc" | undefined;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
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
//# sourceMappingURL=index.d.ts.map