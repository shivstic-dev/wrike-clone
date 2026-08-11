import {
  buildDashboardAnalytics,
  normalizeDashboardActivity,
  resolveAnalyticsPeriod,
} from './dashboard-analytics-metrics';
import type { DashboardTaskRow } from './dashboard-metrics';

function task(
  overrides: Partial<DashboardTaskRow> & { id: string },
): DashboardTaskRow {
  return {
    id: overrides.id,
    title: overrides.title ?? overrides.id,
    status: overrides.status ?? 'todo',
    priority: overrides.priority ?? 'medium',
    departmentId: overrides.departmentId ?? 'department-1',
    departmentName: overrides.departmentName ?? 'Operations',
    createdAt: overrides.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    completedAt: overrides.completedAt ?? null,
    dueDate: overrides.dueDate ?? null,
    handoffStatus: overrides.handoffStatus ?? 'pending',
    handoffReadyAt: overrides.handoffReadyAt ?? null,
    updatedAt: overrides.updatedAt ?? new Date('2026-03-20T00:00:00.000Z'),
    projectId: overrides.projectId ?? 'project-1',
    projectName: overrides.projectName ?? 'Annual plan',
    handoffOwner: overrides.handoffOwner ?? null,
    assignees: overrides.assignees ?? [],
    estimatedHours: overrides.estimatedHours ?? 0,
  };
}

describe('resolveAnalyticsPeriod', () => {
  it('defaults to twelve calendar months ending in the current month', () => {
    expect(resolveAnalyticsPeriod({}, new Date('2026-08-11T10:00:00.000Z'))).toEqual({
      from: new Date('2025-09-01T00:00:00.000Z'),
      to: new Date('2026-08-31T23:59:59.999Z'),
      months: 12,
    });
  });

  it('uses inclusive UTC boundaries for a custom period', () => {
    expect(
      resolveAnalyticsPeriod(
        { dateFrom: '2026-01-15', dateTo: '2026-03-02' },
        new Date('2026-08-11T10:00:00.000Z'),
      ),
    ).toEqual({
      from: new Date('2026-01-15T00:00:00.000Z'),
      to: new Date('2026-03-02T23:59:59.999Z'),
      months: 3,
    });
  });
});

describe('normalizeDashboardActivity', () => {
  it('fails closed to empty changes when legacy JSON is malformed', () => {
    expect(
      normalizeDashboardActivity({
        taskId: 'task-1',
        action: 'task:status:changed',
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        changes: '{broken',
      }),
    ).toEqual({
      taskId: 'task-1',
      action: 'task:status:changed',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
      changes: {},
    });
  });
});

