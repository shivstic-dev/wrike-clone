import { useDraggable } from '@dnd-kit/core';
import { clsx } from 'clsx';
import type { Task, TaskPriority } from '@wrike-clone/shared';
import { Link } from 'react-router-dom';

interface TaskCardProps {
  task: Task;
  readOnly?: boolean;
  readOnlyReason?: string;
}

const priorityClass: Record<TaskPriority, string> = {
  low: 'border-l-slate-400',
  medium: 'border-l-blue-500',
  high: 'border-l-amber-500',
  critical: 'border-l-red-500',
};

export function TaskCard({ task, readOnly = false, readOnlyReason }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: readOnly,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;
  const readOnlyReasonId =
    readOnly && readOnlyReason ? `task-${task.id}-read-only-reason` : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly ? {} : listeners)}
      {...(readOnly ? {} : attributes)}
      className={clsx(
        'rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm transition-shadow',
        readOnly ? 'cursor-default' : 'cursor-grab',
        'border-l-4',
        priorityClass[task.priority],
        isDragging && 'z-50 shadow-lg opacity-90',
        'hover:shadow-md',
      )}
    >
      <Link
        to={`/tasks/${task.id}`}
        aria-describedby={readOnlyReasonId}
        className="block"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-sm font-medium text-slate-900 line-clamp-2">{task.title}</p>
          {task.visibility === 'global' && (
            <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-800">
              Global
            </span>
          )}
          {readOnly && (
            <span
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600"
              title={readOnlyReason}
            >
              View only
            </span>
          )}
        </div>
      </Link>

      {readOnlyReasonId && (
        <span className="sr-only" id={readOnlyReasonId}>
          {readOnlyReason}
        </span>
      )}

      <div className="mt-2 flex items-center gap-2">
        {task.assigneeId && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            {task.assigneeId.charAt(0).toUpperCase()}
          </span>
        )}
        {task.dueDate && (
          <span
            className={clsx(
              'text-xs',
              new Date(task.dueDate) < new Date() && task.status !== 'completed'
                ? 'font-medium text-red-500'
                : 'text-slate-400',
            )}
          >
            {new Date(task.dueDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
        {task.estimatedHours != null && (
          <span className="ml-auto text-xs text-slate-400">{task.estimatedHours}h</span>
        )}
      </div>
    </div>
  );
}
