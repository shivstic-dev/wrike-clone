import { useState } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import { useTasks } from '../api/tasks';
import { useWorkspaces } from '../api/workspaces';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import type { ApiResponse, Task } from '@wrike-clone/shared';

// ---- Stat Widget ----

function StatWidget({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-4 p-5">
      <div className={clsx('flex h-12 w-12 items-center justify-center rounded-xl', color)}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

// ---- Recent Activity Widget ----

function RecentActivityWidget() {
  const { data: tasks, isLoading, error } = useTasks({ perPage: 5 });

  if (isLoading) return <LoadingSpinner className="h-full" />;
  if (error) return <ErrorDisplay message="Failed to load recent activity" />;

  const recentTasks = tasks?.data?.slice(0, 5) || [];

  if (recentTasks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        No recent activity
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {recentTasks.map((task: Task) => (
        <div key={task.id} className="flex items-center gap-3 px-5 py-3">
          <div
            className={clsx('h-2 w-2 rounded-full', {
              'bg-green-400': task.status === 'completed',
              'bg-blue-400': task.status === 'in_progress',
              'bg-slate-300': task.status === 'todo',
              'bg-red-400': task.status === 'blocked',
            })}
          />
          <p className="flex-1 truncate text-sm font-medium text-slate-700">{task.title}</p>
          {task.visibility === 'global' && (
            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700">
              Global
            </span>
          )}
          <p className="text-xs text-slate-400">
            {task.updatedAt ? format(new Date(task.updatedAt), 'MMM d') : ''}
          </p>
        </div>
      ))}
    </div>
  );
}

// ---- Widget definitions ----

const widgetLayout = [
  { i: 'task-count', x: 0, y: 0, w: 3, h: 1, static: true },
  { i: 'overdue', x: 3, y: 0, w: 3, h: 1, static: true },
  { i: 'in-progress', x: 6, y: 0, w: 3, h: 1, static: true },
  { i: 'recent-activity', x: 0, y: 1, w: 9, h: 3, static: true },
];

// ---- Main Dashboard Page ----

export default function DashboardPage() {
  const [departmentId, setDepartmentId] = useState('');
  const { data: departments = [] } = useWorkspaces();
  const {
    data: tasksData,
    isLoading,
    error,
    refetch,
  } = useTasks({
    perPage: 100,
    departmentId: departmentId || undefined,
  });

  // Widget calculations
  const totalTasks = tasksData?.data?.length || 0;
  const overdueTasks =
    tasksData?.data?.filter(
      (t: Task) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed',
    ).length || 0;
  const inProgressTasks =
    tasksData?.data?.filter((t: Task) => t.status === 'in_progress').length || 0;

  if (error) {
    return (
      <div className="p-6">
        <ErrorDisplay message="Failed to load dashboard data" onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Department Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Department tasks plus work marked global.</p>
        </div>
        <label className="text-xs font-medium text-slate-600">
          Department
          <select
            className="input mt-1 block min-w-56 text-sm"
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
          >
            <option value="">My accessible departments</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isLoading ? (
        <LoadingSpinner className="mt-20" size="lg" />
      ) : (
        <GridLayout
          className="layout"
          layout={widgetLayout}
          cols={9}
          rowHeight={100}
          width={900}
          isDraggable={false}
          isResizable={false}
          compactType="vertical"
        >
          <div key="task-count">
            <StatWidget
              title="Total Tasks"
              value={totalTasks}
              color="bg-blue-50 text-blue-600"
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
              }
            />
          </div>

          <div key="overdue">
            <StatWidget
              title="Overdue"
              value={overdueTasks}
              color="bg-red-50 text-red-600"
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          </div>

          <div key="in-progress">
            <StatWidget
              title="In Progress"
              value={inProgressTasks}
              color="bg-amber-50 text-amber-600"
              icon={
                <svg
                  className="h-6 w-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
              }
            />
          </div>

          <div key="recent-activity" className="card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-semibold text-slate-700">Recent Activity</h3>
            </div>
            <RecentActivityWidget />
          </div>
        </GridLayout>
      )}
    </div>
  );
}
