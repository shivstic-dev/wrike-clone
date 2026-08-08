import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { clsx } from 'clsx';
import { TaskCard } from './TaskCard';
import type { Task, TaskStatus } from '@wrike-clone/shared';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  color: string;
  canMoveTask?: (task: Task) => boolean;
  getReadOnlyReason?: (task: Task) => string;
}

const columnColors: Record<string, string> = {
  todo: 'border-t-slate-400',
  in_progress: 'border-t-blue-500',
  completed: 'border-t-green-500',
  blocked: 'border-t-red-500',
};

const columnBg: Record<string, string> = {
  todo: 'bg-slate-50',
  in_progress: 'bg-blue-50/50',
  completed: 'bg-green-50/50',
  blocked: 'bg-red-50/50',
};

const allowTaskMovement = () => true;

export function KanbanColumn({
  status,
  title,
  tasks,
  color,
  canMoveTask = allowTaskMovement,
  getReadOnlyReason,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status },
  });

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'flex flex-col rounded-xl border border-slate-200 border-t-4 transition-colors',
        columnColors[status] || 'border-t-slate-400',
        columnBg[status],
        isOver && 'bg-primary-50/50 ring-2 ring-primary-200',
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className={clsx('h-2.5 w-2.5 rounded-full', color)} />
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
        </div>
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">
          {tasks.length}
        </span>
      </div>

      {/* Tasks */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 px-3 pb-3">
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400">Drop tasks here</p>
          ) : (
            tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                readOnly={!canMoveTask(task)}
                readOnlyReason={getReadOnlyReason?.(task)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}
