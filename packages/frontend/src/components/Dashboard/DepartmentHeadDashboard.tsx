import { CapacityPanel } from './CapacityPanel';
import {
  AtlasPanel,
  GettingStarted,
  OverviewCore,
  PeopleWork,
  TaskList,
  type RoleCompositionProps,
} from './EmployeeDashboard';

export function DepartmentHeadDashboard({
  grouped,
  overview,
  onRetryOverview,
}: RoleCompositionProps) {
  return (
    <div className="space-y-4" data-dashboard-role="department_head">
      <OverviewCore overview={overview} onRetryOverview={onRetryOverview} />

      <div className="grid items-start gap-4 xl:grid-cols-2">
        <CapacityPanel capacity={overview.capacity} />
        <GettingStarted overview={overview} />
      </div>

      {grouped && (
        <>
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <TaskList title="My work" tasks={grouped.myTasks} />
            <TaskList title="Unassigned work" tasks={grouped.unassigned} />
          </div>
          <PeopleWork title="Manager work" groups={grouped.managerGroups} />
          <PeopleWork title="Employee work" groups={grouped.employeeGroups} />
        </>
      )}

      <AtlasPanel eyebrow="Audited access trail" title="Recent role changes">
        <p className="px-5 py-5 text-sm leading-6 text-slate-600">
          Review the live role-change history and department access controls in the field note
          below.
        </p>
      </AtlasPanel>
    </div>
  );
}
