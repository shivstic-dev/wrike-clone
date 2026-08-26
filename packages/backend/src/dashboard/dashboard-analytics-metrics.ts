import type { DashboardAnalyticsResponse } from '@wrike-clone/shared';
import type { DashboardTaskRow } from './dashboard-metrics';

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const HANDOFF_TARGET_MS = 48 * HOUR_MS;

export interface DashboardActivityRow {
  taskId: string;
  action: string;
  createdAt: Date;
  changes: Record<string, unknown>;
}

export function normalizeDashboardActivity(activity: {
  taskId: string;
  action: string;
  createdAt: Date;
  changes: Record<string, unknown> | string | null;
}): DashboardActivityRow {
  let changes: Record<string, unknown> = {};
  if (typeof activity.changes === 'string') {
    try {
      const parsed: unknown = JSON.parse(activity.changes);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        changes = parsed as Record<string, unknown>;
      }
    } catch {
      changes = {};
    }
  } else if (activity.changes && !Array.isArray(activity.changes)) {
    changes = activity.changes;
  }
  return { ...activity, changes };
}

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
  months: number;
}

interface AnalyticsMetricResult extends Pick<
  DashboardAnalyticsResponse,
  | 'kpis'
  | 'monthlyCompletion'
  | 'overdueOutcome'
  | 'workload'
  | 'blockedAgeing'
  | 'priorityDistribution'
  | 'projectHealth'
> {}

function monthKey(value: Date): string {
  return value.toISOString().slice(0, 7);
}

function monthKeys(from: Date, to: Date): string[] {
  const result: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1);
  while (cursor.getTime() <= end) {
    result.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function within(value: Date | null, period: AnalyticsPeriod): value is Date {
  return (
    value !== null &&
    value.getTime() >= period.from.getTime() &&
    value.getTime() <= period.to.getTime()
  );
}

function rounded(value: number): number {
  return Math.round(value * 10) / 10;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 100);
}

function statusChangedToBlocked(activity: DashboardActivityRow): boolean {
  if (activity.action !== 'task:status:changed') return false;
  const status = activity.changes.status;
  return (
    typeof status === 'object' &&
    status !== null &&
    'new' in status &&
    (status as { new?: unknown }).new === 'blocked'
  );
}

function blockedSince(row: DashboardTaskRow, activities: DashboardActivityRow[]): Date {
  return (
    activities
      .filter((activity) => activity.taskId === row.id && statusChangedToBlocked(activity))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]?.createdAt ??
    row.updatedAt
  );
}

function handoffCounts(
  taskIds: Set<string>,
  activities: DashboardActivityRow[],
  period: AnalyticsPeriod,
): { ready: number; successful: number } {
  let ready = 0;
  let successful = 0;
  const byTask = new Map<string, DashboardActivityRow[]>();
  for (const activity of activities) {
    if (!taskIds.has(activity.taskId)) continue;
    const current = byTask.get(activity.taskId) ?? [];
    current.push(activity);
    byTask.set(activity.taskId, current);
  }

  for (const taskActivities of byTask.values()) {
    taskActivities.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    for (let index = 0; index < taskActivities.length; index += 1) {
      const activity = taskActivities[index];
      if (!activity) continue;
      if (activity.action !== 'task:handoff:ready' || !within(activity.createdAt, period)) continue;
      ready += 1;
      const nextReadyIndex = taskActivities.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && candidate.action === 'task:handoff:ready',
      );
      const candidates = taskActivities.slice(
        index + 1,
        nextReadyIndex === -1 ? undefined : nextReadyIndex,
      );
      const confirmed = candidates.find(
        (candidate) => candidate.action === 'task:handoff:confirmed',
      );
      if (
        confirmed &&
        confirmed.createdAt.getTime() - activity.createdAt.getTime() <= HANDOFF_TARGET_MS
      ) {
        successful += 1;
      }
    }
  }
  return { ready, successful };
}

function taskIsOverdueOutcome(row: DashboardTaskRow, now: Date): boolean {
  if (!row.dueDate || row.dueDate.getTime() >= now.getTime()) return false;
  return !row.completedAt || row.completedAt.getTime() > row.dueDate.getTime();
}

