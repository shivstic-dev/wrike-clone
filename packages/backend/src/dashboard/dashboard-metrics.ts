import type { DashboardOverview } from '@wrike-clone/shared';

export interface DashboardTaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  departmentId: string;
  departmentName: string;
  createdAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
  handoffStatus: string;
  handoffReadyAt: Date | null;
  updatedAt: Date;
  projectId: string;
  projectName: string | null;
  handoffOwner: { id: string; displayName: string; email: string } | null;
  assignees: Array<{ userId: string; name: string }>;
}

type DashboardMetrics = Omit<
  DashboardOverview,
  'generatedAt' | 'scope' | 'windowDays' | 'departments'
>;
type AttentionItem = DashboardMetrics['attention'][number];
type CapacityItem = DashboardMetrics['capacity'][number];

const DAY_MS = 24 * 60 * 60 * 1_000;
const COMPLETED_STATUS = 'completed';
const ATTENTION_REASON_ORDER: Record<AttentionItem['reason'], number> = {
  overdue: 0,
  blocked: 1,
  unassigned: 2,
};

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function utcDayStart(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function isWithin(timestamp: number, startInclusive: number, endExclusive: number): boolean {
  return timestamp >= startInclusive && timestamp < endExclusive;
}

/**
 * Defines the exact membership rule for both dashboard totals and the
 * corresponding task-list endpoint. This deliberately does not apply the
 * reporting window: active work is actionable regardless of when it began.
 */
export function taskMatchesDashboardBucket(
  row: DashboardTaskRow,
  bucket: 'active' | 'completed' | 'overdue' | 'blocked' | 'unassigned' | 'ready_for_handoff',
  now: Date,
): boolean {
  const isCompleted = row.status === COMPLETED_STATUS;

  switch (bucket) {
    case 'active':
      return !isCompleted;
    case 'completed':
      return isCompleted;
    case 'overdue':
      return !isCompleted && row.dueDate !== null && row.dueDate.getTime() < now.getTime();
    case 'blocked':
      return !isCompleted && row.status === 'blocked';
    case 'unassigned':
      return !isCompleted && row.assignees.length === 0;
    case 'ready_for_handoff':
      return !isCompleted && row.handoffStatus === 'ready';
  }
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function countBySortedKey(
  rows: DashboardTaskRow[],
  getKey: (row: DashboardTaskRow) => string,
): Record<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = getKey(row);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()].sort(([left], [right]) => compareText(left, right)),
  );
}

function uniqueSortedAssignees(
  assignees: DashboardTaskRow['assignees'],
): DashboardTaskRow['assignees'] {
  const byUserId = new Map<string, { userId: string; name: string }>();

  for (const assignee of assignees) {
    const current = byUserId.get(assignee.userId);
    if (!current || compareText(assignee.name, current.name) < 0) {
      byUserId.set(assignee.userId, assignee);
    }
  }

  return [...byUserId.values()].sort(
    (left, right) =>
      compareText(left.name, right.name) || compareText(left.userId, right.userId),
  );
}

function compareCapacity(left: CapacityItem, right: CapacityItem): number {
  return (
    right.openTasks - left.openTasks ||
    right.overdue - left.overdue ||
    compareText(left.name, right.name) ||
    compareText(left.userId, right.userId)
  );
}

function compareNullableText(left: string | null, right: string | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return compareText(left, right);
}

function compareAttention(left: AttentionItem, right: AttentionItem): number {
  return (
    ATTENTION_REASON_ORDER[left.reason] - ATTENTION_REASON_ORDER[right.reason] ||
    compareNullableText(left.dueDate, right.dueDate) ||
    compareText(left.title, right.title) ||
    compareText(left.id, right.id) ||
    compareNullableText(left.assigneeName, right.assigneeName)
  );
}

