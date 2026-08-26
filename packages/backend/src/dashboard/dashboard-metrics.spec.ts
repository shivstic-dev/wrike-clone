import {
  buildDashboardMetrics,
  taskMatchesDashboardBucket,
  type DashboardTaskRow,
} from './dashboard-metrics';

type TaskOverrides = Partial<
  Omit<DashboardTaskRow, 'createdAt' | 'completedAt' | 'dueDate' | 'handoffReadyAt' | 'updatedAt'>
> & {
  id: string;
  createdAt?: Date | string;
  completedAt?: Date | string | null;
  dueDate?: Date | string | null;
  handoffReadyAt?: Date | string | null;
  updatedAt?: Date | string;
};

type DailyMetric = { date: string; created: number; completed: number };

function date(value: Date | string | null | undefined, fallback: Date | null): Date | null {
  if (value === undefined) return fallback;
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function task(overrides: TaskOverrides): DashboardTaskRow {
  return {
    id: overrides.id,
    title: overrides.title ?? `Task ${overrides.id}`,
    status: overrides.status ?? 'todo',
    priority: overrides.priority ?? 'medium',
    departmentId: overrides.departmentId ?? 'department-1',
    departmentName: overrides.departmentName ?? 'Operations',
    createdAt: date(overrides.createdAt, new Date('2026-01-01T00:00:00Z'))!,
    completedAt: date(overrides.completedAt, null),
    dueDate: date(overrides.dueDate, null),
    handoffStatus: overrides.handoffStatus ?? 'pending',
    handoffReadyAt: date(overrides.handoffReadyAt, null),
    updatedAt: date(overrides.updatedAt, new Date('2026-07-28T00:00:00Z'))!,
    projectId: overrides.projectId ?? 'project-1',
    projectName: overrides.projectName ?? 'Community work',
    handoffOwner: overrides.handoffOwner ?? null,
    assignees: overrides.assignees ?? [{ userId: 'user-1', name: 'Ada' }],
  };
}

describe('buildDashboardMetrics', () => {
  const now = new Date('2026-07-28T12:00:00Z');

  it('counts current and previous UTC calendar windows by the event timestamp', () => {
    const result = buildDashboardMetrics(
      [
        task({ id: 'created-current-start', createdAt: '2026-06-29T00:00:00.000Z' }),
        task({ id: 'created-previous-end', createdAt: '2026-06-28T23:59:59.999Z' }),
        task({ id: 'created-previous-start', createdAt: '2026-05-30T00:00:00.000Z' }),
        task({ id: 'created-too-old', createdAt: '2026-05-29T23:59:59.999Z' }),
        task({ id: 'created-after-window', createdAt: '2026-07-29T00:00:00.000Z' }),
        task({
          id: 'completed-current-start',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'completed',
          completedAt: '2026-06-29T00:00:00.000Z',
        }),
        task({
          id: 'completed-previous-end',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'completed',
          completedAt: '2026-06-28T23:59:59.999Z',
        }),
        task({
          id: 'completed-previous-start',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'completed',
          completedAt: '2026-05-30T00:00:00.000Z',
        }),
        task({
          id: 'completed-too-old',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'completed',
          completedAt: '2026-05-29T23:59:59.999Z',
        }),
        task({
          id: 'completed-after-window',
          createdAt: '2026-01-01T00:00:00Z',
          status: 'completed',
          completedAt: '2026-07-29T00:00:00.000Z',
        }),
      ],
      now,
      30,
    );

    expect(result.daily.reduce((sum: number, day: DailyMetric) => sum + day.created, 0)).toBe(1);
    expect(result.daily.reduce((sum: number, day: DailyMetric) => sum + day.completed, 0)).toBe(1);
    expect(result.comparison).toEqual({
      createdPercentChange: -50,
      completedPercentChange: -50,
    });
  });

  it('returns exactly 30 ascending UTC date buckets including the date containing now', () => {
    const result = buildDashboardMetrics([], now, 30);

    expect(result.daily).toHaveLength(30);
    expect(result.daily[0]).toEqual({ date: '2026-06-29', created: 0, completed: 0 });
    expect(result.daily[29]).toEqual({ date: '2026-07-28', created: 0, completed: 0 });
    expect(result.daily.map((day: DailyMetric) => day.date)).toEqual(
      [...result.daily].map((day: DailyMetric) => day.date).sort(),
    );
  });

  it('rejects a non-30-day window received from an untyped runtime caller', () => {
    const callWithRuntimeWindow = buildDashboardMetrics as (
      rows: DashboardTaskRow[],
      now: Date,
      windowDays: number,
    ) => unknown;

    expect(() => callWithRuntimeWindow([], now, 29)).toThrow(
      new RangeError('Dashboard metrics require a 30-day window'),
    );
  });

  it('returns null percent changes when the previous window has no matching events', () => {
    const result = buildDashboardMetrics(
      [
        task({ id: 'created-current', createdAt: '2026-07-20T00:00:00Z' }),
        task({
          id: 'completed-current',
          status: 'completed',
          completedAt: '2026-07-21T00:00:00Z',
        }),
      ],
      now,
      30,
    );

    expect(result.comparison).toEqual({
      createdPercentChange: null,
      completedPercentChange: null,
    });
  });

  it('rounds non-zero-baseline percentage changes to whole percentages', () => {
    const result = buildDashboardMetrics(
      [
        task({ id: 'current-1', createdAt: '2026-07-01T00:00:00Z' }),
        task({ id: 'current-2', createdAt: '2026-07-02T00:00:00Z' }),
        task({ id: 'previous-1', createdAt: '2026-06-01T00:00:00Z' }),
        task({ id: 'previous-2', createdAt: '2026-06-02T00:00:00Z' }),
        task({ id: 'previous-3', createdAt: '2026-06-03T00:00:00Z' }),
      ],
      now,
      30,
    );

    expect(result.comparison.createdPercentChange).toBe(-33);
  });

  it('computes current-state totals, sorted distributions, and open assigned capacity', () => {
    const result = buildDashboardMetrics(
      [
        task({
          id: 'late-high',
          title: 'Late high',
          priority: 'high',
          dueDate: '2026-07-20T00:00:00Z',
          assignees: [
            { userId: 'user-2', name: 'Grace' },
            { userId: 'user-1', name: 'Ada' },
          ],
        }),
        task({
          id: 'blocked-low',
          status: 'blocked',
          priority: 'low',
          assignees: [{ userId: 'user-2', name: 'Grace' }],
        }),
        task({ id: 'unassigned', priority: 'high', assignees: [] }),
        task({
          id: 'completed-late',
          status: 'completed',
          priority: 'low',
          dueDate: '2026-07-01T00:00:00Z',
          completedAt: '2026-07-10T00:00:00Z',
          assignees: [{ userId: 'user-1', name: 'Ada' }],
        }),
      ],
      now,
      30,
    );

    expect(result.totals).toEqual({
      active: 3,
      completed: 1,
      overdue: 1,
      blocked: 1,
      unassigned: 1,
      readyForHandoff: 0,
    });
    expect(result.byStatus).toEqual({ blocked: 1, completed: 1, todo: 2 });
    expect(Object.keys(result.byStatus)).toEqual(['blocked', 'completed', 'todo']);
    expect(result.byPriority).toEqual({ high: 2, low: 2 });
    expect(result.capacity).toEqual([
      { userId: 'user-2', name: 'Grace', openTasks: 2, overdue: 1 },
      { userId: 'user-1', name: 'Ada', openTasks: 1, overdue: 1 },
    ]);
  });

  it('derives every dashboard total from the same bucket predicate as the task list', () => {
    const rows = [
      task({ id: 'active' }),
      task({ id: 'completed', status: 'completed' }),
      task({ id: 'overdue', dueDate: '2026-07-20T00:00:00Z' }),
      task({ id: 'blocked', status: 'blocked' }),
      task({ id: 'unassigned', assignees: [] }),
      task({ id: 'ready', handoffStatus: 'ready', handoffReadyAt: '2026-07-27T12:00:00Z' }),
      task({
        id: 'completed-ready',
        status: 'completed',
        handoffStatus: 'ready',
        handoffReadyAt: '2026-07-27T12:00:00Z',
      }),
    ];
    const metrics = buildDashboardMetrics(rows, now, 30);

    expect(metrics.totals.active).toBe(
      rows.filter((current) => taskMatchesDashboardBucket(current, 'active', now)).length,
    );
    expect(metrics.totals.completed).toBe(
      rows.filter((current) => taskMatchesDashboardBucket(current, 'completed', now)).length,
    );
    expect(metrics.totals.overdue).toBe(
      rows.filter((current) => taskMatchesDashboardBucket(current, 'overdue', now)).length,
    );
    expect(metrics.totals.blocked).toBe(
      rows.filter((current) => taskMatchesDashboardBucket(current, 'blocked', now)).length,
    );
    expect(metrics.totals.unassigned).toBe(
      rows.filter((current) => taskMatchesDashboardBucket(current, 'unassigned', now)).length,
    );
    expect(metrics.totals.readyForHandoff).toBe(
      rows.filter((current) => taskMatchesDashboardBucket(current, 'ready_for_handoff', now))
        .length,
    );
  });

  it('deduplicates attention by reason priority and orders it independently of row order', () => {
    const rows = [
      task({ id: 'unassigned-zulu', title: 'Zulu', assignees: [] }),
      task({
        id: 'blocked-unassigned',
        title: 'Blocked',
        status: 'blocked',
        assignees: [],
      }),
      task({
        id: 'late-blocked-unassigned',
        title: 'Late',
        status: 'blocked',
        dueDate: '2026-07-20T00:00:00Z',
        assignees: [],
      }),
      task({
        id: 'unassigned-alpha',
        title: 'Alpha',
        assignees: [],
      }),
      task({
        id: 'completed',
        status: 'completed',
        dueDate: '2026-07-01T00:00:00Z',
        assignees: [],
      }),
    ];

    const attention = buildDashboardMetrics(rows, now, 30).attention;
    const reversedAttention = buildDashboardMetrics([...rows].reverse(), now, 30).attention;

    expect(attention).toEqual([
      {
        id: 'late-blocked-unassigned',
        title: 'Late',
        reason: 'overdue',
        dueDate: '2026-07-20T00:00:00.000Z',
        assigneeName: null,
      },
      {
        id: 'blocked-unassigned',
        title: 'Blocked',
        reason: 'blocked',
        dueDate: null,
        assigneeName: null,
      },
      {
        id: 'unassigned-alpha',
        title: 'Alpha',
        reason: 'unassigned',
        dueDate: null,
        assigneeName: null,
      },
      {
        id: 'unassigned-zulu',
        title: 'Zulu',
        reason: 'unassigned',
        dueDate: null,
        assigneeName: null,
      },
    ]);
    expect(reversedAttention).toEqual(attention);
  });

  it('returns the same deterministic metrics for the same rows in any input order', () => {
    const rows = [
      task({
        id: 'bravo',
        status: 'blocked',
        priority: 'high',
        assignees: [{ userId: 'user-2', name: 'Grace' }],
      }),
      task({
        id: 'alpha',
        priority: 'low',
        dueDate: '2026-07-01T00:00:00Z',
        assignees: [
          { userId: 'user-2', name: 'Grace' },
          { userId: 'user-1', name: 'Ada' },
        ],
      }),
    ];

    expect(buildDashboardMetrics([...rows].reverse(), now, 30)).toEqual(
      buildDashboardMetrics(rows, now, 30),
    );
  });
});
