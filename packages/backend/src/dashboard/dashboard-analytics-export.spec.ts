import type { DashboardAnalyticsResponse } from '@wrike-clone/shared';
import { exportDashboardAnalytics } from './dashboard-analytics-export';

const analytics: DashboardAnalyticsResponse = {
  generatedAt: '2026-08-11T10:00:00.000Z',
  period: { from: '2025-09-01T00:00:00.000Z', to: '2026-08-31T23:59:59.999Z', months: 12 },
  scope: { role: 'manager', departmentId: 'department-1' },
  kpis: { averageCompletionHours: 28.5, handoffSuccessRate: 80, onTimeCompletionRate: 75 },
  monthlyCompletion: [{ month: '2026-08', completed: 12 }],
  overdueOutcome: [{ month: '2026-08', total: 2, departments: [{ id: 'department-1', name: 'Operations', count: 2 }] }],
  workload: [{ userId: 'user-1', name: 'Atul', role: 'manager', active: 4, overdue: 1, estimatedHours: 18 }],
  blockedAgeing: { averageDays: 3, maxDays: 3, items: [{ taskId: 'task-1', title: 'Permit review', projectId: 'project-1', projectName: 'Annual plan', days: 3 }] },
  priorityDistribution: { critical: 1, high: 2, medium: 3, low: 4 },
  projectHealth: [{ projectId: 'project-1', projectName: 'Annual plan', score: 82, band: 'green', taskCount: 10, components: { onTime: 75, overdueControl: 90, blockedAgeing: 90, workloadBalance: 80, handoffSuccess: 80 } }],
};

describe('exportDashboardAnalytics', () => {
  it('creates a valid private-download PDF payload with a dated name', async () => {
    const result = await exportDashboardAnalytics(analytics, 'pdf');
    expect(result.contentType).toBe('application/pdf');
    expect(result.filename).toBe('cepaa-board-summary-2026-08-11.pdf');
    expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('creates an Office Open XML workbook with summary tables', async () => {
    const result = await exportDashboardAnalytics(analytics, 'xlsx');
    expect(result.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(result.filename).toBe('cepaa-board-summary-2026-08-11.xlsx');
    expect(result.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(result.buffer.length).toBeGreaterThan(500);
  });
});
