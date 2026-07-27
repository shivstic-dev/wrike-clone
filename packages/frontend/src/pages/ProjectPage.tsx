import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject, useWorkspaceMembers, useWorkspaces } from '../api/workspaces';
import { useCreateTask, useTasks } from '../api/tasks';
import { TaskTable } from '../components/Table/TaskTable';
import { KanbanBoard } from '../components/Kanban/KanbanBoard';
import { TaskForm } from '../components/Task/TaskForm';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import type { CreateTaskRequest, Task } from '@wrike-clone/shared';
import toast from 'react-hot-toast';

type Tab = 'tasks' | 'board';

const tabs: { key: Tab; label: string }[] = [
  { key: 'tasks', label: 'Tasks' },
  { key: 'board', label: 'Board' },
];

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading, error: projectError } = useProject(projectId!);
  const {
    data: tasksData,
    isLoading: tasksLoading,
    error: tasksError,
    refetch,
  } = useTasks({
    projectId: projectId!,
    perPage: 100,
  });
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [showCreateTask, setShowCreateTask] = useState(false);
  const createTask = useCreateTask();
  const { data: departments = [] } = useWorkspaces();
  const { data: departmentMembers = [] } = useWorkspaceMembers(project?.departmentId || '');
  const { membership } = useAuth();

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
        <ErrorDisplay
          title="Project not found"
          message="This project does not exist or you don't have access."
        />
      </div>
    );
  }

  const tasks = tasksData?.data || [];
  const departmentRole = departments.find(
    (department) => department.id === project.departmentId,
  )?.departmentRole;
  const canCreate =
    membership?.role === 'admin' ||
    membership?.role === 'manager' ||
    departmentRole === 'admin' ||
    departmentRole === 'manager' ||
    departmentRole === 'department_head';
  const canSetVisibility = departmentRole === 'admin' || departmentRole === 'department_head';

  async function handleCreateTask(values: Partial<Task> | CreateTaskRequest) {
    try {
      await createTask.mutateAsync({
        ...(values as CreateTaskRequest),
        projectId: projectId!,
      });
      toast.success('Task created');
      setShowCreateTask(false);
    } catch {
      toast.error('Task creation failed');
    }
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {project.name || project.folderId}
            </h1>
            {project.dueDate && (
              <p className="mt-1 text-sm text-slate-500">
                Due {new Date(project.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
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
            {canCreate && (
              <button className="btn-primary" onClick={() => setShowCreateTask(true)}>
                Create task
              </button>
            )}
          </div>
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
            <EmptyState
              title="No tasks yet"
              description="Tasks will appear here once they are created."
            />
          )}
        </div>
      )}

      {activeTab === 'board' && (
        <div>
          {tasks.length > 0 ? (
            <KanbanBoard tasks={tasks} />
          ) : (
            <EmptyState
              title="No tasks to display"
              description="Add tasks to see them on the board."
            />
          )}
        </div>
      )}

      {showCreateTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Create task</h2>
            <TaskForm
              projectId={projectId}
              assignees={departmentMembers}
              canSetVisibility={canSetVisibility}
              isSubmitting={createTask.isPending}
              onSubmit={handleCreateTask}
              onCancel={() => setShowCreateTask(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
