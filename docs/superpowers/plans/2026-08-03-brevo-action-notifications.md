# Brevo Action Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver assignment, relevant-comment, approval, and deadline emails through Brevo without making user-facing writes depend on SMTP availability.

**Architecture:** A dedicated PostgreSQL `email_deliveries` transactional outbox is written atomically with each in-app notification. A scheduled, multi-instance-safe processor claims pending rows and uses the existing Nodemailer service configured for Brevo SMTP.

**Tech Stack:** NestJS 11, Knex 3, PostgreSQL/Supabase RLS, Nodemailer 9, Jest, `@nestjs/schedule`

## Global Constraints

- This plan runs after `2026-08-03-production-release-blockers.md`.
- Keep in-app notifications authoritative when SMTP is disabled or unavailable.
- Send only action-required email; exclude the actor, inactive users, deleted users, and inactive memberships.
- Resolve recipients through `task_assignees` plus a deduplicated `tasks.assignee_id` compatibility path.
- Use Brevo SMTP via environment variables; do not add a provider SDK or commit credentials.
- Preserve `notification_log` for scheduler-event deduplication.
- All outbox rows are tenant-scoped and protected by RLS.

---

### Task 1: Add the transactional email outbox schema

**Files:**
- Create: `packages/backend/src/migrations/023_email_delivery_outbox.ts`
- Create: `packages/backend/test/unit/email-delivery-outbox-migration.spec.ts`

**Interfaces:**
- Produces: table `email_deliveries`
- Produces: unique key `(tenant_id, dedupe_key)` and claim index `(status, next_attempt_at, created_at)`

