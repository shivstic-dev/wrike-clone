import {
  AtlasPanel,
  OverviewCore,
  PeopleWork,
  TaskList,
  type RoleCompositionProps,
} from './EmployeeDashboard';

function DepartmentComparison({
  departments,
}: {
  departments: RoleCompositionProps['overview']['departments'];
}) {
  return (
    <AtlasPanel eyebrow="Organization field note" title="Department comparison">
      {departments.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-slate-600">
          No department comparison values are available for this scope.
        </p>
      ) : (
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
            <caption className="sr-only">
              Active, overdue, and completion-rate values by department
            </caption>
            <thead>
              <tr className="border-b border-atlas-mist font-atlasMono text-[0.6875rem] uppercase tracking-[0.08em] text-atlas-current">
                <th scope="col" className="py-3 pr-4 font-medium">
                  Department
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Active
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Overdue
                </th>
                <th scope="col" className="py-3 pl-4 text-right font-medium">
                  Completion rate
                </th>
              </tr>
            </thead>
            <tbody>
              {departments.map((department) => (
                <tr key={department.id} className="border-b border-atlas-mist last:border-0">
                  <th scope="row" className="py-3 pr-4 font-semibold text-atlas-ink">
                    {department.name}
                  </th>
                  <td className="px-4 py-3 text-right font-atlasMono text-atlas-ink">
                    {department.active}
                  </td>
                  <td className="px-4 py-3 text-right font-atlasMono text-[#a74429]">
                    {department.overdue}
                  </td>
                  <td className="py-3 pl-4 text-right font-atlasMono text-atlas-ink">
                    {department.completionRate}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AtlasPanel>
  );
}
function SetupHealth({ overview }: Pick<RoleCompositionProps, 'overview'>) {
  const measures = [
    { label: 'Departments reporting', value: overview.departments.length },
    {
      label: 'Assigned active work',
      value: Math.max(0, overview.totals.active - overview.totals.unassigned),
    },
    { label: 'Unassigned open work', value: overview.totals.unassigned },
    { label: 'People carrying open work', value: overview.capacity.length },
  ];

  return (
    <AtlasPanel eyebrow="Live configuration signals" title="Setup health">
      <dl className="grid grid-cols-2 gap-px bg-atlas-mist">
        {measures.map((measure) => (
          <div key={measure.label} className="bg-white px-5 py-5">
            <dt className="text-xs leading-5 text-slate-500">{measure.label}</dt>
            <dd className="mt-1 font-atlasDisplay text-2xl font-bold tracking-[-0.04em] text-atlas-ink">
              {measure.value}
            </dd>
          </div>
        ))}
      </dl>
    </AtlasPanel>
  );
}

export function AdminDashboard({
  grouped,
  overview,
  onRetryOverview,
}: RoleCompositionProps) {
  return (
    <div className="space-y-4" data-dashboard-role="admin">
      <OverviewCore overview={overview} onRetryOverview={onRetryOverview} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.75fr)]">
        <DepartmentComparison departments={overview.departments} />
        <SetupHealth overview={overview} />
      </div>

      {grouped && (
        <div className="space-y-4">
          <TaskList title="My work" tasks={grouped.myTasks} />
          <PeopleWork title="Manager work" groups={grouped.managerGroups} />
          <PeopleWork title="Employee work" groups={grouped.employeeGroups} />
          <TaskList title="Unassigned work" tasks={grouped.unassigned} />
        </div>
      )}
    </div>
  );
}
