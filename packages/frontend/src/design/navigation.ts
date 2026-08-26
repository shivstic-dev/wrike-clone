export type ShellRole = 'employee' | 'manager' | 'department_head' | 'admin';

export interface NavigationItem {
  label: string;
  path: string;
  section: 'overview' | 'workspace' | 'manage';
  icon:
    | 'dashboard'
    | 'tasks'
    | 'calendar'
    | 'department'
    | 'portfolio'
    | 'reports'
    | 'timesheets'
    | 'admin';
}

const sharedNavigation = [
  { label: 'Dashboard', path: '/dashboard', section: 'overview', icon: 'dashboard' },
  { label: 'My Tasks', path: '/my-tasks', section: 'overview', icon: 'tasks' },
  { label: 'Calendar', path: '/calendar', section: 'overview', icon: 'calendar' },
  {
    label: 'Departments',
    path: '/dashboard#departments',
    section: 'workspace',
    icon: 'department',
  },
  { label: 'Portfolio', path: '/portfolio', section: 'workspace', icon: 'portfolio' },
  { label: 'Reports', path: '/reports', section: 'manage', icon: 'reports' },
  { label: 'Timesheets', path: '/timesheets', section: 'manage', icon: 'timesheets' },
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
