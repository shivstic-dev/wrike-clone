/**
 * @wrike-clone/shared — Core enumerations
 *
 * All enum values used across the platform. Centralized to prevent
 * drift between backend and frontend.
 */
/** Tenant-level roles — defined by the tenant admin, not hardcoded system-wide. */
export declare enum TenantRole {
    ADMIN = "admin",
    MANAGER = "manager",
    MEMBER = "member",
    GUEST = "guest",
    COLLABORATOR = "collaborator"
}
/** Baseline system permissions. Tenants can extend these with custom roles. */
export declare enum Permission {
    TENANT_READ = "tenant:read",
    TENANT_WRITE = "tenant:write",
    TENANT_MANAGE = "tenant:manage",
    USER_INVITE = "user:invite",
    USER_REMOVE = "user:remove",
    USER_ROLE_MANAGE = "user:role:manage",
    WORKSPACE_CREATE = "workspace:create",
    WORKSPACE_READ = "workspace:read",
    WORKSPACE_WRITE = "workspace:write",
    WORKSPACE_DELETE = "workspace:delete",
    WORKSPACE_MANAGE = "workspace:manage",
    WORKSPACE_INVITE = "workspace:invite",
    WORKSPACE_MANAGE_MEMBERS = "workspace:manage_members",
    FOLDER_CREATE = "folder:create",
    FOLDER_READ = "folder:read",
    FOLDER_WRITE = "folder:write",
    FOLDER_DELETE = "folder:delete",
    PROJECT_CREATE = "project:create",
    PROJECT_READ = "project:read",
    PROJECT_WRITE = "project:write",
    PROJECT_DELETE = "project:delete",
    TASK_CREATE = "task:create",
    TASK_READ = "task:read",
    TASK_WRITE = "task:write",
    TASK_DELETE = "task:delete",
    TASK_ASSIGN = "task:assign",
    TASK_STATUS_UPDATE = "task:status:update",
    TASK_COMMENT = "task:comment",
    WORKFLOW_CREATE = "workflow:create",
    WORKFLOW_MANAGE = "workflow:manage",
    APPROVAL_ROUTE = "approval:route",
    APPROVAL_APPROVE = "approval:approve"
}
/** Task lifecycle statuses. Mappable to per-tenant custom workflows later. */
export declare enum TaskStatus {
    TODO = "todo",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    BLOCKED = "blocked"
}
/** Handoff verification states. */
export declare enum HandoffStatus {
    PENDING = "pending",
    READY = "ready",
    CONFIRMED = "confirmed",
    NOT_REQUIRED = "not_required"
}
/** Priority levels for tasks. */
export declare enum TaskPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical"
}
/** Task dependency relationship type. */
export declare enum DependencyType {
    FINISH_TO_START = "finish_to_start",
    START_TO_START = "start_to_start",
    FINISH_TO_FINISH = "finish_to_finish",
    START_TO_FINISH = "start_to_finish"
}
/** Calendar event visibility. */
export declare enum EventVisibility {
    PUBLIC = "public",
    DEPARTMENT = "department",
    PRIVATE = "private"
}
/** Workspace-level role for department-based access control. */
export declare enum WorkspaceRole {
    EMPLOYEE = "employee",
    MANAGER = "manager",
    DEPARTMENT_HEAD = "department_head"
}
/** Task/project visibility — who can see this item. */
export declare enum Visibility {
    DEPARTMENT = "department",
    GLOBAL = "global"
}
/** Approval chain step outcome. */
export declare enum ApprovalStatus {
    PENDING = "pending",
    APPROVED = "approved",
    REJECTED = "rejected",
    CHANGES_REQUESTED = "changes_requested"
}
/** Automation rule trigger event types. */
export declare enum TriggerEvent {
    TASK_CREATED = "task:created",
    TASK_UPDATED = "task:updated",
    TASK_STATUS_CHANGED = "task:status:changed",
    TASK_ASSIGNED = "task:assigned",
    TASK_COMMENT_ADDED = "task:comment:added",
    PROJECT_STATUS_CHANGED = "project:status:changed",
    APPROVAL_COMPLETED = "approval:completed",
    FILE_UPLOADED = "file:uploaded"
}
/** Sort directions for list queries. */
export declare enum SortDirection {
    ASC = "asc",
    DESC = "desc"
}
/** Supported authentication providers. */
export declare enum AuthProvider {
    KEYCLOAK = "keycloak",
    GOOGLE = "google",
    MICROSOFT = "microsoft",
    GITHUB = "github",
    LOCAL = "local"
}
/** File type categories for the asset manager. */
export declare enum FileCategory {
    IMAGE = "image",
    DOCUMENT = "document",
    VIDEO = "video",
    OTHER = "other"
}
/** License/plan tiers for tenant billing. */
export declare enum PlanTier {
    FREE = "free",
    STARTER = "starter",
    PROFESSIONAL = "professional",
    ENTERPRISE = "enterprise"
}
//# sourceMappingURL=index.d.ts.map