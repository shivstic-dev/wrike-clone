/**
 * Work Schedule page — manages working hours, time off, and company holidays.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../api/client';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

function WorkingHoursPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id || '';

  const { data: hours, isLoading } = useQuery({
    queryKey: ['working-hours', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await apiClient.get(`/schedule/hours/${userId}`);
      return data || [];
    },
    enabled: !!userId,
  });

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3">My Working Hours</h3>
      <p className="text-xs text-slate-400 mb-4">
        Your default working hours per day of the week for capacity planning.
      </p>
      {!userId ? (
        <p className="text-sm text-slate-400">Log in to see your working hours.</p>
      ) : isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((day) => {
            const dayHours = Array.isArray(hours)
              ? hours.find((h: any) => h.day_of_week === day)
              : null;
            const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
            return (
              <div key={day} className="flex items-center gap-3 text-sm">
                <span className="w-12 font-medium text-slate-600">{dayNames[day - 1]}</span>
                <span className="text-slate-700">
                  {dayHours
                    ? `${dayHours.start_time} - ${dayHours.end_time}`
                    : 'Not set (default 9:00-17:00)'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HolidaysPanel() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [holidayName, setHolidayName] = useState('');
  const [holidayDate, setHolidayDate] = useState('');

  const {
    data: holidays,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tenant-holidays'],
    queryFn: async () => {
      const { data } = await apiClient.get('/schedule/holidays');
      return Array.isArray(data) ? data : [];
    },
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      await apiClient.post('/schedule/holidays', { name: holidayName, date: holidayDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-holidays'] });
      setShowAdd(false);
      setHolidayName('');
      setHolidayDate('');
      toast.success('Holiday added');
    },
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/schedule/holidays/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-holidays'] });
      toast.success('Holiday removed');
    },
  });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Company Holidays</h3>
        <button onClick={() => setShowAdd(true)} className="btn-primary btn-sm text-xs">
          + Add Holiday
        </button>
      </div>

      {error ? (
        <ErrorDisplay message="Failed to load holidays" />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !holidays || holidays.length === 0 ? (
        <EmptyState
          title="No holidays"
          description="Add company-wide holidays for capacity planning."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {holidays.map((h: any) => (
            <div key={h.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-700">{h.name}</p>
                <p className="text-xs text-slate-400">{format(new Date(h.date), 'MMM d, yyyy')}</p>
              </div>
              <button
                onClick={() => {
                  if (confirm('Remove this holiday?')) removeHoliday.mutate(h.id);
                }}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Holiday name"
              className="input flex-1 text-sm"
              value={holidayName}
              onChange={(e) => setHolidayName(e.target.value)}
            />
            <input
              type="date"
              className="input w-40 text-sm"
              value={holidayDate}
              onChange={(e) => setHolidayDate(e.target.value)}
            />
            <button
              onClick={() => addHoliday.mutate()}
              disabled={!holidayName || !holidayDate || addHoliday.isPending}
              className="btn-primary btn-sm"
            >
              {addHoliday.isPending ? '...' : 'Add'}
            </button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeOffPanel() {
  const queryClient = useQueryClient();
  const [showRequest, setShowRequest] = useState(false);
  const [requestDate, setRequestDate] = useState('');
  const [requestType, setRequestType] = useState('vacation');
  const [requestReason, setRequestReason] = useState('');

  const {
    data: timeOff,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['time-off'],
    queryFn: async () => {
      const { data } = await apiClient.get('/schedule/time-off');
      return Array.isArray(data) ? data : [];
    },
  });

  const requestTimeOff = useMutation({
    mutationFn: async () => {
      await apiClient.post('/schedule/time-off', {
        date: requestDate,
        type: requestType,
        reason: requestReason.trim() || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
      setShowRequest(false);
      setRequestDate('');
      setRequestReason('');
      toast.success('Time off requested');
    },
  });

  const approveTimeOff = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      await apiClient.patch(`/schedule/time-off/${id}/${action}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
      toast.success('Updated');
    },
  });

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700">Time Off</h3>
        <button onClick={() => setShowRequest(true)} className="btn-primary btn-sm text-xs">
          + Request Off
        </button>
      </div>

      {error ? (
        <ErrorDisplay message="Failed to load time off" />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !timeOff || timeOff.length === 0 ? (
        <EmptyState
          title="No time off requests"
          description="Request vacation, sick, or personal days here."
        />
      ) : (
        <div className="divide-y divide-slate-100">
          {timeOff.map((entry: any) => (
            <div key={entry.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-700 capitalize">{entry.type}</p>
                <p className="text-xs text-slate-400">
                  {format(new Date(entry.date), 'MMM d, yyyy')}
                  {entry.display_name && ` · ${entry.display_name}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    'badge',
                    entry.status === 'approved'
                      ? 'badge-done'
                      : entry.status === 'rejected'
                        ? 'badge-cancelled'
                        : 'badge-backlog',
                  )}
                >
                  {entry.status}
                </span>
                {entry.status === 'pending' && (
                  <>
                    <button
                      onClick={() => approveTimeOff.mutate({ id: entry.id, action: 'approve' })}
                      className="text-xs text-green-600 hover:text-green-700 font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => approveTimeOff.mutate({ id: entry.id, action: 'reject' })}
                      className="text-xs text-red-600 hover:text-red-700 font-medium"
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showRequest && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="space-y-2">
            <input
              type="date"
              className="input text-sm"
              value={requestDate}
              onChange={(e) => setRequestDate(e.target.value)}
            />
            <select
              className="input text-sm"
              value={requestType}
              onChange={(e) => setRequestType(e.target.value)}
            >
              <option value="vacation">Vacation</option>
              <option value="sick">Sick Day</option>
              <option value="personal">Personal Day</option>
            </select>
            <textarea
              className="input text-sm resize-none"
              rows={2}
              placeholder="Reason (optional)"
              value={requestReason}
              onChange={(e) => setRequestReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => requestTimeOff.mutate()}
                disabled={!requestDate || requestTimeOff.isPending}
                className="btn-primary btn-sm"
              >
                {requestTimeOff.isPending ? '...' : 'Submit'}
              </button>
              <button onClick={() => setShowRequest(false)} className="btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <div className="mx-auto max-w-[96rem] p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Work Schedules</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage working hours, time off requests, and company holidays.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <WorkingHoursPanel />
          <HolidaysPanel />
        </div>
        <div>
          <TimeOffPanel />
        </div>
      </div>
    </div>
  );
}
