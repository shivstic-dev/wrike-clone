/**
 * @wrike-clone/shared — API contract types
 *
 * Every request and response shape the API uses. These are the contract
 * between backend and frontend — if it changes here, both sides fail
 * to compile until they agree.
 */

import type {
  Task,
  Tenant,
  User,
  Workspace,
  Folder,
  Project,
  TenantMembership,
  TaskDependency,
  TimeEntry,
  AutomationRule,
  Notification,
  ApprovalRequest,
  FileVersion,
  ActivityLog,
} from './domain';
import type { TaskStatus, TaskPriority, SortDirection } from '../enums';

// ── Pagination ─────────────────────────────────────────────────

export interface PaginationParams {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortDirection?: SortDirection;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ── Common API envelope ────────────────────────────────────────

export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
    requestId?: string;
  };
}

// ── Auth ───────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
  tenantSlug?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  mustChangePassword?: boolean;
  user: User;
  tenant: Tenant;
  membership: TenantMembership;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ── Tenant ─────────────────────────────────────────────────────

export interface CreateTenantRequest {
  name: string;
  slug: string;
  domain?: string;
}

export interface UpdateTenantRequest {
  name?: string;
  settings?: Partial<Tenant['settings']>;
}

// ── Users ──────────────────────────────────────────────────────

export interface InviteUserRequest {
  email: string;
  role: string;
  message?: string;
}

export interface UpdateMembershipRequest {
  role: string;
}

// ── Workspace ──────────────────────────────────────────────────

export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
  icon?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  description?: string;
  icon?: string;
}

// ── Folder ─────────────────────────────────────────────────────

export interface CreateFolderRequest {
  workspaceId: string;
  parentFolderId?: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface UpdateFolderRequest {
  name?: string;
  description?: string;
  icon?: string;
  isArchived?: boolean;
}

// ── Project ────────────────────────────────────────────────────

export interface CreateProjectRequest {
  folderId: string;
  name: string;
  description?: string;
  startDate?: string;
  dueDate?: string;
  priority?: TaskPriority;
  budget?: number;
  visibility?: 'global' | 'department';
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: string;
  startDate?: string;
  dueDate?: string;
  priority?: TaskPriority;
  budget?: number;
  actualCost?: number;
  visibility?: 'global' | 'department';
}

// ── Task ───────────────────────────────────────────────────────

export interface CreateTaskRequest {
  projectId: string;
  parentTaskId?: string;
  assigneeId?: string;
  assigneeIds?: string[];
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  estimatedHours?: number;
  startDate?: string;
  dueDate?: string;
  visibility?: 'global' | 'department';
  customFields?: Record<string, unknown>;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string | null;
  assigneeIds?: string[];
  estimatedHours?: number;
  actualHours?: number;
  startDate?: string;
  dueDate?: string;
  visibility?: 'global' | 'department';
  sortOrder?: number;
  customFields?: Record<string, unknown>;
}

export interface TaskFilterParams extends PaginationParams {
  departmentId?: string;
  projectId?: string;
  assigneeId?: string;
  status?: TaskStatus[];
  priority?: TaskPriority[];
  search?: string;
  dueDateBefore?: string;
  dueDateAfter?: string;
  folderId?: string;
}

export interface DepartmentReportFilter {
  departmentId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: string;
  scope?: 'self' | 'individual' | 'combined';
  targetUserId?: string;
  format?: 'pdf' | 'xlsx';
}

export interface BulkTaskUpdateRequest {
  taskIds: string[];
  updates: UpdateTaskRequest;
}

// ── Task Dependencies ──────────────────────────────────────────

export interface CreateDependencyRequest {
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: string;
  lagDays?: number;
}

// ── Comments ───────────────────────────────────────────────────

export interface CreateCommentRequest {
  taskId: string;
  content: string;
  parentCommentId?: string;
  attachments?: string[];
}

// ── Time Tracking ──────────────────────────────────────────────

export interface CreateTimeEntryRequest {
  taskId: string;
  description?: string;
  loggedDate: string;
  durationMinutes: number;
  isBillable?: boolean;
}

// ── Automation ─────────────────────────────────────────────────

export interface CreateAutomationRuleRequest {
  name: string;
  triggerEvent: string;
  conditions: AutomationRule['conditions'];
  actions: AutomationRule['actions'];
}

// ── Approvals ──────────────────────────────────────────────────

export interface CreateApprovalRequest {
  taskId: string;
  chainId: string;
}

export interface SubmitApprovalVoteRequest {
  status: 'approved' | 'rejected' | 'changes_requested';
  comment?: string;
}

// ── File Upload ────────────────────────────────────────────────

export interface FileUploadResponse {
  fileId: string;
  versionId: string;
  url: string;
  thumbnailUrl: string | null;
}

// ── Dashboard / Reporting ──────────────────────────────────────

export interface DashboardWidget {
  id: string;
  type: 'task_count' | 'overdue' | 'workload' | 'project_progress' | 'custom';
  title: string;
  config: Record<string, unknown>;
  layout: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface WorkloadReport {
  userId: string;
  userName: string;
  weekStart: string;
  totalHours: number;
  capacityHours: number;
  taskCount: number;
}

// ── Notifications ──────────────────────────────────────────────

export interface NotificationListResponse {
  data: Notification[];
  meta: { unreadCount: number };
}

// ── Webhooks ───────────────────────────────────────────────────

export interface CreateWebhookRequest {
  url: string;
  events: string[];
  secret?: string;
}
