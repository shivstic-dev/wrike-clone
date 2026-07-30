import { useState } from 'react';
import type { TimelineTask } from '@wrike-clone/shared';

export interface UnscheduledTasksPanelProps {
  tasks: TimelineTask[];
  onOpenTask(taskId: string): void;
  onScheduleChange(task: TimelineTask, next: { startDate: string; dueDate: string }): void;
}

function UnscheduledTask({
  task,
  onOpenTask,
  onScheduleChange,
}: {
  task: TimelineTask;
  onOpenTask(taskId: string): void;
  onScheduleChange(task: TimelineTask, next: { startDate: string; dueDate: string }): void;
}) {
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const datesValid = Boolean(startDate && dueDate && dueDate >= startDate);

  return (
    <li className="unscheduled-task" data-unscheduled-task={task.id}>
      <button type="button" className="unscheduled-task__identity" onClick={() => onOpenTask(task.id)}>
        <strong>{task.title}</strong>
        <span>{task.projectName || 'No project'} · {task.departmentName || 'Department work'}</span>
      </button>
      {task.capabilities.canEditSchedule ? (
        <div className="unscheduled-task__schedule" aria-label={`Schedule ${task.title}`}>
          <label>
            <span>Start</span>
            <input
              type="date"
              aria-label={`Start date for ${task.title}`}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            <span>Due</span>
            <input
              type="date"
              aria-label={`Due date for ${task.title}`}
              min={startDate || undefined}
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!datesValid}
            onClick={() => datesValid && onScheduleChange(task, { startDate, dueDate })}
          >
            Add to timeline
          </button>
        </div>
      ) : (
        <span className="unscheduled-task__read-only">Schedule managed by task owner</span>
      )}
    </li>
  );
}

export function UnscheduledTasksPanel({
  tasks,
  onOpenTask,
  onScheduleChange,
}: UnscheduledTasksPanelProps) {
  return (
    <aside className="unscheduled-panel" aria-labelledby="unscheduled-heading">
      <div className="unscheduled-panel__heading">
        <div>
          <p>Planning inbox</p>
          <h3 id="unscheduled-heading">Unscheduled work</h3>
        </div>
        <span aria-label={`${tasks.length} unscheduled tasks`}>{tasks.length}</span>
      </div>
      {tasks.length ? (
        <ul>
          {tasks.map((task) => (
            <UnscheduledTask
              key={task.id}
              task={task}
              onOpenTask={onOpenTask}
              onScheduleChange={onScheduleChange}
            />
          ))}
        </ul>
      ) : (
        <p className="unscheduled-panel__empty">All visible work has a schedule.</p>
      )}
    </aside>
  );
}