describe('buildDashboardAnalytics', () => {
  const now = new Date('2026-04-01T00:00:00.000Z');
  const period = {
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-03-31T23:59:59.999Z'),
    months: 3,
  };

  it('builds monthly, overdue, workload, completion and priority metrics from visible tasks', () => {
    const rows = [
      task({
        id: 'on-time',
        status: 'completed',
        priority: 'high',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-01-03T00:00:00.000Z'),
        dueDate: new Date('2026-01-04T00:00:00.000Z'),
      }),
      task({
        id: 'late',
        status: 'completed',
        departmentId: 'department-2',
        departmentName: 'Finance',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        completedAt: new Date('2026-02-01T00:00:00.000Z'),
        dueDate: new Date('2026-01-31T00:00:00.000Z'),
      }),
      task({
        id: 'active-overdue',
        priority: 'critical',
        dueDate: new Date('2026-02-10T00:00:00.000Z'),
        estimatedHours: 6,
        assignees: [{ userId: 'manager-1', name: 'Atul', role: 'manager' }],
      }),
      task({
        id: 'active',
        priority: 'low',
        estimatedHours: 2.5,
        assignees: [{ userId: 'employee-1', name: 'Aparna', role: 'employee' }],
      }),
    ];

    const result = buildDashboardAnalytics(rows, [], period, now);

    expect(result.monthlyCompletion).toEqual([
      { month: '2026-01', completed: 1 },
      { month: '2026-02', completed: 1 },
      { month: '2026-03', completed: 0 },
    ]);
    expect(result.overdueOutcome).toEqual([
      {
        month: '2026-01',
        total: 1,
        departments: [{ id: 'department-2', name: 'Finance', count: 1 }],
      },
      {
        month: '2026-02',
        total: 1,
        departments: [{ id: 'department-1', name: 'Operations', count: 1 }],
      },
      { month: '2026-03', total: 0, departments: [] },
    ]);
    expect(result.workload).toEqual([
      {
        userId: 'manager-1',
        name: 'Atul',
        role: 'manager',
        active: 1,
        overdue: 1,
        estimatedHours: 6,
      },
      {
        userId: 'employee-1',
        name: 'Aparna',
        role: 'employee',
        active: 1,
        overdue: 0,
        estimatedHours: 2.5,
      },
    ]);
    expect(result.kpis.averageCompletionHours).toBe(396);
    expect(result.kpis.onTimeCompletionRate).toBe(50);
    expect(result.priorityDistribution).toEqual({ critical: 1, high: 0, medium: 0, low: 1 });
  });

  it('uses the latest blocked transition and pairs handoffs within 48 hours', () => {
    const rows = [
      task({ id: 'blocked', status: 'blocked', updatedAt: new Date('2026-03-29T00:00:00.000Z') }),
      task({ id: 'fast-handoff', status: 'completed', completedAt: new Date('2026-03-12T00:00:00.000Z') }),
      task({ id: 'slow-handoff', status: 'completed', completedAt: new Date('2026-03-20T00:00:00.000Z') }),
    ];
    const activities = [
      { taskId: 'blocked', action: 'task:status:changed', createdAt: new Date('2026-03-10T00:00:00.000Z'), changes: { status: { old: 'todo', new: 'blocked' } } },
      { taskId: 'blocked', action: 'task:status:changed', createdAt: new Date('2026-03-15T00:00:00.000Z'), changes: { status: { old: 'blocked', new: 'todo' } } },
      { taskId: 'blocked', action: 'task:status:changed', createdAt: new Date('2026-03-22T00:00:00.000Z'), changes: { status: { old: 'todo', new: 'blocked' } } },
      { taskId: 'fast-handoff', action: 'task:handoff:ready', createdAt: new Date('2026-03-10T00:00:00.000Z'), changes: {} },
      { taskId: 'fast-handoff', action: 'task:handoff:confirmed', createdAt: new Date('2026-03-11T23:00:00.000Z'), changes: {} },
      { taskId: 'slow-handoff', action: 'task:handoff:ready', createdAt: new Date('2026-03-15T00:00:00.000Z'), changes: {} },
      { taskId: 'slow-handoff', action: 'task:handoff:confirmed', createdAt: new Date('2026-03-17T00:00:00.001Z'), changes: {} },
    ];

    const result = buildDashboardAnalytics(rows, activities, period, now);

    expect(result.blockedAgeing).toEqual({
      averageDays: 10,
      maxDays: 10,
      items: [{ taskId: 'blocked', title: 'blocked', projectId: 'project-1', projectName: 'Annual plan', days: 10 }],
    });
    expect(result.kpis.handoffSuccessRate).toBe(50);
  });

  it('uses neutral health components when a project has no applicable denominator', () => {
    const result = buildDashboardAnalytics(
      [task({ id: 'plain', assignees: [{ userId: 'employee-1', name: 'Aparna', role: 'employee' }] })],
      [],
      period,
      now,
    );

    expect(result.kpis).toEqual({
      averageCompletionHours: null,
      handoffSuccessRate: null,
      onTimeCompletionRate: null,
    });
    expect(result.projectHealth).toEqual([
      {
        projectId: 'project-1',
        projectName: 'Annual plan',
        score: 100,
        band: 'green',
        taskCount: 1,
        components: {
          onTime: 100,
          overdueControl: 100,
          blockedAgeing: 100,
          workloadBalance: 100,
          handoffSuccess: 100,
        },
      },
    ]);
  });
});
