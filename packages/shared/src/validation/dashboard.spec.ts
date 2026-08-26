import {
  dashboardAnalyticsExportQuerySchema,
  dashboardAnalyticsQuerySchema,
  dashboardOverviewQuerySchema,
} from './index';

describe('dashboardOverviewQuerySchema', () => {
  it('defaults to 30 days and accepts a UUID department', () => {
    expect(
      dashboardOverviewQuerySchema.parse({
        departmentId: '00000000-0000-0000-0000-000000000001',
      }),
    ).toEqual({
      departmentId: '00000000-0000-0000-0000-000000000001',
      days: 30,
    });
  });

  it('rejects unsupported windows', () => {
    expect(() => dashboardOverviewQuerySchema.parse({ days: 365 })).toThrow();
  });

  it('rejects a non-UUID department', () => {
    expect(() => dashboardOverviewQuerySchema.parse({ departmentId: 'sales' })).toThrow();
  });
});

describe('dashboardAnalyticsQuerySchema', () => {
  const departmentId = '00000000-0000-0000-0000-000000000001';
  const projectId = '00000000-0000-0000-0000-000000000002';

  it('defaults to monthly grouping and leaves the trailing period for the service to resolve', () => {
    expect(dashboardAnalyticsQuerySchema.parse({})).toEqual({ groupBy: 'month' });
  });

  it('accepts a role-scoped department, project, and twelve-month date range', () => {
    expect(
      dashboardAnalyticsQuerySchema.parse({
        departmentId,
        projectId,
        dateFrom: '2025-09-01',
        dateTo: '2026-08-31',
      }),
    ).toEqual({
      departmentId,
      projectId,
      dateFrom: '2025-09-01',
      dateTo: '2026-08-31',
      groupBy: 'month',
    });
  });

  it.each([
    [{ departmentId: 'sales' }],
    [{ projectId: 'launch' }],
    [{ dateFrom: '01/09/2025' }],
    [{ dateFrom: '2026-02-30', dateTo: '2026-03-31' }],
    [{ dateFrom: '2026-08-01', dateTo: '2026-07-31' }],
    [{ dateFrom: '2025-01-01', dateTo: '2026-08-31' }],
    [{ groupBy: 'week' }],
  ])('rejects unsafe or unsupported analytics input %p', (input) => {
    expect(() => dashboardAnalyticsQuerySchema.parse(input)).toThrow();
  });

  it('requires an explicit export format', () => {
    expect(() => dashboardAnalyticsExportQuerySchema.parse({})).toThrow();
    expect(dashboardAnalyticsExportQuerySchema.parse({ format: 'pdf' })).toEqual({
      format: 'pdf',
      groupBy: 'month',
    });
  });
});
