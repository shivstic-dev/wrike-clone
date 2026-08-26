# Production Release Blockers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Railway startup, Supabase migrations, authentication, membership removal, and readiness checks safe for a 20-person production rollout.

**Architecture:** Runtime traffic keeps using `DATABASE_URL`; Knex migrations use `MIGRATE_DATABASE_URL` in production. Authentication validates user, membership, and session state at login and refresh, while membership removal revokes matching sessions transactionally.

**Tech Stack:** NestJS 11, Knex 3, PostgreSQL/Supabase, Jest, Railway shell startup

## Global Constraints

- Preserve the canonical `task_assignees` table and the existing migration history through 022.
- Use `DATABASE_URL` for application runtime and `MIGRATE_DATABASE_URL` for production migrations.
- Never log database URLs, JWT secrets, SMTP credentials, or refresh tokens.
- Keep local `DB_*` development fallback behavior.
- Do not modify unrelated untracked `.agents/` or `.mcp.json` files.

---

### Task 1: Isolate the migration connection URL

**Files:**
- Modify: `packages/backend/src/database/knexfile.ts`
- Create: `packages/backend/test/unit/migration-connection-config.spec.ts`
- Modify: `scripts/railway-start.sh`

**Interfaces:**
- Produces: `buildMigrationConnection(env: NodeJS.ProcessEnv): Knex.Config['connection']`
- Produces: production startup contract requiring both `DATABASE_URL` and `MIGRATE_DATABASE_URL`

- [ ] **Step 1: Write the failing connection-selection tests**

```ts
import { buildMigrationConnection } from '../../src/database/knexfile';

describe('migration connection selection', () => {
  it('prefers the direct migration URL over the pooled runtime URL', () => {
    expect(buildMigrationConnection({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://pooler/runtime',
      MIGRATE_DATABASE_URL: 'postgresql://direct/migrations',
      DB_SSL: 'true',
    })).toMatchObject({ connectionString: 'postgresql://direct/migrations' });
  });

  it('throws in production when the direct migration URL is absent', () => {
    expect(() => buildMigrationConnection({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://pooler/runtime',
      DB_SSL: 'true',
    })).toThrow('MIGRATE_DATABASE_URL is required for production migrations');
  });

  it('keeps DATABASE_URL as the local migration fallback', () => {
    expect(buildMigrationConnection({ DATABASE_URL: 'postgresql://local/dev' }))
      .toMatchObject({ connectionString: 'postgresql://local/dev' });
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/migration-connection-config.spec.ts`

Expected: FAIL because `buildMigrationConnection` is not exported and production still prefers `DATABASE_URL`.

- [ ] **Step 3: Implement the explicit migration selector**

```ts
export function buildMigrationConnection(
  env: NodeJS.ProcessEnv = process.env,
): Knex.Config['connection'] {
  const migrationUrl = env['MIGRATE_DATABASE_URL'];
  if (env['NODE_ENV'] === 'production' && !migrationUrl) {
    throw new Error('MIGRATE_DATABASE_URL is required for production migrations');
  }
  const databaseUrl = migrationUrl || env['DATABASE_URL'];
  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
    };
  }
  return {
    host: env['DB_HOST'] || 'localhost',
    port: Number.parseInt(env['DB_PORT'] || '5432', 10),
    database: env['DB_NAME'] || 'wrike_clone',
    user: env['DB_USER'] || 'wrike',
    password: env['DB_PASSWORD'] || 'wrike_dev',
    ssl: env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  };
}
```

Set `config.connection` to `buildMigrationConnection()`.

- [ ] **Step 4: Harden Railway startup**

Replace the current single-variable check with:

```bash
for required in DATABASE_URL MIGRATE_DATABASE_URL; do
  if [ -z "${!required:-}" ]; then
    echo "[ERROR] $required is required"
    exit 1
  fi
done
```

Keep migration execution before `npm run start:prod` and do not echo either URL.

- [ ] **Step 5: Run focused verification**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/migration-connection-config.spec.ts test/unit/migration-runtime-resolvability.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/database/knexfile.ts packages/backend/test/unit/migration-connection-config.spec.ts scripts/railway-start.sh
git commit -m "fix: isolate production migration connection"
```

### Task 2: Validate production startup inputs

**Files:**
- Modify: `packages/backend/src/config/app.config.ts`
- Modify: `packages/backend/src/config/app.config.spec.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: production URL contract from Task 1
- Produces: `validateProductionConfig()` checks for direct migrations, HTTPS public URL, secure CORS, JWT strength, SSL, and registration policy

