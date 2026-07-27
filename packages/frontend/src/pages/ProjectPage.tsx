import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../api/workspaces';
import { useTasks } from '../api/tasks';
import { TaskTable } from '../components/Table/TaskTable';
import { KanbanBoard } from '../components/Kanban/KanbanBoard';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { GanttChart } from '../components/Gantt/GanttChart';
import { CalendarView } from '../components/Calendar/CalendarView';
import { clsx } from 'clsx';

type Tab = 'tasks' | 'board' | 'timeline' | 'calendar' | 'files';

const tabs: { key: Tab; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'board', label: 'Board' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'files', label: 'Files' },
];

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId!);
  const { data: tasksData, isLoading: tasksLoading, error: tasksError, refetch } = useTasks({
    projectId: projectId!,
    perPage: 100,
  });
  const [activeTab, setActiveTab] = useState<Tab>('tasks');

  if (projectLoading) {
    return <LoadingSpinner className="mt-20" size="lg" />;
  }

  if (projectError || tasksError) {
    return (
      <div className="p-6">
        <ErrorDisplay message="Failed to load project" onRetry={() => refetch()} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <ErrorDisplay title="Project not found" message="This project does not exist or you don't have access." />
      </div>
    );
  }

  const tasks = tasksData?.data || [];

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{project.name || project.folderId}</h1>
            {project.dueDate && (
              <p className="mt-1 text-sm text-slate-500">
                Due {new Date(project.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
          <span
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium',
              project.status === 'active' && 'bg-green-100 text-green-700',
              project.status === 'on_hold' && 'bg-amber-100 text-amber-700',
              project.status === 'completed' && 'bg-blue-100 text-blue-700',
              project.status === 'cancelled' && 'bg-red-100 text-red-700',
            )}
          >
            {project.status.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={clsx(
                'border-b-2 px-1 pb-3 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'tasks' && (
        <div>
          {tasks.length > 0 ? (
            <TaskTable tasks={tasks} isLoading={tasksLoading} />
          ) : (
            <EmptyState title="No tasks yet" description="Tasks will appear here once they are created." />
          )}
        </div>
      )}

      {activeTab === 'board' && (
        <div>
          {tasks.length > 0 ? (
            <KanbanBoard tasks={tasks} />
          ) : (
            <EmptyState title="No tasks to display" description="Add tasks to see them on the board." />
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div>
          {tasks.length > 0 ? (
            <GanttChart tasks={tasks} />
          ) : (
            <EmptyState title="No tasks to display" description="Add tasks to see them on the timeline." />
          )}
        </div>
      )}

      {activeTab === 'calendar' && (
        <div>
          {tasks.length > 0 ? (
            <CalendarView tasks={tasks} />
          ) : (
            <EmptyState title="No tasks to display" description="Add tasks to see them on the calendar." />
          )}
        </div>
      )}

      {activeTab === 'files' && (
        <EmptyState title="Files" description="Upload and manage project files here." />
      )}
    </div>
  );
}