function taskIsCurrentlyOverdue(row: DashboardTaskRow, now: Date): boolean {
  return row.status !== 'completed' && !!row.dueDate && row.dueDate.getTime() < now.getTime();
}

function buildHealth(
  rows: DashboardTaskRow[],
  activities: DashboardActivityRow[],
  period: AnalyticsPeriod,
  now: Date,
): DashboardAnalyticsResponse['projectHealth'][number] {
  const firstRow = rows[0];
  if (!firstRow) throw new RangeError('Project health requires at least one task');
  const completedWithDue = rows.filter((row) => within(row.completedAt, period) && row.dueDate);
  const onTime =
    rate(
      completedWithDue.filter((row) => row.completedAt!.getTime() <= row.dueDate!.getTime()).length,
      completedWithDue.length,
    ) ?? 100;
  const active = rows.filter((row) => row.status !== 'completed');
  const overdueControl =
    active.length === 0
      ? 100
      : Math.round(
          (1 - active.filter((row) => taskIsCurrentlyOverdue(row, now)).length / active.length) *
            100,
        );
  const blocked = active.filter((row) => row.status === 'blocked');
  const averageBlockedDays =
    blocked.length === 0
      ? 0
      : blocked.reduce(
          (sum, row) =>
            sum +
            Math.max(
              0,
              Math.floor((now.getTime() - blockedSince(row, activities).getTime()) / DAY_MS),
            ),
          0,
        ) / blocked.length;
  const blockedAgeing = Math.round(Math.max(0, 100 - (averageBlockedDays / 30) * 100));

  const workByAssignee = new Map<string, number>();
  for (const row of active) {
    for (const assignee of row.assignees) {
      workByAssignee.set(assignee.userId, (workByAssignee.get(assignee.userId) ?? 0) + 1);
    }
  }
  const workloads = [...workByAssignee.values()];
  const workloadBalance =
    workloads.length < 2
      ? 100
      : Math.round((Math.min(...workloads) / Math.max(...workloads)) * 100);
  const handoffs = handoffCounts(new Set(rows.map((row) => row.id)), activities, period);
  const handoffSuccess = rate(handoffs.successful, handoffs.ready) ?? 100;
  const score = Math.round(
    onTime * 0.35 +
      overdueControl * 0.25 +
      blockedAgeing * 0.2 +
      workloadBalance * 0.1 +
      handoffSuccess * 0.1,
  );

  return {
    projectId: firstRow.projectId,
    projectName: firstRow.projectName ?? 'Unnamed project',
    score,
    band: score >= 80 ? 'green' : score >= 60 ? 'amber' : 'red',
    taskCount: rows.length,
    components: { onTime, overdueControl, blockedAgeing, workloadBalance, handoffSuccess },
  };
}

export function resolveAnalyticsPeriod(
  input: { dateFrom?: string; dateTo?: string },
  now: Date,
): AnalyticsPeriod {
  if (input.dateFrom && input.dateTo) {
    const from = new Date(`${input.dateFrom}T00:00:00.000Z`);
    const to = new Date(`${input.dateTo}T23:59:59.999Z`);
    return { from, to, months: monthKeys(from, to).length };
  }
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  return { from, to, months: 12 };
}