- [ ] **Step 1: Add failing production-validation cases**

```ts
it('requires a direct migration URL and HTTPS public URL in production', () => {
  process.env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://pooler/runtime',
    JWT_SECRET: 'j'.repeat(64),
    CORS_ORIGINS: 'https://app.example.com',
    DB_SSL: 'true',
    ALLOW_PUBLIC_REGISTRATION: 'false',
  };
  expect(validateProductionConfig).toThrow('MIGRATE_DATABASE_URL is required');

  process.env.MIGRATE_DATABASE_URL = 'postgresql://direct/migrations';
  expect(validateProductionConfig).toThrow('APP_PUBLIC_URL is required');
});

it('accepts the complete production baseline', () => {
  process.env = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://pooler/runtime',
    MIGRATE_DATABASE_URL: 'postgresql://direct/migrations',
    JWT_SECRET: 'j'.repeat(64),
    CORS_ORIGINS: 'https://app.example.com',
    APP_PUBLIC_URL: 'https://app.example.com',
    DB_SSL: 'true',
    ALLOW_PUBLIC_REGISTRATION: 'false',
  };
  expect(validateProductionConfig).not.toThrow();
});
```

Update every existing production environment fixture in `app.config.spec.ts` to include `MIGRATE_DATABASE_URL`, `APP_PUBLIC_URL`, and `ALLOW_PUBLIC_REGISTRATION='false'`; otherwise unrelated assertions would fail for the new baseline instead of the behavior they test.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand src/config/app.config.spec.ts`

Expected: FAIL because the additional variables are not required yet.

- [ ] **Step 3: Add exact validation rules**

Add to `validateProductionConfig()`:

```ts
if (!process.env['MIGRATE_DATABASE_URL']) problems.push('MIGRATE_DATABASE_URL is required');
if (!process.env['APP_PUBLIC_URL']) problems.push('APP_PUBLIC_URL is required');
if (process.env['ALLOW_PUBLIC_REGISTRATION'] !== 'false') {
  problems.push('ALLOW_PUBLIC_REGISTRATION must be false');
}
```

Retain the existing HTTPS check for `APP_PUBLIC_URL` and existing optional-integration behavior.

- [ ] **Step 4: Document the exact variables**

Add `DATABASE_URL`, `MIGRATE_DATABASE_URL`, `APP_PUBLIC_URL`, `JWT_SECRET`, `DB_SSL=true`, and `ALLOW_PUBLIC_REGISTRATION=false` to `.env.example`. Use invalid placeholder hosts and never real credentials.

- [ ] **Step 5: Run focused tests**

Run: `npm test -w @wrike-clone/backend -- --runInBand src/config/app.config.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/config/app.config.ts packages/backend/src/config/app.config.spec.ts .env.example
git commit -m "fix: validate production deployment settings"
```

### Task 3: Reject inactive users during login and refresh

**Files:**
- Modify: `packages/backend/src/auth/auth.service.ts`
- Modify: `packages/backend/test/unit/auth.service.spec.ts`
- Modify: `packages/backend/test/unit/auth.service.g7.spec.ts`

**Interfaces:**
- Produces: login and refresh require `users.is_active = true` and `users.deleted_at IS NULL`
- Produces: refresh verifies session, membership, and user tenant identity before rotation

- [ ] **Step 1: Add failing login tests**

```ts
it.each([
  { is_active: false, deleted_at: null },
  { is_active: true, deleted_at: new Date() },
])('rejects inactive or deleted users: %j', async (state) => {
  qb.first
    .mockResolvedValueOnce({ id: 'tenant-1', slug: 'acme', settings: '{}' })
    .mockResolvedValueOnce(null);

  await expect(service.login({
    email: 'disabled@acme.com',
    password: 'secret',
    tenantSlug: 'acme',
  })).rejects.toThrow('Invalid tenant or credentials');

  expect(qb.where).toHaveBeenCalledWith(expect.objectContaining({
    email: 'disabled@acme.com',
    is_active: true,
    deleted_at: null,
  }));
});
```

- [ ] **Step 2: Add failing refresh tests**

In the G7 refresh-token suite, add cases where the user lookup returns `null`, `is_active: false`, or non-null `deleted_at`; each must reject before `sessions.update()`.

- [ ] **Step 3: Run auth tests and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/auth.service.spec.ts test/unit/auth.service.g7.spec.ts`

Expected: FAIL on inactive/deleted user assertions.

