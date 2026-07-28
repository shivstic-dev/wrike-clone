import type { DashboardOverview } from '@wrike-clone/shared';
import type { GroupedDepartmentTasks } from '../../api/tasks';
import { AdminDashboard } from './AdminDashboard';
import { DepartmentHeadDashboard } from './DepartmentHeadDashboard';
import { EmployeeDashboard } from './EmployeeDashboard';
import { ManagerDashboard } from './ManagerDashboard';

export interface RoleDashboardProps {
  overview: DashboardOverview;
  grouped?: GroupedDepartmentTasks;
}

export function RoleDashboard(props: RoleDashboardProps) {
  switch (props.overview.scope.role) {
    case 'employee':
      return <EmployeeDashboard {...props} />;
    case 'manager':
      return <ManagerDashboard {...props} />;
    case 'department_head':
      return <DepartmentHeadDashboard {...props} />;
    case 'admin':
      return <AdminDashboard {...props} />;
  }
}
