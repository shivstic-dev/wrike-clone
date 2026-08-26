import { renderToStaticMarkup } from 'react-dom/server';
import type { DashboardAnalyticsResponse } from '@wrike-clone/shared';
import { describe, expect, it, vi } from 'vitest';
import { DashboardAnalyticsPanel } from './DashboardAnalytics';

const analytics: DashboardAnalyticsResponse = {
  generatedAt: '2026-08-11T10:00:00.000Z',
  period: { from: '2025-09-01T00:00:00.000Z', to: '2026-08-31T23:59:59.999Z', months: 12 },
  scope: { role: 'manager', departmentId: 'department-1' },
  kpis: { averageCompletionHours: 28.5, handoffSuccessRate: 80, onTimeCompletionRate: 75 },
  monthlyCompletion: [{ month: '2026-08', completed: 12 }],
  overdueOutcome: [
    {
      month: '2026-08',
      total: 2,
      departments: [{ id: 'department-1', name: 'Operations', count: 2 }],
    },
  ],
  workload: [
    { userId: 'user-1', name: 'Atul', role: 'manager', active: 4, overdue: 1, estimatedHours: 18 },
  ],
  blockedAgeing: {
    averageDays: 3,
    maxDays: 3,
    items: [
      {
        taskId: 'task-1',
        title: 'Permit review',
        projectId: 'project-1',
        projectName: 'Annual plan',
        days: 3,
      },
    ],
  },
  priorityDistribution: { critical: 1, high: 2, medium: 3, low: 4 },
  projectHealth: [
    {
      projectId: 'project-1',
      projectName: 'Annual plan',
      score: 82,
      band: 'green',
      taskCount: 10,
      components: {
        onTime: 75,
        overdueControl: 90,
        blockedAgeing: 90,
        workloadBalance: 80,
        handoffSuccess: 80,
      },
    },
  ],
};

describe('DashboardAnalyticsPanel', () => {
  it('renders every approved metric with exact accessible data and health explanation', () => {
    const html = renderToStaticMarkup(
      <DashboardAnalyticsPanel data={analytics} exporting={null} onExport={vi.fn()} />,
    );

    for (const label of [
      'Monthly completion trend',
      'Overdue outcome trend by department',
      'Workload by manager and employee',
      'Average completion time',
      'Blocked-task ageing',
      'Priority distribution',
      'Handoff success rate',
      'On-time completion',
      'Project health score',
      'Export board summary',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Atul');
    expect(html).toContain('Permit review');
    expect(html).toContain('Annual plan');
    expect(html).toContain('82');
    expect(html).toContain('35% on-time');
    expect(html).toContain('<table');
  });

  it('shows unavailable denominators honestly', () => {
    const html = renderToStaticMarkup(
      <DashboardAnalyticsPanel
        data={{
          ...analytics,
          kpis: {
            averageCompletionHours: null,
            handoffSuccessRate: null,
            onTimeCompletionRate: null,
          },
        }}
        exporting={null}
        onExport={vi.fn()}
      />,
    );
    expect(html.match(/Not available/g)?.length).toBe(3);
  });
});
