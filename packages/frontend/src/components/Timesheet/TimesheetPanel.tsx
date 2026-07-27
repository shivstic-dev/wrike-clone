/**
 * Timesheet & Workload panel.
 * Log time entries against tasks and view workload capacity planning.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { useTasks } from '../../api/tasks';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';

interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  description: string | null;
  loggedDate: string;
  durationMinutes: number;
  isBillable: boolean;
  isLocked: boolean;
  display_name?: string;
}

function LogTimeModal({ taskId, onClose }: { taskId?: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: tasksData } = useTasks({ perPage: 100 });
  const [selectedTaskId, setSelectedTaskId] = useState(taskId || '');
  const [loggedDate, setLoggedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('0');
  const [description, setDescription] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tasks = tasksData?.data || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) {
      toast.error('Please select a task');
      return;
    }

    const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
    if (totalMinutes <= 0) {
      toast.error('Duration must be positive');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post('/time-entries', {
        taskId: selectedTaskId,
        loggedDate,
        durationMinutes: totalMinutes,
        description: description.trim() || undefined,
        isBillable,
      });
      toast.success('Time logged');
      queryClient.invalidateQueries({ queryKey: ['time-entries'] });
      onClose();
    } catch {
      toast.error('Failed to log time');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Log Time</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Task</label>
            <select
              className="input"
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              required
            >
              <option value="">Select a task...</option>
              {tasks.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input"
              value={loggedDate}
              onChange={(e) => setLoggedDate(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Hours</label>
              <input
                type="number"
                className="input"
                min="0"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Minutes</label>
              <input
                type="number"
                className="input"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input resize-none"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isBillable}
              onChange={(e) => setIsBillable(e.target.checked)}
              className="rounded border-slate-300"
            />
            Billable
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Logging...' : 'Log Time'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TimesheetPanel() {
  const queryClient = useQueryClient();
  const [showLogModal, setShowLogModal] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const days = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(), { weekStartsOn: 1 }),
  });

  const { data: entries, isLoading } = useQuery({
    queryKey: ['time-entries', weekOffset],
    queryFn: async () => {
      const { data } = await apiClient.get('/time-entries');
      return (data?.data || []) as TimeEntry[];
    },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Timesheet</h3>
          <p className="text-xs text-slate-400">Log and track time spent on tasks.</p>
        </div>
        <button onClick={() => setShowLogModal(true)} className="btn-primary btn-sm">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Log Time
        </button>
      </div>

      {/* Week navigation */}
      <div className="mb-4 flex items-center gap-3 text-sm">
        <button onClick={() => setWeekOffset((w) => w - 1)} className="btn-ghost btn-sm p-1">
          &larr;
        </button>
        <span className="font-medium text-slate-700">
          {format(weekStart, 'MMM d')} -{' '}
          {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'MMM d, yyyy')}
        </span>
        <button onClick={() => setWeekOffset(0)} className="btn-ghost btn-sm text-xs">
          This week
        </button>
        <button onClick={() => setWeekOffset((w) => w + 1)} className="btn-ghost btn-sm p-1">
          &rarr;
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner className="py-8" />
      ) : !entries || entries.length === 0 ? (
        <EmptyState
          title="No time entries"
          description="Log time against tasks to track your work."
          action={
            <button onClick={() => setShowLogModal(true)} className="btn-primary btn-sm">
              Log time
            </button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Date
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Duration
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Billable
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Description
                </th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-slate-500">
                  Locked
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => {
                const isLocked = entry.isLocked;
                const hours = Math.floor(entry.durationMinutes / 60);
                const mins = entry.durationMinutes % 60;
                return (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-sm text-slate-700">
                      {format(new Date(entry.loggedDate), 'MMM d')}
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-700">
                      {hours}h {mins > 0 ? `${mins}m` : ''}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={clsx(
                          'badge',
                          entry.isBillable ? 'badge-in_progress' : 'badge-backlog',
                        )}
                      >
                        {entry.isBillable ? 'Billable' : 'Non-billable'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-500">{entry.description || '-'}</td>
                    <td className="px-4 py-2">
                      {isLocked ? (
                        <span className="text-xs text-slate-400">Locked</span>
                      ) : (
                        <span className="text-xs text-green-500">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showLogModal && <LogTimeModal onClose={() => setShowLogModal(false)} />}
    </div>
  );
}
