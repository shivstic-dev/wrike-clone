import { describe, expect, it } from 'vitest';
import {
  allowedReportScopes,
  buildReportParams,
  canExportReport,
  defaultReportScope,
  describeActiveReportFilters,
  permittedReportMembers,
} from './report-controls';

describe('report controls', () => {
  it.each([
    ['member', 'employee', 'self'],
    ['member', 'manager', 'combined'],
    ['member', 'department_head', 'combined'],
    ['admin', undefined, 'combined'],
  ] as const)('defaults %s/%s to %s', (tenantRole, departmentRole, expected) => {
    expect(defaultReportScope(tenantRole, departmentRole)).toBe(expected);
  });

  it('offers employees only self scope', () => {
    expect(allowedReportScopes('member', 'employee')).toEqual(['self']);
  });

  it('offers management all permission-checked scopes', () => {
    expect(allowedReportScopes('member', 'manager')).toEqual(['self', 'individual', 'combined']);
  });

  it('limits a manager person picker to self and employees', () => {
    expect(
      permittedReportMembers(
        [
          { userId: 'manager-1', role: 'manager' },
          { userId: 'manager-2', role: 'manager' },
          { userId: 'employee-1', role: 'employee' },
          { userId: 'head-1', role: 'department_head' },
        ],
        'manager',
        'manager-1',
      ).map((member) => member.userId),
    ).toEqual(['manager-1', 'employee-1']);
  });

  it('limits an employee person picker to themselves', () => {
    expect(
      permittedReportMembers(
        [
          { userId: 'employee-1', role: 'employee' },
          { userId: 'employee-2', role: 'employee' },
        ],
        'employee',
        'employee-1',
      ).map((member) => member.userId),
    ).toEqual(['employee-1']);
  });

  it('disables export when the current report has no tasks', () => {
    expect(canExportReport(true, 0, false)).toBe(false);
    expect(canExportReport(true, 1, false)).toBe(true);
    expect(canExportReport(false, 1, false)).toBe(false);
    expect(canExportReport(true, 1, true)).toBe(false);
  });

  it('omits empty filters and sends the effective scope', () => {
    expect(
      buildReportParams({
        departmentId: '',
        dateFrom: '',
        dateTo: '',
        scope: 'combined',
      }),
    ).toEqual({ scope: 'combined' });
  });

  it('trims values so screen and export receive stable parameters', () => {
    expect(
      buildReportParams({
        departmentId: ' dept-1 ',
        scope: 'individual',
        targetUserId: ' user-1 ',
      }),
    ).toEqual({
      departmentId: 'dept-1',
      scope: 'individual',
      targetUserId: 'user-1',
    });
  });

  it('describes active filters with readable labels', () => {
    expect(
      describeActiveReportFilters({
        departmentId: 'dept-1',
        departmentName: 'CEPA',
        status: 'todo',
        priority: 'high',
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
        scope: 'individual',
        targetUserName: 'Priya',
      }),
    ).toBe(
      'Department: CEPA · Scope: Priya · Status: To do · Priority: High · Created from: 2026-07-01 · Created to: 2026-07-31',
    );
  });

  it('returns a neutral description when no optional filters are active', () => {
    expect(describeActiveReportFilters({ scope: 'combined' })).toBe('Scope: Combined team');
  });
});
