# Wrike Clone — Full Architecture & Codebase Deep Dive

> **Version:** 0.1.0  
> **Description:** Enterprise-grade open-source work management platform (Wrike-equivalent)  
> **Stack:** NestJS + React + PostgreSQL + TypeScript monorepo  
> **Date:** 2026-07-25

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Infrastructure & DevOps](#3-infrastructure--devops)
4. [Shared Package (`@wrike-clone/shared`)](#4-shared-package)
5. [Backend Architecture](#5-backend-architecture)
6. [Database Schema & Multi-Tenancy](#6-database-schema--multi-tenancy)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [API Module Deep Dive](#8-api-module-deep-dive)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Frontend Components](#10-frontend-components)
11. [Security Model](#11-security-model)
12. [Scalability & Performance](#12-scalability--performance)
13. [Development Workflow](#13-development-workflow)

---

## 1. Project Overview

This is a **full-stack work management platform** that replicates the core functionality of Wrike — a leading enterprise project management SaaS. It is built as a **monorepo** using npm workspaces with three packages:

| Package | Path | Role |
|---------|------|------|
| `@wrike-clone/backend` | `packages/backend/` | NestJS REST API server |
| `@wrike-clone/frontend` | `packages/frontend/` | React SPA with Vite |
| `@wrike-clone/shared` | `packages/shared/` | Shared types, enums, validation |

The project follows a **domain-driven modular architecture** where every business capability is a self-contained NestJS module with its own controller, service, and database interactions.

---

## 2. Monorepo Structure

```
wrike-clone/
├── .dockerignore
├── .env                          # Local environment config
├── .env.example                  # Template for environment variables
├── .github/
│   └── workflows/
│       ├── ci.yml                # Continuous Integration
│       └── deploy.yml            # Deployment pipeline
├── .gitignore
├── .prettierrc                   # Code formatting
├── docker/
│   ├── docker-compose.yml        # Production compose
│   ├── docker-compose.dev.yml    # Dev overrides (hot reload)
│   ├── Dockerfile.backend        # Multi-stage backend image
│   ├── Dockerfile.frontend       # Multi-stage frontend image
│   ├── init/
│   │   └── postgres/
│   │       └── init.sql          # Database initialization
│   └── nginx/
│       ├── nginx.conf            # Main Nginx config
│       └── backend.conf          # API reverse proxy config
├── docs/
│   └── WRIKE_CLONE_ARCHITECTURE.md  # ← This file
├── package.json                  # Root workspace config
├── packages/
│   ├── backend/                  # NestJS API server
│   ├── frontend/                 # React SPA
│   └── shared/                   # Shared code
├── scripts/
│   ├── seed.ts                   # Database seed script
│   └── setup.sh                  # Initial project setup
├── tsconfig.base.json            # Shared TypeScript config
└── package-lock.json
```

---

## 3. Infrastructure & DevOps

### 3.1 Docker Architecture

The platform runs six services orchestrated by Docker Compose across three isolated networks:

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND NETWORK (bridge, internal: false)                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Nginx (port 80) ── serves built React SPA             │   │
│  │       │                                                 │   │
│  │       └── proxies /api to backend:4000                  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND NETWORK (bridge, internal: true)                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  NestJS API (port 4000)                                 │   │
│  │  └── connects to Redis, MinIO, Meilisearch              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────────────┐
│  DATA NETWORK (bridge, internal: true)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │PostgreSQL│  │  Redis   │  │  MinIO   │  │ Meilisearch  │   │
│  │ :5432    │  │ :6379    │  │ :9000    │  │ :7700        │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Infrastructure Services

| Service | Purpose | Image | Resource Limits |
|---------|---------|-------|----------------|
| **PostgreSQL** | Primary database | `postgres:16-alpine` | 512MB RAM, 1 CPU |
| **Redis** | Caching, queues, session store | `redis:7-alpine` | 256MB RAM, 0.5 CPU |
| **MinIO** | S3-compatible object storage (files) | `minio/minio:latest` | 512MB RAM, 0.5 CPU |
| **Meilisearch** | Full-text search engine | `getmeili/meilisearch:v1.12` | 256MB RAM, 0.5 CPU |

### 3.3 Dockerfiles

- **`Dockerfile.backend`**: Multi-stage build (builder → production). Builder stage compiles TypeScript; production stage runs the compiled JS with only runtime dependencies.
- **`Dockerfile.frontend`**: Multi-stage build. Builder stage runs `vite build`; production stage serves static files via Nginx.

### 3.4 CI/CD (GitHub Actions)

- **`ci.yml`**: Runs on every push/PR — lint, typecheck, test across all three packages.
- **`deploy.yml`**: Triggers on merge to main — builds Docker images, pushes to registry, deploys.

### 3.5 Environment Configuration

All environment variables are documented in `.env.example`. Key groups:

| Group | Variables |
|-------|-----------|
| App | `NODE_ENV`, `APP_NAME`, `APP_PORT`, `API_PREFIX` |
| Database | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_SSL` |
| Redis | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB` |
| Auth | `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET` |
| S3 | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET` |
| Search | `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` |
| Security | `ENCRYPTION_KEY` |
| CORS | `CORS_ORIGINS` |
| Rate Limiting | `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX_REQUESTS` |

---

## 4. Shared Package

The `@wrike-clone/shared` package is the **single source of truth** for code shared between backend and frontend. It has zero runtime dependencies except `zod`.

### 4.1 Enums (`src/enums/index.ts`)

All enum values centralized to prevent drift between frontend and backend:

| Enum | Values | Purpose |
|------|--------|---------|
| `TenantRole` | `admin`, `manager`, `member`, `guest`, `collaborator` | Role-based access control |
| `Permission` | `tenant:read`, `task:create`, etc. (28 values) | Granular permission strings |
| `TaskStatus` | `backlog`, `todo`, `in_progress`, `in_review`, `done`, `cancelled` | Task lifecycle states |
| `TaskPriority` | `none`, `low`, `medium`, `high`, `urgent` | Priority levels |
| `DependencyType` | `finish_to_start`, `start_to_start`, `finish_to_finish`, `start_to_finish` | Task dependency types |
| `ApprovalStatus` | `pending`, `approved`, `rejected`, `changes_requested` | Approval outcomes |
| `TriggerEvent` | `task:created`, `task:updated`, etc. (8 events) | Automation triggers |
| `PlanTier` | `free`, `starter`, `professional`, `enterprise` | Tenant licensing |
| `FileCategory` | `image`, `document`, `video`, `other` | File classification |
| `AuthProvider` | `keycloak`, `google`, `microsoft`, `github`, `local` | SSO providers |

### 4.2 Constants (`src/constants/index.ts`)

```typescript
PAGINATION:       { DEFAULT_PAGE: 1, DEFAULT_PER_PAGE: 25, MAX_PER_PAGE: 100 }
SESSION:          { ACCESS_TOKEN_TTL_SEC: 900, REFRESH_TOKEN_TTL_SEC: 2,592,000 }
RATE_LIMIT:       { WINDOW_MS: 60_000, MAX_REQUESTS: 100 }
QUEUES:           { AUTOMATION, NOTIFICATIONS, WEBHOOKS, EMAIL, LLM, FILE_PROCESSING }
CACHE_KEYS:       { TENANT: 'tenant:', USER_PERMISSIONS: 'perm:', WORKLOAD_AGG: 'workload:' }
MAX_FILE_SIZE_BYTES: 104_857_600 (100MB)
FOLDER_MAX_DEPTH: 10
```

**Critical: `DEFAULT_ROLE_PERMISSIONS`** — the RBAC backbone:

| Role | Permissions |
|------|------------|
| `admin` | `*` (wildcard — all permissions) |
| `manager` | Full CRUD on workspace, folder, project, task + user:invite + approval + workflow |
| `member` | Read workspace/folder/project + create/read/write/status-update task |
| `guest` | Read task + write (comment/proof) |
| `collaborator` | Read/write task + read folder/project |

### 4.3 Domain Types (`src/types/domain.ts`)

Every database table maps to a TypeScript interface. Key interfaces:

```
BaseEntity          → { id, tenantId, createdAt, updatedAt, deletedAt }
Tenant              → { name, slug, domain, planTier, logoUrl, settings }
User                → { email, displayName, avatarUrl, locale, timezone }
TenantMembership    → { tenantId, userId, role, joinedAt, isActive }
Workspace           → { name, description, icon, sortOrder }
Folder              → { workspaceId, parentFolderId, name, isArchived, metadata }
Project             → { folderId, ownerId, status, startDate, dueDate, budget }
Task                → { projectId, parentTaskId, assigneeId, title, description, status, priority, customFields, isRecurring }
TaskDependency      → { taskId, dependsOnTaskId, dependencyType, lagDays }
TaskComment         → { taskId, authorId, content, parentCommentId, attachments }
TimeEntry           → { taskId, userId, loggedDate, durationMinutes, isBillable }
CustomFieldDefinition → { name, key, fieldType, options, formula }
AutomationRule      → { triggerEvent, conditions[], actions[], isActive }
ApprovalRequest     → { taskId, chainId, currentStep, status }
FileVersion         → { fileId, originalName, mimeType, sizeBytes, storagePath, checksum }
FileAnnotation      → { fileVersionId, x, y, width, height, content, color }
Notification        → { userId, type, title, body, data, isRead, priority }
Webhook             → { url, secret, events[], isActive, failureCount }
```

### 4.4 API Contract Types (`src/types/api.ts`)

Every request and response shape is defined here:

```
LoginRequest / LoginResponse       → Auth flow
CreateTenantRequest / UpdateTenantRequest
InviteUserRequest / UpdateMembershipRequest
CreateWorkspaceRequest / UpdateWorkspaceRequest
CreateFolderRequest / UpdateFolderRequest
CreateProjectRequest / UpdateProjectRequest
CreateTaskRequest / UpdateTaskRequest
TaskFilterParams / BulkTaskUpdateRequest
CreateDependencyRequest
CreateCommentRequest
CreateTimeEntryRequest
CreateAutomationRuleRequest
CreateApprovalRequest / SubmitApprovalVoteRequest
CreateWebhookRequest
FileUploadResponse
DashboardWidget / WorkloadReport
PaginatedResponse<T>              → Generic paginated response envelope
ApiResponse<T> / ApiError         → Standard API response envelope
```

### 4.5 Validation Schemas (`src/validation/index.ts`)

All API inputs are validated through **Zod schemas** that are shared between backend (server-side guard) and frontend (form validation). Key schemas and the types inferred from them:

```typescript
loginSchema              → LoginInput
createTenantSchema       → CreateTenantInput
inviteUserSchema         → InviteUserInput
createWorkspaceSchema    → CreateWorkspaceInput
createFolderSchema       → CreateFolderInput
createProjectSchema      → CreateProjectInput
createTaskSchema         → CreateTaskInput
updateTaskSchema         → UpdateTaskInput
taskFilterSchema         → TaskFilterInput
bulkTaskUpdateSchema     → BulkTaskUpdateInput
createDependencySchema   → CreateDependencyInput
createCommentSchema      → CreateCommentInput
createTimeEntrySchema    → CreateTimeEntryInput
createAutomationRuleSchema → CreateAutomationRuleInput
createApprovalSchema     → CreateApprovalInput
submitApprovalVoteSchema → SubmitApprovalVoteInput
createWebhookSchema      → CreateWebhookInput
paginationSchema         → Generic pagination
```

Each schema uses shared helpers:
- `uuidField` — regex-validated UUID
- `slugField` — lowercase alphanumeric + hyphens
- `isoDate` — ISO-8601 or date string

### 4.6 Tests (`test/validation.spec.ts`)

Zod validation schemas have their own test file in the shared package.

---

## 5. Backend Architecture

### 5.1 Framework & Core Stack

| Technology | Purpose |
|------------|---------|
| **NestJS 11** | Application framework (controllers, modules, providers) |
| **Knex 3** | SQL query builder for PostgreSQL |
| **pg** | PostgreSQL client |
| **ioredis** | Redis client |
| **BullMQ** | Job queues for async processing |
| **Passport + JWT** | Authentication |
| **Zod** | Input validation |
| **Helmet** | Security headers |
| **Winston** | Logging |
| **Socket.IO** | WebSocket for real-time notifications |
| **MinIO SDK** | S3-compatible object storage |
| **class-validator / class-transformer** | Decorator-based validation |

### 5.2 Application Bootstrap (`src/main.ts`)

The entry point (`bootstrap()`):
1. Loads app config from environment
2. Creates NestJS application
3. Registers middleware in order: **Helmet → CORS → Compression → CookieParser**
4. Sets global API prefix (`/api/v1`)
5. Enables shutdown hooks for graceful shutdown
6. Starts listening on configured port

### 5.3 Module Architecture (`src/app.module.ts`)

The root module imports **16 feature modules** plus `ThrottlerModule` for rate limiting:

```
AppModule
├── Global Middleware: TenantContextMiddleware (applied to all routes)
├── Global Filter: GlobalExceptionFilter
├── ThrottlerModule (rate limiting: 100 req/min)
│
├── Core Module
│   └── DatabaseModule (global, provides Knex)
│
├── Feature Modules (16)
│   ├── HealthModule       → Health check endpoints
│   ├── AuthModule         → Login, register, token refresh
│   ├── TenantModule       → Tenant CRUD
│   ├── UserModule         → User management, invitations
│   ├── WorkspaceModule    → Workspace CRUD
│   ├── FolderModule       → Folder CRUD, hierarchy
│   ├── ProjectModule      → Project CRUD, task counts
│   ├── TaskModule         → Task CRUD, dependencies, comments, bulk updates
│   ├── RbacModule         → Role/permission querying
│   ├── NotificationModule → In-app notifications
│   ├── AutomationModule   → No-code rule engine
│   ├── ApprovalModule     → Multi-stage approval chains
│   ├── FileModule         → File upload (stub)
│   ├── TimelogModule      → Time tracking
│   ├── WebhookModule      → Outbound webhooks
│   └── SearchModule       → Full-text search (stub)
```

### 5.4 Common Infrastructure Layer

#### 5.4.1 Tenant Context (`src/common/tenant-context.ts`)

Node.js `AsyncLocalStorage`-based context that carries per-request tenant information:

```typescript
interface TenantContextData {
  tenantId: string;
  userId: string;
  membershipId: string;
  role: string;
  permissions: string[];
}
```

- `getTenantContext()` — returns the context (or undefined)
- `requireTenantContext()` — returns the context or throws

#### 5.4.2 Tenant Context Middleware (`src/common/middleware/tenant-context.middleware.ts`)

Applied to all routes. Extracts user info from `req.user` (set by AuthGuard) and initializes the `AsyncLocalStorage` context. This makes tenant/user identity available throughout the call stack without passing it through every function parameter.

#### 5.4.3 Tenant Query Runner (`src/common/tenant-runner.ts`)

Wraps Knex queries in a transaction that sets `app.current_tenant_id` on the PostgreSQL session — this is how **Row-Level Security (RLS)** policies know which tenant to filter by.

#### 5.4.4 Auth Guard (`src/common/guards/auth.guard.ts`)

- Extracts JWT from `Authorization: Bearer <token>`
- Verifies the token using `jsonwebtoken.verify()`
- Attaches `AuthenticatedUser` to `req.user`
- On failure: throws `401 Unauthorized`

#### 5.4.5 Roles Guard (`src/common/guards/roles.guard.ts`)

- Reads required permissions from the `@Permissions()` decorator via NestJS `Reflector`
- Checks user permissions against requirements
- Admin wildcard (`*`) bypasses all checks
- On failure: throws `403 Forbidden`

#### 5.4.6 Global Exception Filter (`src/common/filters/http-exception.filter.ts`)

Catches all exceptions and returns a consistent JSON envelope:

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Task not found",
    "details": { "fields": ["..."] },
    "requestId": "..."
  }
}
```

Maps HTTP status codes to error codes: `400` → `BAD_REQUEST`, `401` → `UNAUTHORIZED`, `403` → `FORBIDDEN`, `404` → `NOT_FOUND`, `409` → `CONFLICT`, `422` → `UNPROCESSABLE_ENTITY`, `429` → `TOO_MANY_REQUESTS`, `500` → `INTERNAL_ERROR`.

#### 5.4.7 Decorators

- **`@CurrentUser()`** — parameter decorator that extracts authenticated user from request. Supports optional field parameter (e.g., `@CurrentUser('userId')`).
- **`@Permissions(...)`** — method/class decorator that declares required permissions for a route. Used with RolesGuard.

---

## 6. Database Schema & Multi-Tenancy

### 6.1 Schema Overview

The database schema (`src/database/schema.sql`) creates **22 tables** with **23 PostgreSQL RLS policies** and **14 auto-update triggers**.

#### 6.1.1 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- Cryptographic functions
```

#### 6.1.2 Custom ENUMs (9 types)

```sql
tenant_role, task_status, task_priority, project_status,
dependency_type, approval_status, plan_tier, field_type,
action_type, event_type
```

#### 6.1.3 Table Inventory

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `tenants` | Organizations | `name`, `slug`, `domain`, `plan_tier`, `settings` (JSONB) |
| `users` | Global user accounts | `email`, `display_name`, `avatar_url`, `locale`, `timezone` |
| `tenant_memberships` | User-tenant join with role | `tenant_id`, `user_id`, `role`, `is_active` — UNIQUE(tenant_id, user_id) |
| `workspaces` | Top-level containers | `tenant_id`, `name`, `description`, `sort_order` |
| `folders` | Recursive hierarchy | `tenant_id`, `workspace_id`, `parent_folder_id` (self-ref), `is_archived`, `metadata` (JSONB) |
| `projects` | Project within folder | `tenant_id`, `folder_id`, `owner_id`, `status`, `budget`, `actual_cost` |
| `tasks` | Core work items | `tenant_id`, `project_id`, `parent_task_id`, `assignee_id`, `title`, `status`, `priority`, `custom_fields` (JSONB), `is_recurring`, `recurrence_rule` |
| `task_folder_links` | Task cross-tagging | `task_id`, `folder_id`, `is_home` — PK(task_id, folder_id) |
| `task_dependencies` | Task blocking | `task_id`, `depends_on_task_id`, `dependency_type`, `lag_days` |
| `task_assignees` | Multi-assignee | `task_id`, `user_id`, `assigned_at`, `role` |
| `task_comments` | Discussion threads | `tenant_id`, `task_id`, `author_id`, `content`, `parent_comment_id`, `attachments` (TEXT[]) |
| `activity_logs` | Audit trail | `tenant_id`, `actor_id`, `entity_type`, `entity_id`, `action`, `changes` (JSONB) |
| `time_entries` | Time tracking | `tenant_id`, `task_id`, `user_id`, `logged_date`, `duration_minutes`, `is_billable`, `hourly_rate`, `is_locked` |
| `custom_field_definitions` | Tenant custom fields | `tenant_id`, `name`, `key`, `field_type`, `options`, `formula` — UNIQUE(tenant_id, key) |
| `item_types` | Custom task types | `tenant_id`, `name`, `icon`, `color` |
| `approval_chains` | Approval workflow templates | `tenant_id`, `name` |
| `approval_steps` | Steps in a chain | `chain_id`, `step_order`, `approver_id`, `required_count` |
| `approval_requests` | Active approval processes | `tenant_id`, `task_id`, `chain_id`, `current_step`, `status` |
| `approval_votes` | Individual approval decisions | `request_id`, `step_id`, `approver_id`, `status`, `comment` |
| `notifications` | In-app notifications | `tenant_id`, `user_id`, `type`, `title`, `body`, `data` (JSONB), `is_read`, `priority` |
| `webhooks` | Outbound event deliveries | `tenant_id`, `url`, `secret`, `events[]`, `failure_count` |
| `files` | File record (versioned) | `tenant_id`, `task_id`, `current_version_id` |
| `file_versions` | Versioned file assets | `tenant_id`, `file_id`, `original_name`, `mime_type`, `size_bytes`, `storage_path`, `checksum` |
| `file_annotations` | Proof annotations | `file_version_id`, `page_number`, `timestamp_ms`, `x`, `y`, `width`, `height`, `content`, `color` |
| `sessions` | Refresh token store | `user_id`, `tenant_id`, `refresh_token`, `expires_at` |

### 6.2 Full-Text Search

The `tasks` table has a GIN index on `to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))` for efficient PostgreSQL full-text search.

### 6.3 Row-Level Security (RLS)

**This is a cornerstone of the architecture.** RLS enforces tenant isolation at the database level, so even if application code has a bug, data can never leak across organizations.

**How it works:**

1. **18 tenant-scoped tables** have RLS enabled
2. A `current_tenant_id()` SQL function reads the `app.current_tenant_id` session variable
3. A generic `tenant_isolation` policy is created on each table:
   ```sql
   CREATE POLICY tenant_isolation ON <table> FOR ALL
     USING (tenant_id = current_tenant_id())
     WITH CHECK (tenant_id = current_tenant_id())
   ```
4. The application sets `app.current_tenant_id` at the start of each authenticated request via `runWithTenant()` in `tenant-runner.ts`

### 6.4 Auto-Update Triggers

**14 tables** have a `BEFORE UPDATE` trigger that automatically sets `updated_at = NOW()`.

### 6.5 Knex Configuration (`src/database/knexfile.ts`)

Configured for PostgreSQL with connection pooling (min: 2, max: 25), migration directory (`./migrations`), and seed directory (`./seeds`).

---

## 7. Authentication & Authorization

### 7.1 Authentication Flow

```
Client                    Backend                          Database
  │                         │                                │
  │  POST /auth/login       │                                │
  │  {email, password,      │                                │
  │   tenantSlug}           │                                │
  │────────────────────────>│                                │
  │                         │  Lookup tenant by slug         │
  │                         │───────────────────────────────>│
  │                         │  Lookup user by email          │
  │                         │───────────────────────────────>│
  │                         │  Verify bcrypt password        │
  │                         │  Lookup tenant membership      │
  │                         │───────────────────────────────>│
  │                         │                                │
  │                         │  Generate JWT (15 min TTL)     │
  │                         │  Generate refresh token (UUID) │
  │                         │  Store session                 │
  │                         │───────────────────────────────>│
  │                         │  Update last_login_at          │
  │                         │───────────────────────────────>│
  │  {accessToken,          │                                │
  │   refreshToken,         │                                │
  │   user, tenant,         │                                │
  │   membership}           │                                │
  │<────────────────────────│                                │
```

### 7.2 Token Structure

The JWT payload contains:
```json
{
  "sub": "user-uuid",
  "userId": "user-uuid",
  "tenantId": "tenant-uuid",
  "membershipId": "membership-uuid",
  "email": "user@example.com",
  "role": "admin",
  "permissions": ["*"],           // resolved from DEFAULT_ROLE_PERMISSIONS
  "iat": 1234567890,
  "exp": 1234568790               // 15 minutes
}
```

### 7.3 Session Management

- Refresh tokens are UUIDs stored in the `sessions` table
- 30-day TTL on refresh tokens
- Maximum 10 sessions per user
- Sessions table is cleaned by expiration

### 7.4 Authorization Layers

```
Request
  │
  ├── 1. TenantContextMiddleware
  │     └── Initializes AsyncLocalStorage with {tenantId, userId, role, permissions}
  │
  ├── 2. AuthGuard (route-level @UseGuards)
  │     └── Validates JWT, attaches user to req.user
  │
  └── 3. RolesGuard (route-level @UseGuards)
        └── Checks @Permissions() metadata against user.permissions
              │
              ├── Admin wildcard (*) → pass
              ├── All required perms present → pass
              └── Missing any perm → 403 Forbidden
```

### 7.5 RBAC Data Model

The RBAC system uses the built-in `DEFAULT_ROLE_PERMISSIONS` map from the shared package. The `rbac.service.ts` provides:

- `getPermissionsForRole(role)` — returns permission array for a role
- `getAllRoles()` — returns all role names
- `getAllPermissions()` — returns sorted unique permission strings
- `roleHasPermission(role, permission)` — checks if role has a specific permission

The RBAC controller exposes read-only endpoints:
- `GET /rbac/roles`
- `GET /rbac/permissions`
- `GET /rbac/roles/:role/permissions`

---

## 8. API Module Deep Dive

### 8.1 Health Module

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Full health check (DB status + latency, memory, uptime) |
| GET | `/health/ready` | Readiness probe (DB check only) |

### 8.2 Auth Module

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | No | Authenticate user, return JWT tokens |
| POST | `/auth/refresh` | No | Refresh access token using refresh token |
| POST | `/auth/register` | No | Register new user in a tenant |

**Service logic (`auth.service.ts`):**
- **Login:** Finds tenant by slug → finds user by email → bcrypt verify → checks membership → generates JWT + refresh token → stores session → updates last_login_at → returns tokens + user/tenant/membership data
- **Refresh:** Validates refresh token in DB → checks membership still active → generates new JWT
- **Register:** Finds/creates tenant → checks for existing user → creates user if new → creates membership → uses DB transaction for atomicity

### 8.3 Tenant Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenants/:id` | `tenant:read` | Get tenant by ID |
| GET | `/tenants/slug/:slug` | Public | Find tenant by slug (for login) |
| POST | `/tenants` | Public | Create new tenant |
| PATCH | `/tenants/:id` | `tenant:write` | Update tenant |

**Service logic (`tenant.service.ts`):**
- **Create:** Validates slug uniqueness → inserts with default settings JSON (timezone, locale, max users, storage, auth providers, SSO, session timeout)
- **Update:** Merges settings with existing JSONB, only updates provided fields

### 8.4 User Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/users` | `tenant:read` | List all users in tenant (paginated) |
| POST | `/users/invite` | `user:invite` | Invite user to tenant |
| PATCH | `/users/:userId/role` | `user:role:manage` | Change user's role |
| DELETE | `/users/:userId` | `user:remove` | Remove user from tenant (soft) |

**Service logic (`user.service.ts`):**
- **findAll:** Paginated query joining `tenant_memberships` + `users`, ordered by display_name
- **invite:** Finds or creates user by email → checks existing membership (reactivates if deactivated) → creates new membership
- **remove:** Soft-deactivates membership (`is_active = false`)

### 8.5 Workspace Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/workspaces` | `workspace:read` | List workspaces |
| GET | `/workspaces/:id` | `workspace:read` | Get workspace by ID |
| POST | `/workspaces` | `workspace:create` | Create workspace |
| PATCH | `/workspaces/:id` | `workspace:write` | Update workspace |
| DELETE | `/workspaces/:id` | `workspace:delete` | Soft-delete workspace |

### 8.6 Folder Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/folders?workspaceId=` | `folder:read` | List folders in workspace |
| GET | `/folders/:id` | `folder:read` | Get folder by ID |
| POST | `/folders` | `folder:create` | Create folder |
| PATCH | `/folders/:id` | `folder:write` | Update folder |
| DELETE | `/folders/:id` | `folder:delete` | Soft-delete folder |

**Service logic:** Supports self-referential `parent_folder_id` for nested hierarchy. Validates parent exists in the same tenant.

### 8.7 Project Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/projects?folderId=&status=` | `project:read` | List projects (paginated, filterable) |
| GET | `/projects/:id` | `project:read` | Get project + task counts by status |
| POST | `/projects` | `project:create` | Create project |
| PATCH | `/projects/:id` | `project:write` | Update project |
| DELETE | `/projects/:id` | `project:delete` | Soft-delete project |

**Service logic enhancements:**
- `findById` returns task counts aggregated by status
- `update` auto-sets `completed_at` when status becomes `completed`

### 8.8 Task Module — The Core

This is the most feature-rich module with **7 endpoints** and the most complex service logic.

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tasks` | `task:read` | List tasks (paginated, filterable, searchable) |
| GET | `/tasks/:id` | `task:read` | Get task + comments + dependencies + assignees + attachments |
| POST | `/tasks` | `task:create` | Create task |
| PATCH | `/tasks/:id` | `task:write` | Partial update task |
| DELETE | `/tasks/:id` | `task:delete` | Soft-delete task |
| POST | `/tasks/bulk-update` | `task:write` | Bulk update (batch status change) |
| POST | `/tasks/dependencies` | `task:write` | Create task dependency |
| DELETE | `/tasks/dependencies/:id` | `task:write` | Remove task dependency |
| POST | `/tasks/comments` | `task:read` | Add comment to task |

#### Task Filtering (`findAll`)

Supports combined filtering:
- `projectId` / `assigneeId` / `folderId` (exact match)
- `status` / `priority` (array — can filter by multiple)
- `dueDateBefore` / `dueDateAfter` (date range)
- `search` (full-text search via PostgreSQL `to_tsvector` / `plainto_tsquery`)
- `page` / `perPage` (pagination)
- `sortBy` / `sortDirection` (sorting)

#### Task Creation (`create`)

- Validates project belongs to tenant
- Sets `created_by_id` from tenant context
- Serializes `custom_fields` to JSONB
- Logs activity: `task:created`

#### Task Update (`update`)

- Compares old and new values per field using a `fieldMap`
- Only updates if changes detected
- Auto-sets `completed_at` when moving to `done`
- Serializes `custom_fields` if object
- Logs activity: `task:updated` with change details

#### Bulk Update (`bulkUpdate`)

- Iterates over `taskIds` array and calls `update()` for each
- Continues on individual task failures (logs warning)

#### Dependencies

- Validates both tasks exist in tenant
- Prevents self-dependency
- Supports 4 dependency types: `finish_to_start`, `start_to_start`, `finish_to_finish`, `start_to_finish`
- Optional `lag_days` for offset

#### Comments

- Supports threaded replies via `parent_comment_id`
- Stores `attachments` as PostgreSQL text array

### 8.9 Notification Module

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List user's notifications (paginated) |
| GET | `/notifications/unread-count` | Get unread count |
| PATCH | `/notifications/:id/read` | Mark one as read |
| PATCH | `/notifications/read-all` | Mark all as read |

### 8.10 Automation Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/automation` | `workflow:manage` | List automation rules |
| POST | `/automation` | `workflow:create` | Create automation rule |
| PATCH | `/automation/:id/toggle` | `workflow:manage` | Enable/disable rule |
| DELETE | `/automation/:id` | `workflow:manage` | Delete rule |

**Rule structure:**
```json
{
  "name": "Notify on high priority",
  "triggerEvent": "task:created",
  "conditions": [
    { "field": "priority", "operator": "equals", "value": "urgent" }
  ],
  "actions": [
    { "type": "send_notification", "config": { "channels": ["slack", "email"] } }
  ]
}
```

### 8.11 Approval Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/approvals` | `approval:route` | Create approval request |
| POST | `/approvals/:requestId/vote` | `approval:approve` | Submit vote |

**Service logic:** Multi-stage approval chain processing:
- **Vote submitted:** Records vote → if approved, advances to next step → if all steps complete, marks request as `approved`
- **Rejected:** Immediately marks request as `rejected`
- **Changes requested:** Marks request as `changes_requested`

### 8.12 Timelog Module

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/time-entries?taskId=` | List time entries for task |
| POST | `/time-entries` | Create time entry |
| POST | `/time-entries/:id/lock` | Lock time entry (prevent edits) |

**Service logic:** Creating a time entry automatically updates the task's `actual_hours` via `COALESCE(actual_hours, 0) + duration_minutes / 60`.

### 8.13 Webhook Module

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/webhooks` | `tenant:manage` | List webhooks |
| POST | `/webhooks` | `tenant:manage` | Create webhook |
| PATCH | `/webhooks/:id/toggle` | `tenant:manage` | Enable/disable |
| DELETE | `/webhooks/:id` | `tenant:manage` | Delete webhook |

### 8.14 File Module (Stub)

The `FileModule` is declared but has no controllers or services yet. Ready for S3-based file upload/versioning implementation.

### 8.15 Search Module (Stub)

The `SearchModule` is declared but empty. Ready for Meilisearch integration.

---

## 9. Frontend Architecture

### 9.1 Tech Stack

| Technology | Purpose |
|------------|---------|
| **React 19** | UI framework |
| **TypeScript 5.7** | Type safety |
| **Vite 6** | Build tool & dev server |
| **React Router DOM v7** | Client-side routing |
| **TanStack React Query v5** | Server state management & caching |
| **TanStack React Table v8** | Data table with sorting, filtering, virtualization |
| **Zustand v5** | Client state management |
| **Axios** | HTTP client with interceptors |
| **Tailwind CSS 3** | Utility-first styling |
| **dnd-kit** | Drag-and-drop for Kanban board |
| **react-grid-layout** | Dashboard widget layout |
| **Socket.IO Client** | Real-time notifications |
| **date-fns** | Date formatting |
| **react-hot-toast** | Toast notifications |
| **clsx** | Conditional class names |

### 9.2 Application Entry & Routing

**`main.tsx`** mounts the React app into `#root`.

**`App.tsx`** defines the routing structure:

```
<QueryClientProvider>          ← TanStack Query provider
  <BrowserRouter>              ← React Router
    <TenantProvider>           ← Tenant slug context
      <AuthProvider>           ← Auth state context
        <Routes>
          │
          ├── AuthLayout       ← Login page wrapper
          │   └── /login       → LoginPage
          │
          ├── ProtectedRoute   ← Auth check wrapper
          │   └── DashboardLayout
          │       ├── /               → redirect to /dashboard
          │       ├── /dashboard      → DashboardPage
          │       ├── /workspaces/:workspaceId → WorkspacePage
          │       ├── /projects/:projectId   → ProjectPage
          │       └── /tasks/:taskId         → TaskDetailPage
          │
          └── *                → redirect to /dashboard
        </Routes>
      </AuthProvider>
    </TenantProvider>
  </BrowserRouter>
</QueryClientProvider>
```

### 9.3 API Client (`src/api/client.ts`)

Axios-based client configured with:

- **Base URL:** `/api/v1` (proxied by Vite in dev, Nginx in prod)
- **Request interceptor:** Attaches JWT (`Authorization: Bearer`) and tenant ID (`X-Tenant-Id`) headers from localStorage
- **Response interceptor:** On 401, attempts token refresh (`POST /auth/refresh`), retries original request. If refresh fails, clears localStorage and redirects to `/login`

### 9.4 State Management

**Server state** is managed through TanStack React Query with:
- 30-second stale time
- 1 retry on failure
- No refetch on window focus
- Query key factories for consistent cache management

**Client state** uses two React Contexts:
- **AuthContext** — user, tenant, membership, isAuthenticated, isLoading + login/logout methods
- **TenantContext** — current tenant slug (synced to localStorage)

### 9.5 Pages

#### LoginPage

- Form with tenant slug, email, password fields
- Validates all fields before submission
- On success: stores tokens in localStorage, redirects to dashboard
- On error: displays toast with error message
- Loading state during submission

#### DashboardPage

- Grid layout with draggable/resizable widgets (currently static)
- **Widgets:**
  - Total Tasks count
  - Overdue tasks count
  - In Progress tasks count
  - Recent Activity list (last 5 tasks with status dots, dates)
- **Loading state:** Full-page spinner
- **Error state:** ErrorDisplay with retry button
- **Empty state:** "No recent activity" in activity widget

#### WorkspacePage

- Folder sidebar (tree view) + project grid
- Shows workspace name, description, icon
- **Loading state:** Full-page spinner
- **Error state:** ErrorDisplay (workspace not found or load failure)
- **Empty states:** "No folders yet" in sidebar, "No projects yet" in main area
- Links to project detail pages

#### ProjectPage

- Tabbed interface: Tasks (table) | Board (kanban) | Timeline (stub) | Files (stub)
- Shows project name, due date, status badge
- **Loading state:** Full-page spinner
- **Error state:** ErrorDisplay
- **Empty states:** "No tasks yet" / "No tasks to display" / "Timeline view coming soon" / "Upload and manage project files here"

#### TaskDetailPage

- Full task view with edit toggle
- **View mode:** Title, description, status dropdown (inline update), priority, assignee, dates, time tracking, comments
- **Edit mode:** TaskForm with all editable fields
- Status change is immediate via mutation
- **Loading state:** Full-page spinner
- **Error state:** ErrorDisplay with retry
- **Edge case:** "Unassigned" displayed when no assignee

---

## 10. Frontend Components

### 10.1 Common Components

#### LoadingSpinner

- Props: `size` (sm/md/lg), `className`, `label`
- Animated spinner with optional text label
- Uses Tailwind `animate-spin` with primary colors

#### ErrorDisplay

- Props: `title`, `message`, `onRetry`, `className`
- Red-themed card with warning icon
- Optional "Try again" button
- Defaults: "Something went wrong" / "An unexpected error occurred"

#### EmptyState

- Props: `icon`, `title`, `description`, `action`, `className`
- Dashed-border placeholder with icon (defaults to archive box)
- Used everywhere for "no data" states

### 10.2 FolderTree

- Recursive tree component with expand/collapse
- Renders folders nested by `parentFolderId`
- Chevron icon rotates on expand
- Shows folder icon (amber folder SVG)
- Maximum depth constant: 10 (from shared constants)
- Empty state: "No folders"

### 10.3 KanbanBoard

- Uses `@dnd-kit/core` for drag-and-drop
- **6 columns:** Backlog → To Do → In Progress → In Review → Done → Cancelled
- Each column color-coded (slate → slate → blue → amber → green → red)
- **Drag start:** Creates drag overlay with task card
- **Drag end:** Calls `updateTask` mutation to change status
- Columns are `Droppable` containers, cards are `Draggable`
- Loading state from parent, empty column shows "Drop tasks here"
- Visual feedback on drag over (ring + background highlight)

### 10.4 KanbanColumn

- Droppable target from `@dnd-kit`
- Sortable context for vertical reordering
- Color-coded top border and background per status
- Shows task count badge in header
- Transition effects on drag-over

### 10.5 TaskCard

- Draggable card from `@dnd-kit`
- Priority-colored left border (none → low → medium → high → urgent)
- Links to task detail page (stopPropagation to not interfere with drag)
- Shows: assignee avatar initial, due date (red if overdue), estimated hours
- Transform during drag, shadow on hover

### 10.6 TaskTable

- Powered by `@tanstack/react-table` with full feature set:
  - **Column sorting** (clickable headers with ascending/descending indicators)
  - **Column filtering**
  - **Global text search** (filters across all columns)
  - **Row selection** (checkboxes + selected count)
- **Columns:** Checkbox → Title (linked) → Status (badge) → Priority → Assignee → Due date → Est. hours
- Status badges color-coded per status
- Due dates turn red when overdue
- Virtualized rows for performance (via `@tanstack/react-virtual`)
- **Loading state:** Large spinner
- **Empty state:** "No tasks" with description
- Footer shows "Showing X of Y tasks"

### 10.7 TaskForm

- Used for both create and edit modes
- Fields: title (required), description (textarea), status, priority, start date, due date, assignee ID, estimated hours
- Input classes support disabled styling
- Cancel button only in edit mode
- Submit button changes label: "Create task" vs "Update task"
- Disabled states while submitting

### 10.8 CommentSection

- **Two-level threading:** Top-level comments + replies
- **New comment form:** Textarea + "Post comment" button
- **Reply flow:** "Reply" button opens inline reply form, "Cancel" dismisses
- Comments show: author ID, timestamp, edited indicator
- **Loading state:** Small spinner
- **Error state:** ErrorDisplay with retry
- **Empty state:** "No comments yet. Be the first to comment."
- Uses TanStack Query for data fetching and mutations

### 10.9 DashboardLayout

- **Sidebar:** Collapsible (64px when closed, 256px when open)
  - Logo area with hamburger toggle
  - Navigation links (Dashboard)
  - Workspace section (dynamic list from API)
- **Top header bar:**
  - User avatar initial circle
  - Email display
  - Dropdown menu with sign out
- Active states with primary color highlight
- Responsive, full-height flex layout

### 10.10 AuthLayout

- Minimal layout for login page
- Centers content vertically and horizontally
- Footer with copyright year
- Redirects authenticated users to `/dashboard`
- Loading spinner during auth check

---

## 11. Security Model

### 11.1 Multi-Layer Security

```
Layer 1: Network Isolation
  ├── Frontend network (public) — only Nginx
  └── Backend network (internal) — API + Redis + MinIO + Meilisearch
      └── Data network (internal) — PostgreSQL + other data stores

Layer 2: HTTP Security
  ├── Helmet headers (XSS, content-type sniffing, etc.)
  ├── CORS (whitelist origins)
  └── Rate limiting (100 req/min per IP)

Layer 3: Authentication
  ├── JWT (15 min TTL, signed with secret)
  ├── Refresh tokens (UUID, 30 day TTL, stored in DB)
  └── Optional Keycloak integration for SSO/SAML/SCIM

Layer 4: Authorization
  ├── AuthGuard (JWT validation)
  ├── RolesGuard (permission check against @Permissions decorator)
  └── Row-Level Security (tenant isolation at database level)

Layer 5: Input Validation
  ├── Zod schemas on every endpoint
  └── TypeScript strict mode

Layer 6: Audit Trail
  ├── activity_logs table records all entity changes
  └── Change tracking with before/after values
```

### 11.2 Password Security

- Bcrypt hashing with 12 salt rounds
- Minimum password length: 8 characters (Zod schema)
- Maximum password length: 256 characters

### 11.3 Tenant Isolation

RLS ensures that even if a service method forgets to filter by `tenant_id`, the database will return zero rows for the wrong tenant.

---

## 12. Scalability & Performance

### 12.1 Database

- **Indexes:** 30+ indexes covering all foreign keys, status, dates, and search
- **Full-text search:** GIN index on `to_tsvector` for tasks
- **Connection pooling:** Configurable pool (default max: 25 connections)
- **JSONB columns:** `custom_fields` on tasks, `settings` on tenants, `metadata` on folders — flexible schema without joins

### 12.2 Caching

- Redis for cache, queues, and session store
- Cache key prefixes defined: `tenant:`, `perm:`, `workload:`
- BullMQ queues for async processing: automation, notifications, webhooks, email, LLM actions, file processing

### 12.3 Asynchronous Processing

BullMQ provides reliable job queues for:
- Automation rule evaluation when trigger events fire
- Webhook delivery with retry/backoff
- Email dispatch
- LLM-powered actions
- File processing (thumbnails, OCR)

### 12.4 Ready for Real-Time

- Socket.IO is installed and configured on both backend and frontend
- WebSocket support for real-time notifications and collaborative features

---

## 13. Development Workflow

### 13.1 Quick Start

```bash
# Install dependencies
npm install

# Start infrastructure (PostgreSQL, Redis, MinIO, Meilisearch)
npm run docker:up

# Run database migrations
npm run migration:run -w packages/backend

# Start backend (hot reload)
npm run dev:backend

# Start frontend (Vite dev server)
npm run dev:frontend
```

### 13.2 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build all packages |
| `npm run test` | Run all tests |
| `npm run test:cov` | Run tests with coverage |
| `npm run lint` | Lint all packages |
| `npm run format` | Format code with Prettier |
| `npm run typecheck` | TypeScript check across monorepo |
| `npm run docker:up` | Start Docker Compose (production) |
| `npm run docker:dev` | Start Docker Compose (dev with hot reload) |
| `npm run dev:backend` | Start backend with nest --watch |
| `npm run dev:frontend` | Start frontend with Vite |
| `npm run migration:run` | Run Knex migrations |
| `npm run seed` | Seed database |

### 13.3 Development with Docker

The `docker-compose.dev.yml` provides:
- Hot-reload for backend (source mounted as read-only, `nest start --watch`)
- Hot-reload for frontend (Vite dev server with HMR)
- Debug port (9229) for Node.js `--inspect`
- Environment-specific config (development mode, pretty logging)

### 13.4 Project Configuration Files

| File | Purpose |
|------|---------|
| `tsconfig.base.json` | Shared TypeScript config — ES2022, strict, composite projects |
| `.prettierrc` | Code formatting rules |
| `.dockerignore` | Excludes node_modules from Docker build context |
| `postcss.config.js` | PostCSS with Tailwind and autoprefixer |
| `tailwind.config.js` | Custom primary color palette (indigo tones) |
| `vite.config.ts` | Vite config with React plugin, path alias, API proxy |

---

## Appendices

### A. Hierarchy of Organizational Entities

```
Tenant (organization)
 └── Workspace (e.g., "Marketing", "Engineering")
      └── Folder* (recursive, max depth 10)
           └── Project
                └── Task (work item)
                     ├── Subtask (via parent_task_id)
                     ├── Task Dependencies (FS, SS, FF, SF)
                     ├── Comments (threaded)
                     ├── Time Entries (billable)
                     ├── Files (versioned)
                     └── Approval Requests (multi-stage)
```

\* Folders form a self-referential tree: `parent_folder_id` references `folders.id`. A task can also link to multiple folders via `task_folder_links` (cross-tagging).

### B. Task Lifecycle

```
Backlog → To Do → In Progress → In Review → Done
                   ↓              ↓
              (feedback)    (changes requested)
                   ↓              ↓
                In Review     In Progress
                   
Any status → Cancelled (terminal)
Done → (terminal)
```

### C. Approval Chain Flow

```
Approval Chain Template
  ├── Step 1: Manager (required_count: 1)
  ├── Step 2: Director (required_count: 1)
  └── Step 3: VP (required_count: 2)

Flow:
Task submitted for approval
  → Step 1 pending
    → Manager votes "approved"
  → Step 2 pending
    → Director votes "approved"
  → Step 3 pending
    → VP1 votes "approved" (1/2)
    → VP2 votes "approved" (2/2)
  → Chain complete → status = "approved"

Any rejection → status = "rejected" (immediate)
Any "changes_requested" → status = "changes_requested"
```

### D. Automation Rule Evaluation

```
Event occurs (e.g., task:created)
  → Look up all active automation_rules with matching trigger_event
  → For each rule:
    1. Evaluate conditions against event data
    2. If conditions match → execute actions
    3. Actions are queued via BullMQ for async execution
```

### E. File Versioning Strategy

```
File (logical record)
  └── File Version 1 (original upload)
  └── File Version 2 (updated)
  └── File Version 3 (updated)
  
Each version:
  - Stored in MinIO/S3 at storage_path
  - Has checksum for integrity
  - Can have annotations (proofing)
  - File.current_version_id points to latest

File types:
  - Images (PNG, JPEG, WebP, GIF)
  - Videos (MP4, WebM)
  - Documents
  - Other (up to 100MB)
```