export function buildDashboardAnalytics(
  rows: DashboardTaskRow[],
  activities: DashboardActivityRow[],
  period: AnalyticsPeriod,
  now: Date,
): AnalyticsMetricResult {
  const months = monthKeys(period.from, period.to);
  const completionCounts = new Map(months.map((month) => [month, 0]));
  const overdueByMonth = new Map<string, Map<string, { id: string; name: string; count: number }>>(
    months.map((month) => [month, new Map()]),
  );
  const completionDurations: number[] = [];

  for (const row of rows) {
    if (within(row.completedAt, period)) {
      const key = monthKey(row.completedAt);
      completionCounts.set(key, (completionCounts.get(key) ?? 0) + 1);
      const duration = (row.completedAt.getTime() - row.createdAt.getTime()) / HOUR_MS;
      if (duration >= 0 && Number.isFinite(duration)) completionDurations.push(duration);
    }
    if (within(row.dueDate, period) && taskIsOverdueOutcome(row, now)) {
      const key = monthKey(row.dueDate);
      const departments = overdueByMonth.get(key)!;
      const current = departments.get(row.departmentId) ?? {
        id: row.departmentId,
        name: row.departmentName,
        count: 0,
      };
      current.count += 1;
      departments.set(row.departmentId, current);
    }
  }

  const active = rows.filter((row) => row.status !== 'completed');
  const workloadMap = new Map<string, DashboardAnalyticsResponse['workload'][number]>();
  for (const row of active) {
    const uniqueAssignees = new Map(row.assignees.map((assignee) => [assignee.userId, assignee]));
    for (const assignee of uniqueAssignees.values()) {
      const current = workloadMap.get(assignee.userId) ?? {
        userId: assignee.userId,
        name: assignee.name,
        role: assignee.role ?? 'member',
        active: 0,
        overdue: 0,
        estimatedHours: 0,
      };
      current.active += 1;
      if (taskIsCurrentlyOverdue(row, now)) current.overdue += 1;
      current.estimatedHours = rounded(current.estimatedHours + Number(row.estimatedHours || 0));
      workloadMap.set(assignee.userId, current);
    }
  }

  const blockedItems = active
    .filter((row) => row.status === 'blocked')
    .map((row) => ({
      taskId: row.id,
      title: row.title,
      projectId: row.projectId,
      projectName: row.projectName,
      days: Math.max(
        0,
        Math.floor((now.getTime() - blockedSince(row, activities).getTime()) / DAY_MS),
      ),
    }))
    .sort((left, right) => right.days - left.days || left.title.localeCompare(right.title));
  const handoffs = handoffCounts(new Set(rows.map((row) => row.id)), activities, period);
  const completedWithDue = rows.filter((row) => within(row.completedAt, period) && row.dueDate);

  const projects = new Map<string, DashboardTaskRow[]>();
  for (const row of rows) {
    const current = projects.get(row.projectId) ?? [];
    current.push(row);
    projects.set(row.projectId, current);
  }

  return {
    kpis: {
      averageCompletionHours:
        completionDurations.length === 0
          ? null
          : rounded(
              completionDurations.reduce((sum, value) => sum + value, 0) /
                completionDurations.length,
            ),
      handoffSuccessRate: rate(handoffs.successful, handoffs.ready),
      onTimeCompletionRate: rate(
        completedWithDue.filter((row) => row.completedAt!.getTime() <= row.dueDate!.getTime())
          .length,
        completedWithDue.length,
      ),
    },
    monthlyCompletion: months.map((month) => ({
      month,
      completed: completionCounts.get(month) ?? 0,
    })),
    overdueOutcome: months.map((month) => {
      const departments = [...(overdueByMonth.get(month)?.values() ?? [])].sort(
        (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
      );
      return { month, total: departments.reduce((sum, item) => sum + item.count, 0), departments };
    }),
    workload: [...workloadMap.values()].sort(
      (left, right) =>
        right.active - left.active ||
        right.overdue - left.overdue ||
        left.name.localeCompare(right.name),
    ),
    blockedAgeing: {
      averageDays:
        blockedItems.length === 0
          ? null
          : rounded(blockedItems.reduce((sum, item) => sum + item.days, 0) / blockedItems.length),
      maxDays: blockedItems[0]?.days ?? null,
      items: blockedItems.slice(0, 10),
    },
    priorityDistribution: {
      critical: active.filter((row) => row.priority === 'critical').length,
      high: active.filter((row) => row.priority === 'high').length,
      medium: active.filter((row) => row.priority === 'medium').length,
      low: active.filter((row) => row.priority === 'low').length,
    },
    projectHealth: [...projects.values()]
      .filter((projectRows) => !!projectRows[0]?.projectId)
      .map((projectRows) => buildHealth(projectRows, activities, period, now))
      .sort(
        (left, right) =>
          left.score - right.score || left.projectName.localeCompare(right.projectName),
      ),
  };
}