- [ ] **Step 1: Write the failing migration contract test**

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('023 email delivery outbox migration', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/migrations/023_email_delivery_outbox.ts'),
    'utf8',
  );

  it('creates a tenant-scoped, deduplicated retry outbox', () => {
    expect(source).toContain("createTable('email_deliveries'");
    expect(source).toContain("table.unique(['tenant_id', 'dedupe_key']");
    expect(source).toContain("table.index(['status', 'next_attempt_at', 'created_at']");
    expect(source).toContain('ENABLE ROW LEVEL SECURITY');
    expect(source).toContain('FORCE ROW LEVEL SECURITY');
    expect(source).toContain('current_tenant_id()');
    expect(source).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON email_deliveries TO openwork_app');
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-delivery-outbox-migration.spec.ts`

Expected: FAIL because migration 023 does not exist.

- [ ] **Step 3: Create the additive migration**

Create columns with these exact names and semantics:

```ts
await knex.schema.createTable('email_deliveries', (table) => {
  table.uuid('id').primary();
  table.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
  table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
  table.string('event_type', 64).notNullable();
  table.string('entity_type', 64).notNullable();
  table.uuid('entity_id').notNullable();
  table.string('dedupe_key', 255).notNullable();
  table.jsonb('payload').notNullable().defaultTo('{}');
  table.string('status', 16).notNullable().defaultTo('pending');
  table.integer('attempt_count').notNullable().defaultTo(0);
  table.timestamp('next_attempt_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  table.timestamp('claimed_at', { useTz: true });
  table.string('last_error_code', 64);
  table.timestamp('sent_at', { useTz: true });
  table.timestamps(true, true);
  table.unique(['tenant_id', 'dedupe_key'], { indexName: 'uq_email_deliveries_tenant_dedupe' });
  table.index(['status', 'next_attempt_at', 'created_at'], 'idx_email_deliveries_claim');
});
```

Add a status check for `pending`, `processing`, `sent`, and `failed`; enable and force RLS; create the `tenant_isolation` policy; grant CRUD to `openwork_app`. `down()` drops only `email_deliveries`.

- [ ] **Step 4: Run the migration contract test**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-delivery-outbox-migration.spec.ts test/unit/migration-history-alignment.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/migrations/023_email_delivery_outbox.ts packages/backend/test/unit/email-delivery-outbox-migration.spec.ts
git commit -m "feat: add transactional email outbox"
```

### Task 2: Add outbox enqueue and atomic claim services

**Files:**
- Create: `packages/backend/src/email/email-delivery.types.ts`
- Create: `packages/backend/src/email/email-outbox.service.ts`
- Create: `packages/backend/test/unit/email-outbox.service.spec.ts`
- Modify: `packages/backend/src/email/email.module.ts`

**Interfaces:**
- Produces: `EmailEventType = 'task_assigned' | 'task_commented' | 'approval_requested' | 'deadline_alert'`
- Produces: discriminated `EmailPayload` union and camelCase `EmailDeliveryRecord`
- Produces: `EmailOutboxService.enqueue(executor, input): Promise<boolean>`
- Produces: `EmailOutboxService.claimBatch(limit, now): Promise<EmailDeliveryRecord[]>`
- Produces: `markSent(id)`, `markRetry(id, code, nextAttemptAt)`, and `markFailed(id, code)`

- [ ] **Step 1: Define the outbox types in the failing test**

Define these exact types in `email-delivery.types.ts` before implementing the service:

```ts
export type EmailEventType =
  | 'task_assigned'
  | 'task_commented'
  | 'approval_requested'
  | 'deadline_alert';

export interface EmailPayloadByEvent {
  task_assigned: { taskTitle: string; taskUrl: string; assignedBy: string };
  task_commented: { taskTitle: string; taskUrl: string; commentAuthor: string; commentContent: string };
  approval_requested: { taskTitle: string; approvalUrl: string; requestedBy: string };
  deadline_alert: { taskTitle: string; taskUrl: string; heading: string; detail: string };
}

type EmailEnvelopeBase = {
  tenantId: string;
  userId: string;
  entityType: string;
  entityId: string;
  dedupeKey: string;
};

export type EnqueueEmailInput = EmailEnvelopeBase & {
  [K in EmailEventType]: { eventType: K; payload: EmailPayloadByEvent[K] }
}[EmailEventType];

export type EmailDeliveryRecord = EnqueueEmailInput & {
  id: string;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  attemptCount: number;
  nextAttemptAt: Date;
  claimedAt: Date | null;
};
```

```ts
const input = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  eventType: 'task_assigned' as const,
  entityType: 'task',
  entityId: 'task-1',
  dedupeKey: 'task_assigned:task-1:user-1:revision-1',
  payload: { taskTitle: 'Prepare report', taskUrl: 'https://app.example.com/tasks/task-1' },
};

it('returns false when a duplicate outbox row already exists', async () => {
  returning.mockResolvedValue([]);
  await expect(service.enqueue(trx, input)).resolves.toBe(false);
  expect(onConflict).toHaveBeenCalledWith(['tenant_id', 'dedupe_key']);
  expect(ignore).toHaveBeenCalled();
});
```

Also test that `claimBatch()` runs in a root transaction, selects due `pending` rows with `forUpdate().skipLocked()`, reclaims stale `processing` rows older than 10 minutes, and updates claimed rows to `processing`.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-outbox.service.spec.ts`

Expected: FAIL because the service and types do not exist.

- [ ] **Step 3: Implement enqueue with snake-case persistence**

```ts
async enqueue(executor: Knex | Knex.Transaction, input: EnqueueEmailInput): Promise<boolean> {
  const rows = await executor('email_deliveries').insert({
    id: uuidv4(),
    tenant_id: input.tenantId,
    user_id: input.userId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    dedupe_key: input.dedupeKey,
    payload: JSON.stringify(input.payload),
  }).onConflict(['tenant_id', 'dedupe_key']).ignore().returning('id');
  return rows.length === 1;
}
```

Implement claims through `ROOT_DATABASE_PROVIDER`, always filtering explicit tenant-independent status/time columns. Set `claimed_at` and increment `attempt_count` in the claim transaction. Map claimed database rows to `EmailDeliveryRecord` explicitly: parse `payload`, convert `attempt_count` to `attemptCount`, `next_attempt_at` to `nextAttemptAt`, and `claimed_at` to `claimedAt`. Do not leak snake-case rows into the processor.

- [ ] **Step 4: Implement terminal updates**

`markSent()` sets `status='sent'`, `sent_at`, and clears `last_error_code`. `markRetry()` sets `status='pending'`, `next_attempt_at`, and the sanitized code. `markFailed()` sets `status='failed'` and the code. These methods update by row ID only because the row was obtained from a reviewed root claim.

- [ ] **Step 5: Export and test**

Add `EmailOutboxService` to `EmailModule.providers` and `exports`.

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-outbox.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/email/email-delivery.types.ts packages/backend/src/email/email-outbox.service.ts packages/backend/src/email/email.module.ts packages/backend/test/unit/email-outbox.service.spec.ts
git commit -m "feat: add email outbox service"
```

### Task 3: Process outbox deliveries through Brevo SMTP

**Files:**
- Modify: `packages/backend/src/email/email.service.ts`
- Create: `packages/backend/src/email/email-delivery.processor.ts`
- Create: `packages/backend/test/unit/email-delivery.processor.spec.ts`
- Modify: `packages/backend/src/email/email.module.ts`
- Modify: `packages/backend/src/config/app.config.ts`
- Modify: `packages/backend/src/config/app.config.spec.ts`
- Modify: `.env.example`
- Create: `docs/deployment/brevo-smtp.md`

**Interfaces:**
- Produces: `EmailService.sendDetailed(options): Promise<{ ok: true } | { ok: false; code: string; retryable: boolean }>`
- Produces: `EmailDeliveryProcessor.processPending(): Promise<void>` scheduled every minute

- [ ] **Step 1: Write failing processor tests**

Cover these exact outcomes:

```ts
it('marks a successful delivery sent', async () => {
  outbox.claimBatch.mockResolvedValue([delivery]);
  email.sendDetailed.mockResolvedValue({ ok: true });
  await processor.processPending();
  expect(outbox.markSent).toHaveBeenCalledWith(delivery.id);
});

it('retries transient SMTP errors with bounded exponential backoff', async () => {
  outbox.claimBatch.mockResolvedValue([{ ...delivery, attemptCount: 3 }]);
  email.sendDetailed.mockResolvedValue({ ok: false, code: 'smtp_421', retryable: true });
  await processor.processPending();
  expect(outbox.markRetry).toHaveBeenCalledWith(
    delivery.id,
    'smtp_421',
    expect.any(Date),
  );
});

it('fails permanently after five attempts', async () => {
  outbox.claimBatch.mockResolvedValue([{ ...delivery, attemptCount: 5 }]);
  email.sendDetailed.mockResolvedValue({ ok: false, code: 'smtp_421', retryable: true });
  await processor.processPending();
  expect(outbox.markFailed).toHaveBeenCalledWith(delivery.id, 'retry_exhausted');
});
```

Add a production configuration test with the complete release-blocker baseline. With `EMAIL_ENABLED='true'` and no SMTP values, expect `validateProductionConfig()` to throw a message listing `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM`. Set all five values and expect validation to pass. With `EMAIL_ENABLED='false'`, expect missing SMTP values to remain valid.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-delivery.processor.spec.ts src/config/app.config.spec.ts`

Expected: FAIL because the processor and detailed result do not exist.

- [ ] **Step 3: Add detailed SMTP result classification**

Keep existing `send()` as a compatibility wrapper. Add `sendDetailed()` that returns `disabled` when SMTP is incomplete, maps Nodemailer response codes `421`, `450`, `451`, and `452` to retryable, maps `550`, `551`, `552`, and `553` to permanent, and returns `smtp_unknown` as retryable for network exceptions. Log recipient domain only, not the full address or message content.

In `validateProductionConfig()`, when `EMAIL_ENABLED === 'true'`, append one problem for each missing name in `['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'EMAIL_FROM']`. Do not validate or print secret values. Keep SMTP optional when email is disabled.

- [ ] **Step 4: Implement the processor**

Use `@Cron(process.env['EMAIL_DELIVERY_CRON'] || '0 * * * * *', { waitForCompletion: true })`, claim at most 25 rows, render via the existing task/comment/approval templates, and compute backoff as `min(60, 2 ** attemptCount)` minutes. Validate payload fields before sending; invalid payloads fail with `invalid_payload`.

- [ ] **Step 5: Document Brevo configuration**

Set these placeholders in `.env.example`:

```dotenv
EMAIL_ENABLED=false
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_brevo_smtp_login
SMTP_PASS=your_brevo_smtp_key
SMTP_SECURE=false
EMAIL_FROM=notifications@example.com
EMAIL_DELIVERY_CRON=0 * * * * *
```

When `EMAIL_ENABLED` is not `true`, the processor leaves rows pending and performs no SMTP call.

In `docs/deployment/brevo-smtp.md`, document: create a Brevo account; add a sender; verify the six-digit code received at that sender address; create an SMTP key; copy the SMTP login and key into Railway; deploy first with `EMAIL_ENABLED=false`; verify health/readiness; enable email; assign one test task to an approved recipient; confirm both the in-app notification and outbox row become sent. Link to `https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email` and `https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-issues-with-Brevo-SMTP`.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-delivery.processor.spec.ts src/config/app.config.spec.ts`

Expected: PASS.

```bash
git add packages/backend/src/email/email.service.ts packages/backend/src/email/email-delivery.processor.ts packages/backend/src/email/email.module.ts packages/backend/test/unit/email-delivery.processor.spec.ts packages/backend/src/config/app.config.ts packages/backend/src/config/app.config.spec.ts .env.example docs/deployment/brevo-smtp.md
git commit -m "feat: deliver outbox email through Brevo SMTP"
```

### Task 4: Atomically fan out assignment and comment notifications

**Files:**
- Modify: `packages/shared/src/validation/index.ts`
- Modify: `packages/backend/src/notification/notification.service.ts`
- Modify: `packages/backend/src/task/task.service.ts`
- Modify: `packages/backend/test/unit/notification.service.spec.ts`
- Modify: `packages/backend/test/unit/task.service.spec.ts`
- Modify: `packages/frontend/src/components/Comments/CommentSection.tsx`
- Create: `packages/frontend/src/components/Comments/CommentSection.spec.tsx`
- Modify: `packages/frontend/src/pages/TaskDetailPage.tsx`

**Interfaces:**
- Produces: `CreateCommentInput.mentionedUserIds?: string[]`
- Produces: `NotificationService.createActionRequired(input: CreateNotificationInput, emailInput: Omit<EnqueueEmailInput, 'tenantId' | 'userId'>, executor?: Knex | Knex.Transaction): Promise<void>`
- Consumes: `EmailOutboxService.enqueue()` from Task 2

- [ ] **Step 1: Add failing atomic-fanout tests**

Test that `createActionRequired()` inserts `notifications` and calls `outbox.enqueue()` with the same transaction executor. Test duplicate recipient IDs, actor exclusion, inactive-member exclusion, and one outbox row per newly assigned user.

Use this exact API shape:

```ts
await service.createActionRequired({
  userId: 'user-2',
  type: 'task_assigned',
  title: 'Task assigned',
  body: 'Prepare report',
  data: { entityType: 'task', entityId: 'task-1' },
}, {
  eventType: 'task_assigned',
  entityType: 'task',
  entityId: 'task-1',
  dedupeKey: 'task_assigned:task-1:user-2:2026-08-03T00:00:00.000Z',
  payload: { taskTitle: 'Prepare report', taskUrl: 'https://app.example.com/tasks/task-1' },
}, trx);
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/notification.service.spec.ts test/unit/task.service.spec.ts`

Expected: FAIL because action-required atomic fanout does not exist.

- [ ] **Step 3: Extend comment validation**

Add `mentionedUserIds: z.array(uuidField).max(50).optional()` to `createCommentSchema` so clients can supply identity-safe mentions without parsing display names.

- [ ] **Step 4: Implement atomic recipient fanout**

Inject `EmailOutboxService` into `NotificationService`. `createActionRequired()` calls `create()` and `enqueue()` through the supplied executor. Inside it, obtain `ctx` with `requireTenantContext()` and pass `{ ...emailInput, tenantId: ctx.tenantId, userId: input.userId }` to `outbox.enqueue()` so callers cannot queue cross-tenant or mismatched-recipient rows. Refactor task assignment creation/update/add-assignee paths to calculate only newly assigned IDs, load eligible users through `users` plus active `tenant_memberships`, exclude `ctx.userId`, and write in-app/outbox rows inside the task transaction.

For comments, union `mentionedUserIds` with canonical task assignees, exclude the author, validate visibility through `findVisibleTask()`, and create the comment plus all notification/outbox rows in one transaction.

- [ ] **Step 5: Remove direct email coupling from user writes**

Task and comment methods must not inject or call `EmailService`. SMTP is called only by `EmailDeliveryProcessor`.

- [ ] **Step 6: Add identity-safe teammate mentions**

Extend `CommentSectionProps` with:

```ts
interface MentionableUser {
  userId: string;
  displayName: string;
  email: string;
}

interface CommentSectionProps {
  taskId: string;
  mentionableUsers?: MentionableUser[];
}
```

Render a labeled multi-select named “Mention teammates” for a new comment, store selected user IDs, and send `mentionedUserIds` with the comment POST. Clear selected mentions after success. In `TaskDetailPage`, pass the already-loaded active department members to `CommentSection`. Add a component test that selects two teammates and asserts the POST body contains their IDs rather than parsed display names or email strings.

- [ ] **Step 7: Run tests and commit**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/notification.service.spec.ts test/unit/task.service.spec.ts`

Run: `npm test -w @wrike-clone/frontend -- src/components/Comments/CommentSection.spec.tsx src/pages/TaskDetailPage.spec.tsx`

Expected: PASS.

```bash
git add packages/shared/src/validation/index.ts packages/backend/src/notification/notification.service.ts packages/backend/src/task/task.service.ts packages/backend/test/unit/notification.service.spec.ts packages/backend/test/unit/task.service.spec.ts packages/frontend/src/components/Comments/CommentSection.tsx packages/frontend/src/components/Comments/CommentSection.spec.tsx packages/frontend/src/pages/TaskDetailPage.tsx
git commit -m "feat: queue assignment and comment email notifications"
```

### Task 5: Queue deadline and approval notifications

**Files:**
- Modify: `packages/backend/src/notification/notification-scheduler.service.ts`
- Modify: `packages/backend/test/unit/notification-scheduler.service.spec.ts`
- Modify: `packages/backend/src/approval/approval.service.ts`
- Create: `packages/backend/test/unit/approval.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationService.createActionRequired()` and `EmailOutboxService`
- Produces: deadline scheduler creates in-app/outbox rows without direct SMTP
- Produces: approval request resolves the current step and writes valid `approval_votes.step_id`

- [ ] **Step 1: Write failing deadline tests**

Change the scheduler expectation from direct `email.sendTaskAlert()` to one transaction that claims `notification_log`, inserts an in-app notification, and queues `deadline_alert`. Verify a duplicate `notification_log` conflict produces neither notification nor outbox row.

- [ ] **Step 2: Write failing approval tests**

```ts
it('notifies the first direct approver when creating a request', async () => {
  await service.createRequest({ taskId: 'task-1', chainId: 'chain-1' });
  expect(notificationService.createActionRequired).toHaveBeenCalledWith(
    expect.objectContaining({ userId: 'approver-1', type: 'approval_requested' }),
    expect.objectContaining({ eventType: 'approval_requested', entityId: expect.any(String) }),
    expect.any(Function),
  );
});

it('writes the current approval step id on vote', async () => {
  await service.submitVote('request-1', { status: 'approved' });
  expect(voteInsert).toHaveBeenCalledWith(expect.objectContaining({
    tenant_id: 'tenant-1',
    step_id: 'step-1',
    approver_id: 'approver-1',
  }));
});
```

The service must reject voting by a user who is not the current step's direct approver and does not match its `approver_role`.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/notification-scheduler.service.spec.ts test/unit/approval.service.spec.ts`

Expected: FAIL on direct SMTP expectations and empty approval step ID.

- [ ] **Step 4: Refactor scheduler and approval service**

The deadline scheduler resolves all current assignees, not just `tasks.assignee_id`, and queues one deduplicated action notification per eligible assignee. The approval service loads the request's current ordered step, resolves direct `approver_id` or active memberships matching `approver_role`, excludes the requester, and queues each approval request atomically with request creation.

On vote, load the current step, authorize the actor, set `tenant_id` and the real `step_id`, and reject duplicate votes from the same approver/request/step.

- [ ] **Step 5: Run the notification suite**

Run: `npm test -w @wrike-clone/backend -- --runInBand test/unit/email-outbox.service.spec.ts test/unit/email-delivery.processor.spec.ts test/unit/notification.service.spec.ts test/unit/notification-scheduler.service.spec.ts test/unit/approval.service.spec.ts test/unit/task.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Run build and commit**

Run: `npm run typecheck`

Run: `npm run build`

Expected: both exit 0.

```bash
git add packages/backend/src/notification/notification-scheduler.service.ts packages/backend/test/unit/notification-scheduler.service.spec.ts packages/backend/src/approval/approval.service.ts packages/backend/test/unit/approval.service.spec.ts
git commit -m "feat: queue deadline and approval email notifications"
```