export function buildDashboardMetrics(
  rows: DashboardTaskRow[],
  now: Date,
  windowDays: 30,
): DashboardMetrics {
  if (windowDays !== 30) {
    throw new RangeError('Dashboard metrics require a 30-day window');
  }

  const currentEndExclusive = utcDayStart(now) + DAY_MS;
  const currentStart = currentEndExclusive - windowDays * DAY_MS;
  const previousStart = currentStart - windowDays * DAY_MS;
  const daily: DashboardMetrics['daily'] = Array.from({ length: windowDays }, (_, index) => ({
    date: new Date(currentStart + index * DAY_MS).toISOString().slice(0, 10),
    created: 0,
    completed: 0,
  }));

  let currentCreated = 0;
  let previousCreated = 0;
  let currentCompleted = 0;
  let previousCompleted = 0;
  const capacityByUserId = new Map<string, CapacityItem>();
  const attentionByTaskId = new Map<string, AttentionItem>();

  for (const row of rows) {
    const createdTimestamp = row.createdAt.getTime();
    if (isWithin(createdTimestamp, currentStart, currentEndExclusive)) {
      currentCreated += 1;
      const bucket = daily[Math.floor((createdTimestamp - currentStart) / DAY_MS)];
      if (bucket) bucket.created += 1;
    } else if (isWithin(createdTimestamp, previousStart, currentStart)) {
      previousCreated += 1;
    }

    const completedTimestamp = row.completedAt?.getTime();
    if (
      completedTimestamp !== undefined &&
      isWithin(completedTimestamp, currentStart, currentEndExclusive)
    ) {
      currentCompleted += 1;
      const bucket = daily[Math.floor((completedTimestamp - currentStart) / DAY_MS)];
      if (bucket) bucket.completed += 1;
    } else if (
      completedTimestamp !== undefined &&
      isWithin(completedTimestamp, previousStart, currentStart)
    ) {
      previousCompleted += 1;
    }

    if (taskMatchesDashboardBucket(row, 'completed', now)) {
      continue;
    }

    const rowIsOverdue = taskMatchesDashboardBucket(row, 'overdue', now);
    const rowIsBlocked = taskMatchesDashboardBucket(row, 'blocked', now);
    const assignees = uniqueSortedAssignees(row.assignees);
    const rowIsUnassigned = taskMatchesDashboardBucket(row, 'unassigned', now);

    for (const assignee of assignees) {
      const current = capacityByUserId.get(assignee.userId);
      if (current) {
        current.openTasks += 1;
        if (rowIsOverdue) current.overdue += 1;
        if (compareText(assignee.name, current.name) < 0) current.name = assignee.name;
      } else {
        capacityByUserId.set(assignee.userId, {
          userId: assignee.userId,
          name: assignee.name,
          openTasks: 1,
          overdue: rowIsOverdue ? 1 : 0,
        });
      }
    }

    const reason: AttentionItem['reason'] | null = rowIsOverdue
      ? 'overdue'
      : rowIsBlocked
        ? 'blocked'
        : rowIsUnassigned
          ? 'unassigned'
          : null;

    if (reason) {
      const candidate: AttentionItem = {
        id: row.id,
        title: row.title,
        reason,
        dueDate: row.dueDate?.toISOString() ?? null,
        assigneeName: assignees[0]?.name ?? null,
      };
      const current = attentionByTaskId.get(row.id);
      if (!current || compareAttention(candidate, current) < 0) {
        attentionByTaskId.set(row.id, candidate);
      }
    }
  }

  return {
    totals: {
      active: rows.filter((row) => taskMatchesDashboardBucket(row, 'active', now)).length,
      completed: rows.filter((row) => taskMatchesDashboardBucket(row, 'completed', now)).length,
      overdue: rows.filter((row) => taskMatchesDashboardBucket(row, 'overdue', now)).length,
      blocked: rows.filter((row) => taskMatchesDashboardBucket(row, 'blocked', now)).length,
      unassigned: rows.filter((row) => taskMatchesDashboardBucket(row, 'unassigned', now)).length,
      readyForHandoff: rows.filter((row) =>
        taskMatchesDashboardBucket(row, 'ready_for_handoff', now),
      ).length,
    },
    comparison: {
      completedPercentChange: percentChange(currentCompleted, previousCompleted),
      createdPercentChange: percentChange(currentCreated, previousCreated),
    },
    daily,
    byStatus: countBySortedKey(rows, (row) => row.status),
    byPriority: countBySortedKey(rows, (row) => row.priority),
    capacity: [...capacityByUserId.values()].sort(compareCapacity),
    attention: [...attentionByTaskId.values()].sort(compareAttention),
  };
}
