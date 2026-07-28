import { CapacityPanel } from './CapacityPanel';
import {
  GettingStarted,
  OverviewCore,
  PeopleWork,
  TaskList,
  type RoleCompositionProps,
} from './EmployeeDashboard';

export function ManagerDashboard({
  grouped,
  overview,
  onRetryOverview,
}: RoleCompositionProps) {
  return (
    <div className="space-y-4" data-dashboard-role="manager">
      <OverviewCore overview={overview} onRetryOverview={onRetryOverview} />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CapacityPanel capacity={overview.capacity} />
        <GettingStarted overview={overview} />
      </div>

      {grouped && (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <TaskList title="My workload" tasks={grouped.myTasks} />
            <TaskList title="Unassigned work" tasks={grouped.unassigned} />
          </div>

          {!!grouped.managerGroups.length && (
            <PeopleWork title="Manager work" groups={grouped.managerGroups} />
          )}
          <PeopleWork title="Employee work" groups={grouped.employeeGroups} />
        </>
      )}
    </div>
  );
}
