export type ShellRole = 'employee' | 'manager' | 'department_head' | 'admin';

export interface NavigationItem {
  label: string;
  path: string;
  section: 'overview' | 'workspace' | 'manage';
  icon: 'dashboard' | 'tasks' | 'department' | 'reports' | 'admin';
}

const sharedNavigation = [
  { label: 'Dashboard', path: '/dashboard', section: 'overview', icon: 'dashboard' },
  { label: 'My Work', path: '/my-tasks', section: 'workspace', icon: 'tasks' },
  {
    label: 'Departments',
    path: '/dashboard#departments',
    section: 'workspace',
    icon: 'department',
  },
  { label: 'Reports', path: '/reports', section: 'manage', icon: 'reports' },
] satisfies readonly NavigationItem[];

const navigationByRole = {
  employee: sharedNavigation,
  manager: sharedNavigation,
  department_head: sharedNavigation,
  admin: [
    ...sharedNavigation,
    { label: 'Administration', path: '/admin', section: 'manage', icon: 'admin' },
  ],
} satisfies Readonly<Record<ShellRole, readonly NavigationItem[]>>;

export function navigationForRole(role: ShellRole): NavigationItem[] {
  return navigationByRole[role].map((item) => ({ ...item }));
}
