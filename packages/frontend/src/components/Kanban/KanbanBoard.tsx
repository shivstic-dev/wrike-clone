import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { useUpdateTask } from '../../api/tasks';
import { TASK_STATUS } from '../../api/enums';
import type { Task } from '@wrike-clone/shared';
import toast from 'react-hot-toast';

interface KanbanBoardProps {
  tasks: Task[];
}

const COLUMNS: { status: string; title: string; color: string }[] = [
  { status: TASK_STATUS.TODO, title: 'To Do', color: 'bg-slate-500' },
  { status: TASK_STATUS.IN_PROGRESS, title: 'In Progress', color: 'bg-blue-500' },
  { status: TASK_STATUS.COMPLETED, title: 'Completed', color: 'bg-green-500' },
  { status: TASK_STATUS.BLOCKED, title: 'Blocked', color: 'bg-red-500' },
];

export function KanbanBoard({ tasks }: KanbanBoardProps) {
  const updateTask = useUpdateTask();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const columns = COLUMNS.map((col) => ({
    ...col,
    status: col.status as Task['status'],
    tasks: tasks
      .filter((t) => t.status === col.status)
      .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)),
  }));

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = event.active.id as string;
      const task = tasks.find((t) => t.id === taskId);
      if (task) setActiveTask(task);
    },
    [tasks],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveTask(null);

      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const targetStatus = over.id as Task['status'];
      const task = tasks.find((t) => t.id === taskId);

      if (!task || task.status === targetStatus) return;

      try {
        await updateTask.mutateAsync({ id: taskId, status: targetStatus });
        toast.success(`Moved to ${targetStatus.replace('_', ' ')}`);
      } catch {
        toast.error('Failed to update task status');
      }
    },
    [tasks, updateTask],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {columns.map((col) => (
          <div key={col.status} className="min-w-[280px] flex-1">
            <KanbanColumn
              status={col.status}
              title={col.title}
              tasks={col.tasks}
              color={col.color}
            />
          </div>
        ))}
      </div>

      <DragOverlay>{activeTask ? <TaskCard task={activeTask} /> : null}</DragOverlay>
    </DndContext>
  );
}
