import { useState, type FormEvent } from 'react';
import { TASK_STATUS, TASK_PRIORITY } from '../../api/enums';
import type { Task, CreateTaskRequest } from '@wrike-clone/shared';

interface TaskFormProps {
  initialValues?: Partial<Task>;
  projectId?: string;
  onSubmit: (values: Partial<Task> | CreateTaskRequest) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  canSetVisibility?: boolean;
  assignees?: Array<{
    userId: string;
    displayName: string;
    email: string;
    role?: 'admin' | 'employee' | 'manager' | 'department_head';
  }>;
}

const statusOptions: { value: string; label: string }[] = [
  { value: TASK_STATUS.TODO, label: 'To Do' },
  { value: TASK_STATUS.IN_PROGRESS, label: 'In Progress' },
  { value: TASK_STATUS.COMPLETED, label: 'Completed' },
  { value: TASK_STATUS.BLOCKED, label: 'Blocked' },
];

const priorityOptions: { value: string; label: string }[] = [
  { value: TASK_PRIORITY.LOW, label: 'Low' },
  { value: TASK_PRIORITY.MEDIUM, label: 'Medium' },
  { value: TASK_PRIORITY.HIGH, label: 'High' },
  { value: TASK_PRIORITY.CRITICAL, label: 'Critical' },
];

export function TaskForm({
  initialValues,
  projectId,
  onSubmit,
  onCancel,
  isSubmitting = false,
  canSetVisibility = false,
  assignees = [],
}: TaskFormProps) {
  const [title, setTitle] = useState(initialValues?.title || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [status, setStatus] = useState<string>(initialValues?.status || TASK_STATUS.TODO);
  const [priority, setPriority] = useState<string>(initialValues?.priority || TASK_PRIORITY.MEDIUM);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    initialValues?.assignees?.map((assignee) => assignee.userId) ||
      (initialValues?.assigneeId ? [initialValues.assigneeId] : []),
  );
  const [assigneesChanged, setAssigneesChanged] = useState(false);
  const [estimatedHours, setEstimatedHours] = useState<number | null>(
    initialValues?.estimatedHours ?? null,
  );
  const [startDate, setStartDate] = useState(initialValues?.startDate?.split('T')[0] || '');
  const [dueDate, setDueDate] = useState(initialValues?.dueDate?.split('T')[0] || '');
  const [visibility, setVisibility] = useState<Task['visibility']>(
    initialValues?.visibility || 'department',
  );
  const [handoffRequired, setHandoffRequired] = useState<boolean>(
    initialValues?.handoffRequired ?? true,
  );
  const assignableAssignees = assignees.filter((assignee) => assignee.role !== 'admin');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await onSubmit({
      ...(initialValues?.id ? { id: initialValues.id } : {}),
      title: title.trim(),
      description: description.trim() || undefined,
      status: status as Task['status'],
      priority: priority as Task['priority'],
      ...(!initialValues?.id || assigneesChanged ? { assigneeIds } : {}),
      estimatedHours: estimatedHours ?? undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      ...(canSetVisibility ? { visibility } : {}),
      handoffRequired,
      projectId: projectId || initialValues?.projectId,
    } as Partial<Task>);
  };


  const inputClasses =
    'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-slate-50 disabled:text-slate-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="label">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          className={inputClasses}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          required
        />
      </div>

      {canSetVisibility && (
        <div>
          <label htmlFor="visibility" className="label">
            Visibility
          </label>
          <select
            id="visibility"
            className={inputClasses}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as Task['visibility'])}
          >
            <option value="department">Department only</option>
            <option value="global">Global (all departments)</option>
          </select>
        </div>
      )}

      <div>
        <label htmlFor="description" className="label">
          Description
        </label>
        <textarea
          id="description"
          rows={4}
          className={`${inputClasses} resize-none`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add a description..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="status" className="label">
            Status
          </label>
          <select
            id="status"
            className={inputClasses}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="priority" className="label">
            Priority
          </label>
          <select
            id="priority"
            className={inputClasses}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {priorityOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="label">
            Start date
          </label>
          <input
            id="startDate"
            type="date"
            className={inputClasses}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="dueDate" className="label">
            Due date
          </label>
          <input
            id="dueDate"
            type="date"
            className={inputClasses}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="assigneeIds" className="label">
            Assignees
          </label>
          <select
            id="assigneeIds"
            className={inputClasses}
            value={assigneeIds}
            multiple
            size={Math.min(Math.max(assignableAssignees.length, 3), 6)}
            onChange={(event) => {
              setAssigneeIds(
                Array.from(event.currentTarget.selectedOptions, (option) => option.value),
              );
              setAssigneesChanged(true);
            }}
          >
            {assignableAssignees.map((assignee) => (
              <option key={assignee.userId} value={assignee.userId}>
                {assignee.displayName || assignee.email}
                {assignee.role ? ` (${assignee.role.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Hold Ctrl (Windows) or Command (Mac) to select more than one person.
          </p>
        </div>

        <div>
          <label htmlFor="estimatedHours" className="label">
            Estimated hours
          </label>
          <input
            id="estimatedHours"
            type="number"
            min={0}
            step={0.5}
            className={inputClasses}
            value={estimatedHours ?? ''}
            onChange={(e) => setEstimatedHours(e.target.value ? Number(e.target.value) : null)}
            placeholder="0"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <input
          id="handoffRequired"
          type="checkbox"
          checked={handoffRequired}
          onChange={(e) => setHandoffRequired(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
        />
        <div>
          <label htmlFor="handoffRequired" className="text-sm font-medium text-slate-800">
            Final handoff required
          </label>
          <p className="text-xs text-slate-500">
            OpenWork only asks for confirmation; it does not store or send the work.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        <button type="submit" disabled={!title.trim() || isSubmitting} className="btn-primary">
          {isSubmitting ? 'Saving...' : initialValues?.id ? 'Update task' : 'Create task'}
        </button>
      </div>
    </form>
  );
}
