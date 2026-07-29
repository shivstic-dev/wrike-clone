/**
 * @wrike-clone/shared — Core domain types
 *
 * Central entity interfaces. Every table in the database maps to one of
 * these. Backend services and frontend views share the same definitions
 * so API contracts are a single source of truth.
 */

import type {
  TaskPriority,
  TaskStatus,
  HandoffStatus,
  TenantRole,
  PlanTier,
  FileCategory,
} from '../enums';

// ── Timestamp helpers ──────────────────────────────────────────
export type Timestamp = string; // ISO-8601

/** Base fields every database row carries. */
export interface BaseEntity {
  id: string; // UUIDv7
  tenantId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  deletedAt: Timestamp | null;
}

// ── Tenant & Organization ──────────────────────────────────────

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

// ── Users & Auth ──────────────────────────────────────────────

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

// ── Workspace ──────────────────────────────────────────────────

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

// ── Folder (recursive hierarchy) ────────────────────────────────

export interface Folder extends BaseEntity {
  workspaceId: string;
  parentFolderId: string | null; // self-referential for nesting
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

// ── Project (a folder that behaves as a project) ────────────────

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
  taskCounts?: Array<{ status: string; count: number | string }>;
}

// ── Task ────────────────────────────────────────────────────────

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
  handoffRequired: boolean;
  handoffStatus: HandoffStatus;
  handoffOwnerId: string | null;
  handoffOwner?: Pick<User, 'id' | 'displayName' | 'email'> | null;
  handoffReadyAt: Timestamp | null;
  handoffConfirmedBy: string | null;
  handoffConfirmedAt: Timestamp | null;
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
  taskId: string; // the task that depends
  dependsOnTaskId: string; // the task it depends on
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

// ── Comments & Activity ────────────────────────────────────────

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
  changes: Record<string, { old: unknown; new: unknown }>;
  metadata: Record<string, unknown>;
}

// ── Time Tracking ──────────────────────────────────────────────

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

// ── Custom Fields & Item Types ─────────────────────────────────

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  name: string;
  key: string; // machine-readable, used in JSONB custom_fields
  fieldType:
    'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select' | 'user' | 'formula';
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

// ── Approvals ──────────────────────────────────────────────────

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

// ── Files / Proofs ─────────────────────────────────────────────

export interface FileVersion extends BaseEntity {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string; // MinIO/S3 path
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
  timestampMs: number | null; // for video frames
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  color: string;
  resolvedAt: Timestamp | null;
}

// ── Automation ─────────────────────────────────────────────────

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
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'changed_to'
    | 'is_set'
    | 'is_not_set';
  value: unknown;
}

export interface RuleAction {
  type:
    | 'update_field'
    | 'assign_user'
    | 'change_status'
    | 'send_notification'
    | 'create_task'
    | 'webhook'
    | 'llm_action';
  config: Record<string, unknown>;
}

// ── Notifications ──────────────────────────────────────────────

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

// ── Webhooks ───────────────────────────────────────────────────

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
