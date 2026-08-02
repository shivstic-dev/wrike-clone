import { useParams, useNavigate } from 'react-router-dom';
import { TASK_STATUS } from '../api/enums';
import type { Task } from '@wrike-clone/shared';
import { useTask } from '../api/tasks';
import { useUpdateTask } from '../hooks/useUpdateTask';
import type { UpdateTaskRequest } from '@wrike-clone/shared';
import { TaskForm } from '../components/Task/TaskForm';
import { CommentSection } from '../components/Comments/CommentSection';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { useWorkspaceMembers, useWorkspaces } from '../api/workspaces';
import { useAuth } from '../contexts/AuthContext';
import { useMoveTaskLocation, useTaskLocations } from '../api/task-locations';
import { useTaskCompletionFlow } from '../components/Task/useTaskCompletionFlow';
import { HandoffCompletionDialog } from '../components/Task/HandoffCompletionDialog';

const statusOptions: { value: string; label: string }[] = [
  { value: TASK_STATUS.TODO, label: 'To Do' },
  { value: TASK_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: TASK_STATUS.COMPLETED, label: 'Completed' },
  { value: TASK_STATUS.BLOCKED, label: 'Blocked' },
];

function TaskLocationEditor({ task }: { task: Task }) {
  const { data: locations = [], isLoading, isError } = useTaskLocations(task.departmentId);
  const moveLocation = useMoveTaskLocation();
  const [selectedFolderId, setSelectedFolderId] = useState(task.folderId || '');
  const [selectedProjectId, setSelectedProjectId] = useState(
    task.isSystemProject ? '' : task.projectId,
  );
  const selectedLocation = locations.find(
    (location) => location.folderId === selectedFolderId,
  );

  async function handleFolderChange(folderId: string) {
    if (!folderId || folderId === selectedFolderId) return;
    try {
      await moveLocation.mutateAsync({ taskId: task.id, folderId });
      setSelectedFolderId(folderId);
      setSelectedProjectId('');
      toast.success('Task moved');
    } catch {
      toast.error('Task could not be moved. Try again.');
    }
  }

  async function handleProjectChange(projectId: string) {
    if (!selectedFolderId || projectId === selectedProjectId) return;
    try {
      await moveLocation.mutateAsync({
        taskId: task.id,
        folderId: selectedFolderId,
        projectId: projectId || undefined,
      });
      setSelectedProjectId(projectId);
      toast.success('Task moved');
    } catch {
      toast.error('Task could not be moved. Try again.');
    }
  }

  return (
    <section
      className="card mb-6 overflow-hidden"
      aria-labelledby="task-location-heading"
    >
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
          Task home
        </p>
        <h2 id="task-location-heading" className="mt-0.5 text-sm font-semibold text-slate-800">
          Location
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="task-location-department">
            Department
          </label>
          <input
            id="task-location-department"
            className="input text-sm"
            value={task.departmentName || task.departmentId}
            readOnly
          />
        </div>
        <div>
          <label className="label" htmlFor="task-location-folder">
            Folder
          </label>
          <select
            id="task-location-folder"
            className="input text-sm"
            value={selectedFolderId}
            onChange={(event) => void handleFolderChange(event.target.value)}
            disabled={isLoading || moveLocation.isPending}
          >
            {!locations.some((location) => location.folderId === selectedFolderId) &&
              selectedFolderId && (
                <option value={selectedFolderId}>{task.folderName || 'Current folder'}</option>
              )}
            {locations.map((location) => (
              <option key={location.folderId} value={location.folderId}>
                {location.folderName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="task-location-project">
            Project
          </label>
          <select
            id="task-location-project"
            className="input text-sm"
            value={selectedProjectId}
            onChange={(event) => void handleProjectChange(event.target.value)}
            disabled={!selectedLocation || isLoading || moveLocation.isPending}
          >
            <option value="">General Tasks</option>
            {(selectedLocation?.projects || []).map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.projectName}
              </option>
            ))}
          </select>
        </div>
      </div>
      {isError && (
        <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          Available folders could not be loaded. Try refreshing the page.
        </p>
      )}
      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
        Changing folders first places the task in that folder&apos;s General Tasks list.
      </p>
    </section>
  );
}

export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { data: task, isLoading, error, refetch } = useTask(taskId!);
  const updateTask = useUpdateTask();
  const { data: departments = [] } = useWorkspaces();
  const { data: departmentMembers = [] } = useWorkspaceMembers(task?.departmentId || '');
  const { user, membership } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const { requestCompletion, dialogProps } = useTaskCompletionFlow();

  const completeWithHandoff = async (taskToComplete: Task) => {
    const completedTask = await requestCompletion(taskToComplete);
    if (!completedTask) return false;

    if (completedTask.handoffStatus === 'ready') {
      toast.success('Saved in Ready for handoff');
    } else {
      toast.success('Handoff confirmed and task completed');
    }
    return true;
  };

  const handleStatusChange = async (status: string) => {
    try {
      if (!task) return;
      if (status === TASK_STATUS.COMPLETED) {
        await completeWithHandoff(task);
        return;
      }
      await updateTask.mutateAsync({ id: taskId!, status: status as Task['status'] });
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleUpdateTask = async (values: Partial<Task>) => {
    try {
      if (!task) return;
      const { id: _id, status, ...changes } = values;
      if (status === TASK_STATUS.COMPLETED && task?.status !== TASK_STATUS.COMPLETED) {
        const taskToComplete = Object.keys(changes).length
          ? await updateTask.mutateAsync({ id: taskId!, ...changes } as UpdateTaskRequest & {
              id: string;
            })
          : task;
        await completeWithHandoff(taskToComplete);
      } else {
        await updateTask.mutateAsync({
          id: taskId!,
          ...changes,
          ...(status && status !== TASK_STATUS.COMPLETED ? { status } : {}),
        } as UpdateTaskRequest & { id: string });
        toast.success('Task updated');
      }
      setIsEditing(false);
    } catch {
      toast.error('Failed to update task');
    }
  };

  if (isLoading) {
    return <LoadingSpinner className="mt-20" size="lg" />;
  }

  if (error || !task) {
    return (
      <div className="p-6">
        <ErrorDisplay
          title="Task not found"
          message="This task does not exist or you don't have access."
          onRetry={() => refetch()}
        />
      </div>
    );
  }
  const departmentRole = departments.find(
    (department) => department.id === task.departmentId,
  )?.departmentRole;
  const canSetVisibility = departmentRole === 'admin' || departmentRole === 'department_head';
  const canManage =
    membership?.role === 'admin' ||
    departmentRole === 'admin' ||
    departmentRole === 'manager' ||
    departmentRole === 'department_head';
  const canChangeStatus =
    canManage ||
    task.assigneeId === user?.id ||
    task.assignees?.some((assignee) => assignee.userId === user?.id);
  const assignableMembers =
    departmentRole === 'manager'
      ? departmentMembers.filter(
          (member) => member.role === 'employee' || member.userId === user?.id,
        )
      : departmentMembers;
  const handoffConfirmer = task.handoffConfirmedBy
    ? departmentMembers.find((member) => member.userId === task.handoffConfirmedBy) ||
      (user?.id === task.handoffConfirmedBy ? user : undefined)
    : undefined;
  const handoffConfirmerName =
    handoffConfirmer?.displayName || handoffConfirmer?.email || 'A team member';

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Back link */}
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
          />
        </svg>
        Back
      </button>

      {isEditing ? (
        <div className="card p-6">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Edit Task</h2>
          <TaskForm
            initialValues={task}
            canSetVisibility={canSetVisibility}
            assignees={assignableMembers}
            onSubmit={handleUpdateTask}
            onCancel={() => setIsEditing(false)}
          />
        </div>
      ) : (
        <>
          {/* Title and actions */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <h1 className="text-2xl font-bold text-slate-900">{task.title}</h1>
              {canManage && (
                <button onClick={() => setIsEditing(true)} className="btn-ghost btn-sm">
                  Edit
                </button>
              )}
            </div>
            {task.description && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{task.description}</p>
            )}
          </div>

          {/* Status and Priority */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            <div>
              <label className="label" htmlFor="task-status">Status</label>
              <select
                id="task-status"
                value={task.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="input text-sm"
                disabled={!canChangeStatus}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <p
                className={clsx('mt-1 text-sm font-medium capitalize', `priority-${task.priority}`)}
              >
                {task.priority}
              </p>
            </div>
            <div>
              <label className="label">Assignees</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {task.assignees && task.assignees.length > 0 ? (
                  task.assignees.map((assignee) => (
                    <span
                      key={assignee.id || assignee.userId}
                      className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700"
                    >
                      {assignee.displayName || assignee.email || 'Team member'}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-slate-500">Unassigned</span>
                )}
              </div>
            </div>
          </div>

          <section className="card mb-6 border-atlas-mist p-4" aria-labelledby="handoff-status-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-atlas-current">
              Final handoff
            </p>
            <h2 id="handoff-status-heading" className="mt-1 text-sm font-semibold text-atlas-ink">
              {task.handoffStatus === 'confirmed'
                ? 'Handoff confirmed'
                : task.handoffStatus === 'ready'
                  ? 'Ready for handoff'
                  : task.handoffRequired
                    ? 'Confirmation required before completion'
                    : 'Handoff confirmation not required'}
            </h2>
            <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">Task owner</dt>
                <dd className="font-medium text-slate-700">
                  {task.handoffOwner?.displayName || task.handoffOwner?.email || 'Not assigned'}
                </dd>
              </div>
              {task.handoffConfirmedBy && (
                <div>
                  <dt className="text-slate-400">Confirmed by</dt>
                  <dd className="font-medium text-slate-700">{handoffConfirmerName}</dd>
                </div>
              )}
              {task.handoffConfirmedAt && (
                <div>
                  <dt className="text-slate-400">Confirmed at</dt>
                  <dd className="font-medium text-slate-700">
                    {format(new Date(task.handoffConfirmedAt), 'MMM d, yyyy, h:mm a')}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Dates */}
          <div className="mb-6 grid grid-cols-3 gap-4 text-sm">
            {task.startDate && (
              <div>
                <span className="text-slate-400">Start:</span>{' '}
                <span className="text-slate-700">
                  {format(new Date(task.startDate), 'MMM d, yyyy')}
                </span>
              </div>
            )}
            {task.dueDate && (
              <div>
                <span className="text-slate-400">Due:</span>{' '}
                <span className="text-slate-700">
                  {format(new Date(task.dueDate), 'MMM d, yyyy')}
                </span>
              </div>
            )}
            {task.estimatedHours != null && (
              <div>
                <span className="text-slate-400">Est. hours:</span>{' '}
                <span className="text-slate-700">{task.estimatedHours}</span>
              </div>
            )}
          </div>

          {/* Time tracking */}
          <div className="card mb-6 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Time Tracking</h3>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="text-slate-400">Estimated:</span>{' '}
                <span className="font-medium text-slate-700">{task.estimatedHours || 0}h</span>
              </div>
              <div>
                <span className="text-slate-400">Logged:</span>{' '}
                <span className="font-medium text-slate-700">{task.actualHours || 0}h</span>
              </div>
            </div>
          </div>

          {canManage && <TaskLocationEditor key={task.id} task={task} />}

          {/* Comments section */}
          <CommentSection taskId={task.id} />
        </>
      )}
      <HandoffCompletionDialog {...dialogProps} />
    </div>
  );
}
