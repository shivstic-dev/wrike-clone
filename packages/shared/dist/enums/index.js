"use strict";
/**
 * @wrike-clone/shared — Core enumerations
 *
 * All enum values used across the platform. Centralized to prevent
 * drift between backend and frontend.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanTier = exports.FileCategory = exports.AuthProvider = exports.SortDirection = exports.TriggerEvent = exports.ApprovalStatus = exports.Visibility = exports.WorkspaceRole = exports.EventVisibility = exports.DependencyType = exports.TaskPriority = exports.HandoffStatus = exports.TaskStatus = exports.Permission = exports.TenantRole = void 0;
/** Tenant-level roles — defined by the tenant admin, not hardcoded system-wide. */
var TenantRole;
(function (TenantRole) {
    TenantRole["ADMIN"] = "admin";
    TenantRole["MANAGER"] = "manager";
    TenantRole["MEMBER"] = "member";
    TenantRole["GUEST"] = "guest";
    TenantRole["COLLABORATOR"] = "collaborator";
})(TenantRole || (exports.TenantRole = TenantRole = {}));
/** Baseline system permissions. Tenants can extend these with custom roles. */
var Permission;
(function (Permission) {
    // Tenant scope
    Permission["TENANT_READ"] = "tenant:read";
    Permission["TENANT_WRITE"] = "tenant:write";
    Permission["TENANT_MANAGE"] = "tenant:manage";
    // User management
    Permission["USER_INVITE"] = "user:invite";
    Permission["USER_REMOVE"] = "user:remove";
    Permission["USER_ROLE_MANAGE"] = "user:role:manage";
    // Workspace scope
    Permission["WORKSPACE_CREATE"] = "workspace:create";
    Permission["WORKSPACE_READ"] = "workspace:read";
    Permission["WORKSPACE_WRITE"] = "workspace:write";
    Permission["WORKSPACE_DELETE"] = "workspace:delete";
    Permission["WORKSPACE_MANAGE"] = "workspace:manage";
    Permission["WORKSPACE_INVITE"] = "workspace:invite";
    Permission["WORKSPACE_MANAGE_MEMBERS"] = "workspace:manage_members";
    // Folder/Project scope
    Permission["FOLDER_CREATE"] = "folder:create";
    Permission["FOLDER_READ"] = "folder:read";
    Permission["FOLDER_WRITE"] = "folder:write";
    Permission["FOLDER_DELETE"] = "folder:delete";
    Permission["PROJECT_CREATE"] = "project:create";
    Permission["PROJECT_READ"] = "project:read";
    Permission["PROJECT_WRITE"] = "project:write";
    Permission["PROJECT_DELETE"] = "project:delete";
    // Task scope
    Permission["TASK_CREATE"] = "task:create";
    Permission["TASK_READ"] = "task:read";
    Permission["TASK_WRITE"] = "task:write";
    Permission["TASK_DELETE"] = "task:delete";
    Permission["TASK_ASSIGN"] = "task:assign";
    Permission["TASK_STATUS_UPDATE"] = "task:status:update";
    Permission["TASK_COMMENT"] = "task:comment";
    // Workflow / Automation
    Permission["WORKFLOW_CREATE"] = "workflow:create";
    Permission["WORKFLOW_MANAGE"] = "workflow:manage";
    // Approvals
    Permission["APPROVAL_ROUTE"] = "approval:route";
    Permission["APPROVAL_APPROVE"] = "approval:approve";
})(Permission || (exports.Permission = Permission = {}));
/** Task lifecycle statuses. Mappable to per-tenant custom workflows later. */
var TaskStatus;
(function (TaskStatus) {
    TaskStatus["TODO"] = "todo";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["BLOCKED"] = "blocked";
})(TaskStatus || (exports.TaskStatus = TaskStatus = {}));
/** Handoff verification states. */
var HandoffStatus;
(function (HandoffStatus) {
    HandoffStatus["PENDING"] = "pending";
    HandoffStatus["READY"] = "ready";
    HandoffStatus["CONFIRMED"] = "confirmed";
    HandoffStatus["NOT_REQUIRED"] = "not_required";
})(HandoffStatus || (exports.HandoffStatus = HandoffStatus = {}));
/** Priority levels for tasks. */
var TaskPriority;
(function (TaskPriority) {
    TaskPriority["LOW"] = "low";
    TaskPriority["MEDIUM"] = "medium";
    TaskPriority["HIGH"] = "high";
    TaskPriority["CRITICAL"] = "critical";
})(TaskPriority || (exports.TaskPriority = TaskPriority = {}));
/** Task dependency relationship type. */
var DependencyType;
(function (DependencyType) {
    DependencyType["FINISH_TO_START"] = "finish_to_start";
    DependencyType["START_TO_START"] = "start_to_start";
    DependencyType["FINISH_TO_FINISH"] = "finish_to_finish";
    DependencyType["START_TO_FINISH"] = "start_to_finish";
})(DependencyType || (exports.DependencyType = DependencyType = {}));
/** Calendar event visibility. */
var EventVisibility;
(function (EventVisibility) {
    EventVisibility["PUBLIC"] = "public";
    EventVisibility["DEPARTMENT"] = "department";
    EventVisibility["PRIVATE"] = "private";
})(EventVisibility || (exports.EventVisibility = EventVisibility = {}));
/** Workspace-level role for department-based access control. */
var WorkspaceRole;
(function (WorkspaceRole) {
    WorkspaceRole["EMPLOYEE"] = "employee";
    WorkspaceRole["MANAGER"] = "manager";
    WorkspaceRole["DEPARTMENT_HEAD"] = "department_head";
})(WorkspaceRole || (exports.WorkspaceRole = WorkspaceRole = {}));
/** Task/project visibility — who can see this item. */
var Visibility;
(function (Visibility) {
    Visibility["DEPARTMENT"] = "department";
    Visibility["GLOBAL"] = "global";
})(Visibility || (exports.Visibility = Visibility = {}));
/** Approval chain step outcome. */
var ApprovalStatus;
(function (ApprovalStatus) {
    ApprovalStatus["PENDING"] = "pending";
    ApprovalStatus["APPROVED"] = "approved";
    ApprovalStatus["REJECTED"] = "rejected";
    ApprovalStatus["CHANGES_REQUESTED"] = "changes_requested";
})(ApprovalStatus || (exports.ApprovalStatus = ApprovalStatus = {}));
/** Automation rule trigger event types. */
var TriggerEvent;
(function (TriggerEvent) {
    TriggerEvent["TASK_CREATED"] = "task:created";
    TriggerEvent["TASK_UPDATED"] = "task:updated";
    TriggerEvent["TASK_STATUS_CHANGED"] = "task:status:changed";
    TriggerEvent["TASK_ASSIGNED"] = "task:assigned";
    TriggerEvent["TASK_COMMENT_ADDED"] = "task:comment:added";
    TriggerEvent["PROJECT_STATUS_CHANGED"] = "project:status:changed";
    TriggerEvent["APPROVAL_COMPLETED"] = "approval:completed";
    TriggerEvent["FILE_UPLOADED"] = "file:uploaded";
})(TriggerEvent || (exports.TriggerEvent = TriggerEvent = {}));
/** Sort directions for list queries. */
var SortDirection;
(function (SortDirection) {
    SortDirection["ASC"] = "asc";
    SortDirection["DESC"] = "desc";
})(SortDirection || (exports.SortDirection = SortDirection = {}));
/** Supported authentication providers. */
var AuthProvider;
(function (AuthProvider) {
    AuthProvider["KEYCLOAK"] = "keycloak";
    AuthProvider["GOOGLE"] = "google";
    AuthProvider["MICROSOFT"] = "microsoft";
    AuthProvider["GITHUB"] = "github";
    AuthProvider["LOCAL"] = "local";
})(AuthProvider || (exports.AuthProvider = AuthProvider = {}));
/** File type categories for the asset manager. */
var FileCategory;
(function (FileCategory) {
    FileCategory["IMAGE"] = "image";
    FileCategory["DOCUMENT"] = "document";
    FileCategory["VIDEO"] = "video";
    FileCategory["OTHER"] = "other";
})(FileCategory || (exports.FileCategory = FileCategory = {}));
/** License/plan tiers for tenant billing. */
var PlanTier;
(function (PlanTier) {
    PlanTier["FREE"] = "free";
    PlanTier["STARTER"] = "starter";
    PlanTier["PROFESSIONAL"] = "professional";
    PlanTier["ENTERPRISE"] = "enterprise";
})(PlanTier || (exports.PlanTier = PlanTier = {}));
//# sourceMappingURL=index.js.map