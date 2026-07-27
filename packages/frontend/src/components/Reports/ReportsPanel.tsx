/**
 * Reports & Charts panel.
 * Custom report builder with task metrics, charts, and exportable summaries.
 */
import { useState, useMemo } from 'react';
import { useTasks } from '../../api/tasks';
import { useWorkspaces } from '../../api/workspaces';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import { clsx } from 'clsx';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import type { Task } from '@wrike-clone/shared';

interface ReportMetric {
  label: string;
  value: number | string;
  color: string;
}

function StatCard({ label, value, color }: ReportMetric) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={clsx('mt-1 text-2xl font-bold', color)}>{value}</p>
    </div>
  );
}

export function ReportsPanel() {
  const { data: tasksData, isLoading } = useTasks({ perPage: 1000 });
  const { data: workspaces } = useWorkspaces();

  const metrics = useMemo(() => {
    const tasks = tasksData?.data || [];

    const total = tasks.length;
    const completed = tasks.filter((t: Task) => t.status === 'done').length;
    const inProgress = tasks.filter((t: Task) => t.status === 'in_progress').length;
    const overdue = tasks.filter((t: Task) =>
      t.dueDate && new Date(t.dueDate) < new Date() &&
      t.status !== 'done' && t.status !== 'cancelled'
    ).length;

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Tasks by priority
    const byPriority = {
      urgent: tasks.filter((t: Task) => t.priority === 'urgent').length,
      high: tasks.filter((t: Task) => t.priority === 'high').length,
      medium: tasks.filter((t: Task) => t.priority === 'medium').length,
      low: tasks.filter((t: Task) => t.priority === 'low').length,
    };

    // Tasks by status
    const byStatus = {
      backlog: tasks.filter((t: Task) => t.status === 'backlog').length,
      todo: tasks.filter((t: Task) => t.status === 'todo').length,
      inProgress: tasks.filter((t: Task) => t.status === 'in_progress').length,
      inReview: tasks.filter((t: Task) => t.status === 'in_review').length,
      done: completed,
      cancelled: tasks.filter((t: Task) => t.status === 'cancelled').length,
    };

    return { total, completed, inProgress, overdue, completionRate, byPriority, byStatus };
  }, [tasksData]);

  if (isLoading) return <LoadingSpinner className="py-12" />;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Tasks" value={metrics.total} color="text-slate-900" />
        <StatCard label="Completed" value={metrics.completed} color="text-green-600" />
        <StatCard label="In Progress" value={metrics.inProgress} color="text-blue-600" />
        <StatCard label="Overdue" value={metrics.overdue} color="text-red-600" />
      </div>

      {/* Completion rate */}
      <div className="card p-4">
        <h4 className="mb-3 text-sm font-semibold text-slate-700">Completion Rate</h4>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20">
            <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e2e8f0" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.5" fill="none" stroke="#22c55e" strokeWidth="3"
                strokeDasharray={`${metrics.completionRate * 0.97} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-slate-700">
              {metrics.completionRate}%
            </span>
          </div>
          <div className="flex-1 space-y-2">
            {[
              { label: 'Completed', value: metrics.completed, total: metrics.total, color: 'bg-green-500' },
              { label: 'In Progress', value: metrics.inProgress, total: metrics.total, color: 'bg-blue-500' },
              { label: 'To Do', value: metrics.byStatus.todo, total: metrics.total, color: 'bg-slate-400' },
              { label: 'Backlog', value: metrics.byStatus.backlog, total: metrics.total, color: 'bg-slate-300' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                <div className={clsx('h-2 w-2 rounded-full', item.color)} />
                <span className="w-20 text-slate-500">{item.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={clsx('h-full rounded-full transition-all', item.color)}
                    style={{ width: `${item.total > 0 ? (item.value / item.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-10 text-right text-slate-600">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Tasks by Priority</h4>
          <div className="space-y-2">
            {[
              { label: 'Urgent', value: metrics.byPriority.urgent, color: 'bg-red-500' },
              { label: 'High', value: metrics.byPriority.high, color: 'bg-amber-500' },
              { label: 'Medium', value: metrics.byPriority.medium, color: 'bg-blue-500' },
              { label: 'Low', value: metrics.byPriority.low, color: 'bg-slate-400' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <div className={clsx('h-2.5 w-2.5 rounded-full', item.color)} />
                <span className="w-16 text-slate-600">{item.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100">
                  <div
                    className={clsx('h-full rounded-full', item.color)}
                    style={{ width: `${metrics.total > 0 ? (item.value / metrics.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-4">
          <h4 className="mb-3 text-sm font-semibold text-slate-700">Tasks by Status</h4>
          <div className="space-y-2">
            {[
              { label: 'Backlog', value: metrics.byStatus.backlog, color: 'bg-slate-300' },
              { label: 'To Do', value: metrics.byStatus.todo, color: 'bg-slate-500' },
              { label: 'In Progress', value: metrics.byStatus.inProgress, color: 'bg-blue-500' },
              { label: 'In Review', value: metrics.byStatus.inReview, color: 'bg-amber-500' },
              { label: 'Done', value: metrics.byStatus.done, color: 'bg-green-500' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-sm">
                <div className={clsx('h-2.5 w-2.5 rounded-full', item.color)} />
                <span className="w-20 text-slate-600">{item.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100">
                  <div
                    className={clsx('h-full rounded-full', item.color)}
                    style={{ width: `${metrics.total > 0 ? (item.value / metrics.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-slate-500">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
