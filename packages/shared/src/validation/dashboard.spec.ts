import { dashboardOverviewQuerySchema } from './index';

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