- [ ] **Step 4: Apply active-user filters and consistency checks**

Change login lookup to:

```ts
const user = await this.db('users').where({
  email: input.email,
  is_active: true,
  deleted_at: null,
}).first();
```

Change refresh lookup to:

```ts
const user = await this.db('users').where({
  id: session.user_id,
  is_active: true,
  deleted_at: null,
}).first();
if (!user || membership.user_id !== user.id || membership.tenant_id !== session.tenant_id) {
  throw new UnauthorizedException('Account no longer active');
}
```

- [ ] **Step 5: Run auth tests**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/auth.service.spec.ts test/unit/auth.service.g7.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/auth/auth.service.ts packages/backend/test/unit/auth.service.spec.ts packages/backend/test/unit/auth.service.g7.spec.ts
git commit -m "fix: reject inactive authentication sessions"
```

### Task 4: Revoke sessions when membership access is removed

**Files:**
- Modify: `packages/backend/src/user/user.service.ts`
- Create: `packages/backend/test/unit/user.service.spec.ts`

**Interfaces:**
- Produces: `UserService.remove(userId: string): Promise<void>` atomically disables the membership and expires its sessions

- [ ] **Step 1: Write the failing transaction test**

```ts
it('disables membership and expires matching sessions atomically', async () => {
  await tenantContext.run({ tenantId: 'tenant-1', userId: 'admin-1' } as never, () =>
    service.remove('user-1'),
  );

  expect(trx).toHaveBeenCalledWith('tenant_memberships');
  expect(membershipQuery.update).toHaveBeenCalledWith({ is_active: false });
  expect(sessionQuery.update).toHaveBeenCalledWith({ expires_at: expect.any(Date) });
  expect(sessionQuery.where).toHaveBeenCalledWith({
    membership_id: 'membership-1',
    tenant_id: 'tenant-1',
  });
});
```

Build the test double with separate callable query builders for `tenant_memberships` and `sessions` so assertions cannot pass against the wrong table.

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/user.service.spec.ts`

Expected: FAIL because removal performs one non-transactional update and does not touch sessions.

- [ ] **Step 3: Implement transactional revocation**

```ts
await this.db.transaction(async (trx) => {
  await trx('tenant_memberships')
    .where({ id: membership.id, tenant_id: ctx.tenantId })
    .update({ is_active: false });
  await trx('sessions')
    .where({ membership_id: membership.id, tenant_id: ctx.tenantId })
    .update({ expires_at: new Date() });
});
```

- [ ] **Step 4: Run the test**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/user.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/user/user.service.ts packages/backend/test/unit/user.service.spec.ts
git commit -m "fix: revoke sessions on membership removal"
```

### Task 5: Verify readiness and deployment documentation

**Files:**
- Modify: `packages/backend/test/unit/health.controller.spec.ts`
- Modify: `README.md`
- Create: `docs/deployment/railway-supabase-runbook.md`

**Interfaces:**
- Consumes: startup contract from Tasks 1–2
- Produces: operator runbook with preflight, deploy, smoke, and rollback commands

- [ ] **Step 1: Add the readiness contract assertion**

```ts
it('keeps liveness available while readiness fails closed', async () => {
  db.raw.mockRejectedValue(new Error('database unavailable'));
  await request(app.getHttpServer()).get('/health').expect(200)
    .expect(({ body }) => expect(body.status).toBe('degraded'));
  await request(app.getHttpServer()).get('/health/ready').expect(503)
    .expect(({ body }) => expect(body.status).toBe('not ready'));
});
```

- [ ] **Step 2: Run the readiness test**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/health.controller.spec.ts`

Expected: PASS with `{ status: 'not ready' }` at the top level of the 503 response body.

- [ ] **Step 3: Write the runbook with executable checks**

The runbook must include these exact checks:

```bash
npm ci --omit=dev
npm run build
curl --fail https://BACKEND_HOST/api/v1/health
curl --fail https://BACKEND_HOST/api/v1/health/ready
```

Also document Railway variable names, Supabase pooled/direct URL placement, migration-history inspection, a login smoke test, and rollback by redeploying the last known-good Railway deployment without rolling back additive migrations.

- [ ] **Step 4: Run full release-blocker verification**

Run: `npm run typecheck`

Run: `npm test -w @wrike-clone/backend -- --runInBand`

Run: `npm run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/test/unit/health.controller.spec.ts README.md docs/deployment/railway-supabase-runbook.md
git commit -m "docs: add Railway Supabase release runbook"
```
