import { CapacityPanel } from './CapacityPanel';
import { AttentionQueue } from './AttentionQueue';
import { ProgressPanel } from './ProgressPanel';
import {
  OverviewCore,
  PeopleWork,
  TaskList,
  WorkMovementPanel,
  type RoleCompositionProps,
} from './EmployeeDashboard';

export function ManagerDashboard({ grouped, overview }: RoleCompositionProps) {
  return (
    <div className="space-y-5" data-dashboard-role="manager">
      <OverviewCore overview={overview} />

      <div className="grid items-stretch gap-4 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-8">
          <WorkMovementPanel overview={overview} />
        </div>
        <div className="min-w-0 xl:col-span-4">
          <AttentionQueue attention={overview.attention} />
        </div>
        <div className="min-w-0 xl:col-span-7">
          <CapacityPanel capacity={overview.capacity} />
        </div>
        <div className="min-w-0 xl:col-span-5">
          <ProgressPanel overview={overview} />
        </div>

        {grouped && (
          <>
            <div className="min-w-0 xl:col-span-6">
              <TaskList title="My workload" tasks={grouped.myTasks} />
            </div>
            <div className="min-w-0 xl:col-span-6">
              <TaskList title="Unassigned work" tasks={grouped.unassigned} />
            </div>
            {!!grouped.managerGroups.length && (
              <div className="min-w-0 xl:col-span-12">
                <PeopleWork title="Manager work" groups={grouped.managerGroups} />
              </div>
            )}
            <div className="min-w-0 xl:col-span-12">
              <PeopleWork title="Employee work" groups={grouped.employeeGroups} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
