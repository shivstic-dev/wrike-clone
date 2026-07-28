/**
 * @wrike-clone/shared — Core domain types
 *
 * Central entity interfaces. Every table in the database maps to one of
 * these. Backend services and frontend views share the same definitions
 * so API contracts are a single source of truth.
 */
import type { TaskPriority, TaskStatus, TenantRole, PlanTier, FileCategory } from '../enums';
export type Timestamp = string;
/** Base fields every database row carries. */
export interface BaseEntity {
    id: string;
    tenantId: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    deletedAt: Timestamp | null;
}
export interface Tenant extends BaseEntity {
    name: string;
    slug: string;
    domain: string | null;
    planTier: PlanTier;
    logoUrl: string | null;
    settings: TenantSettings;
}
export interface TenantSettings {
    defaultTimezone: string;
    defaultLocale: string;
    maxUsers: number;
    maxStorageGb: number;
    allowedAuthProviders: string[];
    enforceSso: boolean;
    sessionTimeoutMinutes: number;
}
export interface User extends BaseEntity {
    email: string;
    displayName: string;
    avatarUrl: string | null;
    locale: string;
    timezone: string;
    isActive: boolean;
    lastLoginAt: Timestamp | null;
}
/** Join table: user <-> tenant with role. */
export interface TenantMembership {
    id: string;
    tenantId: string;
    userId: string;
    role: TenantRole;
    joinedAt: Timestamp;
    isActive: boolean;
}
export interface Workspace extends BaseEntity {
    name: string;
    description: string | null;
    icon: string | null;
    sortOrder: number;
    departmentRole?: 'admin' | 'department_head' | 'manager' | 'employee' | 'none';
}
/** Join table: workspace (department) <-> user with role. */
export interface WorkspaceMember extends BaseEntity {
    workspaceId: string;
    userId: string;
    role: 'admin' | 'employee' | 'manager' | 'department_head';
}
export interface Folder extends BaseEntity {
    workspaceId: string;
    parentFolderId: string | null;
    name: string;
    description: string | null;
    icon: string | null;
    sortOrder: number;
    isArchived: boolean;
    isSystemGeneral: boolean;
    metadata: Record<string, unknown>;
}
/**
 * Many-to-many: a task can belong to multiple folders (cross-tagging).
 * Each task has exactly one "home" folder for ownership purposes.
 */
export interface TaskFolderLink {
    taskId: string;
    folderId: string;
    isHome: boolean;
}
export interface Project extends BaseEntity {
    folderId: string;
    departmentId?: string;
    ownerId: string;
    name: string;
    description: string | null;
    status: 'active' | 'on_hold' | 'completed' | 'cancelled';
    startDate: Timestamp | null;
    dueDate: Timestamp | null;
    completedAt: Timestamp | null;
    priority: TaskPriority;
    budget: number | null;
    actualCost: number | null;
    visibility: 'global' | 'department';
    isSystem: boolean;
    taskCounts?: Array<{
        status: string;
        count: number | string;
    }>;
}
export interface Task extends BaseEntity {
    projectId: string;
    folderId?: string;
    folderName?: string;
    projectName?: string;
    isSystemProject?: boolean;
    departmentId: string;
    departmentName?: string;
    parentTaskId: string | null;
    assigneeId: string | null;
    assignees?: TaskAssignee[];
    createdById: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    estimatedHours: number | null;
    actualHours: number | null;
    startDate: Timestamp | null;
    dueDate: Timestamp | null;
    completedAt: Timestamp | null;
    visibility: 'global' | 'department';
    sortOrder: number;
    customFields: Record<string, unknown>;
    isRecurring: boolean;
    recurrenceRule: string | null;
}
export interface TaskDependency {
    id: string;
    taskId: string;
    dependsOnTaskId: string;
    dependencyType: string;
    lagDays: number;
}
export interface TaskAssignee {
    id: string;
    taskId: string;
    userId: string;
    assignedById: string | null;
    isPrimary: boolean;
    assignedAt: Timestamp;
    displayName?: string;
    email?: string;
    avatarUrl?: string | null;
}
export interface TaskComment extends BaseEntity {
    taskId: string;
    authorId: string;
    content: string;
    isEdited: boolean;
    parentCommentId: string | null;
    attachments: string[];
}
export interface ActivityLog extends BaseEntity {
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    changes: Record<string, {
        old: unknown;
        new: unknown;
    }>;
    metadata: Record<string, unknown>;
}
export interface TimeEntry extends BaseEntity {
    taskId: string;
    userId: string;
    description: string | null;
    loggedDate: Timestamp;
    durationMinutes: number;
    isBillable: boolean;
    hourlyRate: number | null;
    isLocked: boolean;
}
export interface CustomFieldDefinition {
    id: string;
    tenantId: string;
    name: string;
    key: string;
    fieldType: 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'user' | 'formula';
    options: string[] | null;
    isRequired: boolean;
    defaultValue: unknown;
    formula: string | null;
}
export interface ItemType {
    id: string;
    tenantId: string;
    name: string;
    icon: string;
    color: string;
    fieldDefinitions: CustomFieldDefinition[];
}
export interface ApprovalChain {
    id: string;
    tenantId: string;
    name: string;
    steps: ApprovalStep[];
}
export interface ApprovalStep {
    id: string;
    chainId: string;
    order: number;
    approverId: string | null;
    approverRole: string | null;
    requiredCount: number;
}
export interface ApprovalRequest {
    id: string;
    taskId: string;
    chainId: string;
    currentStep: number;
    status: string;
    requestedById: string;
    requestedAt: Timestamp;
    completedAt: Timestamp | null;
}
export interface ApprovalVote {
    id: string;
    requestId: string;
    stepId: string;
    approverId: string;
    status: string;
    comment: string | null;
    votedAt: Timestamp;
}
export interface FileVersion extends BaseEntity {
    fileId: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
    thumbnailPath: string | null;
    category: FileCategory;
    uploadedById: string;
    versionNumber: number;
    checksum: string;
}
export interface FileAnnotation {
    id: string;
    fileVersionId: string;
    authorId: string;
    pageNumber: number | null;
    timestampMs: number | null;
    x: number;
    y: number;
    width: number;
    height: number;
    content: string;
    color: string;
    resolvedAt: Timestamp | null;
}
export interface AutomationRule {
    id: string;
    tenantId: string;
    name: string;
    isActive: boolean;
    triggerEvent: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
    sortOrder: number;
}
export interface RuleCondition {
    field: string;
    operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'changed_to' | 'is_set' | 'is_not_set';
    value: unknown;
}
export interface RuleAction {
    type: 'update_field' | 'assign_user' | 'change_status' | 'send_notification' | 'create_task' | 'webhook' | 'llm_action';
    config: Record<string, unknown>;
}
export interface Notification {
    id: string;
    tenantId: string;
    userId: string;
    type: string;
    title: string;
    body: string | null;
    data: Record<string, unknown>;
    isRead: boolean;
    priority: number;
    createdAt: Timestamp;
}
export interface Webhook {
    id: string;
    tenantId: string;
    url: string;
    secret: string;
    events: string[];
    isActive: boolean;
    lastTriggeredAt: Timestamp | null;
    failureCount: number;
}
//# sourceMappingURL=domain.d.ts.map