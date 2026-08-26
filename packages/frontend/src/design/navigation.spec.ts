import { describe, expect, it } from 'vitest';
import { navigationForRole } from './navigation';

describe('navigationForRole', () => {
  it.each(['employee', 'manager', 'department_head'] as const)(
    'omits Administration for %s',
    (role) => {
      expect(navigationForRole(role).map((item) => item.label)).toEqual([
        'Dashboard',
        'My Tasks',
        'Calendar',
        'Departments',
        'Portfolio',
        'Reports',
        'Timesheets',
      ]);
    },
  );

  it('adds Administration only for admins', () => {
    expect(navigationForRole('admin').map((item) => item.label)).toContain('Administration');
  });

  it.each(['employee', 'manager', 'department_head', 'admin'] as const)(
    'uses only defined fixed routes for %s',
    (role) => {
      const fixedRoutes = new Set([
        '/dashboard',
        '/dashboard#departments',
        '/my-tasks',
        '/calendar',
        '/portfolio',
        '/reports',
        '/timesheets',
        '/admin',
      ]);

      expect(navigationForRole(role).every((item) => fixedRoutes.has(item.path))).toBe(true);
    },
  );
});
