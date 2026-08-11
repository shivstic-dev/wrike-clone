/**
 * @wrike-clone/shared — API contract types
 *
 * Every request and response shape the API uses. These are the contract
 * between backend and frontend — if it changes here, both sides fail
 * to compile until they agree.
 */
import type { Task, Tenant, User, TenantMembership, TaskDependency, AutomationRule, Notification } from './domain';
import type { DependencyType, HandoffStatus, TaskStatus, TaskPriority, SortDirection } from '../enums';
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
export interface CreateTenantRequest {
    name: string;
    slug: string;
    domain?: string;
}
export interface UpdateTenantRequest {
    name?: string;
    settings?: Partial<Tenant['settings']>;
}
export interface InviteUserRequest {
    email: string;
    role: string;
    message?: string;
}
export interface UpdateMembershipRequest {
    role: string;
}
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
export interface CreateTaskRequest {
    departmentId?: string;
    folderId?: string;
    projectId?: string;
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
    handoffRequired?: boolean;
    visibility?: 'global' | 'department';
    customFields?: Record<string, unknown>;
}
export interface MoveTaskLocationRequest {
    folderId?: string;
    projectId?: string;
}
export interface TaskLocationOption {
    folderId: string;
    folderName: string;
    isGeneral: boolean;
    projects: Array<{
        projectId: string;
        projectName: string;
    }>;
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
    handoffRequired?: boolean;
    visibility?: 'global' | 'department';
    sortOrder?: number;
    customFields?: Record<string, unknown>;
}
export interface TaskCompletionRequest {
    outcome: 'confirmed' | 'not_yet';
}
export interface BulkTaskCompletionRequest {
    items: Array<{
        taskId: string;
        outcome: 'confirmed' | 'not_yet';
    }>;
}
export interface TaskFilterParams extends PaginationParams {
    departmentId?: string;
    projectId?: string;
    assigneeId?: string;
    status?: TaskStatus[];
    priority?: TaskPriority[];
    handoffStatus?: HandoffStatus;
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
export interface TimelineQuery {
    from?: string;
    to?: string;
    departmentId?: string;
    projectId?: string;
    assigneeId?: string;
    status?: TaskStatus[];
    cursor?: string;
    perPage?: number;
    includeCriticalPath?: boolean;
}
export interface TimelineTask extends Task {
    capabilities: {
        canEditSchedule: boolean;
        canManageDependencies: boolean;
    };
    isCritical: boolean;
}
export interface TimelineResponse {
    tasks: TimelineTask[];
    unscheduled: TimelineTask[];
    dependencies: TaskDependency[];
    meta: {
        from: string;
        to: string;
        nextCursor: string | null;
    };
}
export type TimelineScope = {
    kind: 'dashboard';
    departmentId?: string;
} | {
    kind: 'project';
    projectId: string;
};
export interface UpdateTaskScheduleRequest {
    startDate: string | null;
    dueDate: string | null;
    expectedUpdatedAt: string;
}
export interface UpdateDependencyRequest {
    dependencyType: DependencyType;
    lagDays: number;
}
export type TaskCompletionOutcome = 'confirmed' | 'not_yet';
export interface TaskCompletionRequest {
    outcome: TaskCompletionOutcome;
}
export interface BulkTaskCompletionRequest {
    items: Array<{
        taskId: string;
        outcome: TaskCompletionOutcome;
    }>;
}
export interface BulkTaskCompletionResult {
    data: Task[];
    errors: Array<{
        taskId: string;
        code: 'FORBIDDEN' | 'NOT_FOUND' | 'HANDOFF_CONFIRMATION_REQUIRED';
        message: string;
    }>;
}
export interface DashboardTaskSummary {
    id: string;
    title: string;
    projectId: string;
    projectName: string | null;
    departmentId: string;
    status: TaskStatus;
    handoffStatus: HandoffStatus;
    handoffOwner: Pick<User, 'id' | 'displayName' | 'email'> | null;
    assignees: Array<{
        userId: string;
        name: string;
    }>;
    dueDate: string | null;
    handoffReadyAt: string | null;
}
export type DashboardTaskBucket = 'active' | 'completed' | 'overdue' | 'blocked' | 'unassigned' | 'ready_for_handoff';
export interface DashboardTaskListResponse {
    generatedAt: string;
    bucket: DashboardTaskBucket;
    data: DashboardTaskSummary[];
}
export interface CreateDependencyRequest {
    taskId: string;
    dependsOnTaskId: string;
    dependencyType: DependencyType;
    lagDays?: number;
}
export type UpdateDependencyInput = Partial<CreateDependencyRequest>;
export type UpdateTaskScheduleInput = Partial<UpdateTaskScheduleRequest>;
export interface CreateCommentRequest {
    taskId: string;
    content: string;
    parentCommentId?: string;
    attachments?: string[];
}
export interface CreateTimeEntryRequest {
    taskId: string;
    description?: string;
    loggedDate: string;
    durationMinutes: number;
    isBillable?: boolean;
}
export interface CreateAutomationRuleRequest {
    name: string;
    triggerEvent: string;
    conditions: AutomationRule['conditions'];
    actions: AutomationRule['actions'];
}
export interface CreateApprovalRequest {
    taskId: string;
    chainId: string;
}
export interface SubmitApprovalVoteRequest {
    status: 'approved' | 'rejected' | 'changes_requested';
    comment?: string;
}
export interface FileUploadResponse {
    fileId: string;
    versionId: string;
    url: string;
    thumbnailUrl: string | null;
}
export type DashboardViewerRole = 'employee' | 'manager' | 'department_head' | 'admin';
export interface DashboardOverview {
    generatedAt: string;
    windowDays: 30;
    scope: {
        departmentId?: string;
        role: DashboardViewerRole;
    };
    totals: {
        active: number;
        completed: number;
        overdue: number;
        blocked: number;
        unassigned: number;
        readyForHandoff: number;
    };
    comparison: {
        completedPercentChange: number | null;
        createdPercentChange: number | null;
    };
    daily: Array<{
        date: string;
        created: number;
        completed: number;
    }>;
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    capacity: Array<{
        userId: string;
        name: string;
        openTasks: number;
        overdue: number;
    }>;
    attention: Array<{
        id: string;
        title: string;
        reason: 'overdue' | 'blocked' | 'unassigned';
        dueDate: string | null;
        assigneeName: string | null;
    }>;
    departments: Array<{
        id: string;
        name: string;
        active: number;
        overdue: number;
        completionRate: number;
    }>;
}
export interface DashboardAnalyticsQuery {
    departmentId?: string;
    projectId?: string;
    dateFrom?: string;
    dateTo?: string;
    groupBy: 'month';
}
export interface DashboardAnalyticsResponse {
    generatedAt: string;
    period: {
        from: string;
        to: string;
        months: number;
    };
    scope: {
        departmentId?: string;
        projectId?: string;
        role: DashboardViewerRole;
    };
    kpis: {
        averageCompletionHours: number | null;
        handoffSuccessRate: number | null;
        onTimeCompletionRate: number | null;
    };
    monthlyCompletion: Array<{
        month: string;
        completed: number;
    }>;
    overdueOutcome: Array<{
        month: string;
        total: number;
        departments: Array<{
            id: string;
            name: string;
            count: number;
        }>;
    }>;
    workload: Array<{
        userId: string;
        name: string;
        role: 'manager' | 'employee' | 'member';
        active: number;
        overdue: number;
        estimatedHours: number;
    }>;
    blockedAgeing: {
        averageDays: number | null;
        maxDays: number | null;
        items: Array<{
            taskId: string;
            title: string;
            projectId: string;
            projectName: string | null;
            days: number;
        }>;
    };
    priorityDistribution: Record<'critical' | 'high' | 'medium' | 'low', number>;
    projectHealth: Array<{
        projectId: string;
        projectName: string;
        score: number;
        band: 'green' | 'amber' | 'red';
        taskCount: number;
        components: {
            onTime: number;
            overdueControl: number;
            blockedAgeing: number;
            workloadBalance: number;
            handoffSuccess: number;
        };
    }>;
}
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
export interface NotificationListResponse {
    data: Notification[];
    meta: {
        unreadCount: number;
    };
}
export interface CreateWebhookRequest {
    url: string;
    events: string[];
    secret?: string;
}
//# sourceMappingURL=api.d.ts.map