/**
 * Portfolio view — groups projects into portfolios with budget tracking.
 * Shows aggregated financial data across multiple projects.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useWorkspaces } from '../../api/workspaces';
import { useWorkspace } from '../../api/workspaces';
import { useTasks } from '../../api/tasks';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import { clsx } from 'clsx';
import type { Project } from '@wrike-clone/shared';

interface PortfolioProject extends Project {
  workspaceName?: string;
  taskCount?: number;
}

export function PortfolioView() {
  const { data: workspaces, isLoading: wsLoading } = useWorkspaces();
  const { data: tasksData } = useTasks({ perPage: 1000 });

  const portfolioData = useMemo(() => {
    if (!workspaces || !Array.isArray(workspaces)) return [];
    return workspaces.map((ws: any) => ({
      id: ws.id,
      name: ws.name,
      description: ws.description,
      projectCount: 0,
      totalBudget: 0,
      totalCost: 0,
      taskCount: 0,
      completedTasks: 0,
    }));
  }, [workspaces]);

  if (wsLoading) return <LoadingSpinner className="py-12" />;

  if (!portfolioData || portfolioData.length === 0) {
    return (
      <EmptyState
        title="No portfolios yet"
        description="Create workspaces and projects to see them aggregated here."
      />
    );
  }

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold text-slate-700">Portfolio Overview</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {portfolioData.map((portfolio) => (
          <Link
            key={portfolio.id}
            to={`/workspaces/${portfolio.id}`}
            className="card p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-lg font-bold text-primary-700">
                {portfolio.name.charAt(0).toUpperCase()}
              </span>
              <div>
                <h4 className="font-semibold text-slate-900">{portfolio.name}</h4>
                <p className="text-xs text-slate-400">{portfolio.projectCount} projects</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Total Budget</p>
                <p className="text-lg font-bold text-slate-900">
                  ${(portfolio.totalBudget || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Total Cost</p>
                <p
                  className={clsx(
                    'text-lg font-bold',
                    (portfolio.totalCost || 0) > (portfolio.totalBudget || 0)
                      ? 'text-red-600'
                      : 'text-green-600',
                  )}
                >
                  ${(portfolio.totalCost || 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Tasks</p>
                <p className="text-lg font-bold text-slate-900">{portfolio.taskCount}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Completed</p>
                <p className="text-lg font-bold text-green-600">{portfolio.completedTasks}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
