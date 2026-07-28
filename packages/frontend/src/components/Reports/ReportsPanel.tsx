import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useWorkspaces } from '../../api/workspaces';
import apiClient from '../../api/client';
import {
  downloadDepartmentReport,
  useDepartmentReport,
  type ReportFilters,
  type ReportScope,
} from '../../api/reports';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import {
  allowedReportScopes,
  canExportReport,
  defaultReportScope,
  describeActiveReportFilters,
  permittedReportMembers,
} from './report-controls';

function StatCard({
  label,
  value,
  tone = 'text-slate-900',
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

export function ReportsPanel() {
  const { membership, user } = useAuth();
  const { data: departments = [], isLoading: departmentsLoading } = useWorkspaces();
  const [departmentId, setDepartmentId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null);
  const isAdmin = membership?.role === 'admin';
  const selectedDepartment = departments.find((department) => department.id === departmentId);
  const departmentRole = selectedDepartment?.departmentRole;
  const reportContextKey = [
    membership?.role || '',
    departmentId || 'all',
    departmentRole || '',
  ].join(':');
  const [scopeSelection, setScopeSelection] = useState<{
    contextKey: string;
    value: ReportScope;
  } | null>(null);
  const roleReady = isAdmin || !!departmentRole;
  const scope =
    scopeSelection?.contextKey === reportContextKey
      ? scopeSelection.value
      : defaultReportScope(membership?.role, departmentRole);
  const changeScope = (value: ReportScope) =>
    setScopeSelection({ contextKey: reportContextKey, value });
  const members = useQuery({
    queryKey: ['workspace-members', departmentId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/workspaces/${departmentId}/members`);
      return (Array.isArray(data) ? data : []) as Array<{
        userId: string;
        displayName?: string;
        email: string;
        role: string;
      }>;
    },
    enabled: !!departmentId,
  });
  const reportMembers = permittedReportMembers(
    members.data || [],
    isAdmin ? 'admin' : departmentRole,
    user?.id,
  );

  useEffect(() => {
    if (!departmentId && departments.length > 0 && !isAdmin) {
      setDepartmentId(departments[0]!.id);
    }
  }, [departmentId, departments, isAdmin]);

  useEffect(() => {
    setTargetUserId('');
    setAssigneeId('');
  }, [reportContextKey]);

  const filters = useMemo<ReportFilters>(
    () => ({
      departmentId: departmentId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      status: (status || undefined) as ReportFilters['status'],
      priority: (priority || undefined) as ReportFilters['priority'],
      assigneeId: assigneeId || undefined,
      scope,
      targetUserId: scope === 'individual' ? targetUserId || undefined : undefined,
    }),
    [departmentId, dateFrom, dateTo, status, priority, assigneeId, scope, targetUserId],
  );
  const enabled =
    roleReady &&
    (isAdmin || !!departmentId) &&
    (scope !== 'individual' || !!targetUserId);
  const report = useDepartmentReport(filters, enabled);

  async function exportReport(format: 'pdf' | 'xlsx') {
    setExporting(format);
    try {
      await downloadDepartmentReport(filters, format);
      toast.success(`${format.toUpperCase()} report downloaded`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Report export failed');
    } finally {
      setExporting(null);
    }
  }

  if (departmentsLoading) return <LoadingSpinner className="py-12" />;

  const data = report.data;
  const completionRate =
    data && data.totals.tasks > 0
      ? Math.round((data.totals.completed / data.totals.tasks) * 100)
      : 0;
  const canExport = canExportReport(enabled, data?.tasks.length || 0, !!exporting);
  const describedFilters = {
    ...filters,
    departmentName: selectedDepartment?.name,
    assigneeName: reportMembers.find((member) => member.userId === assigneeId)?.displayName,
    targetUserName: reportMembers.find((member) => member.userId === targetUserId)?.displayName,
  };

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-8">
          <label className="text-xs font-medium text-slate-600">
            Department
            <select
              className="input mt-1 w-full text-sm"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
            >
              {isAdmin && <option value="">All departments</option>}
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Created from
            <input
              className="input mt-1 w-full text-sm"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Created to
            <input
              className="input mt-1 w-full text-sm"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Status
            <select
              className="input mt-1 w-full text-sm"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">All statuses</option>
              <option value="todo">To do</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Priority
            <select
              className="input mt-1 w-full text-sm"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            >
              <option value="">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Report scope
            <select
              className="input mt-1 w-full text-sm"
              value={scope}
              onChange={(event) => changeScope(event.target.value as ReportScope)}
            >
              {allowedReportScopes(membership?.role, departmentRole).map((option) => (
                <option key={option} value={option}>
                  {option === 'self'
                    ? 'My tasks'
                    : option === 'individual'
                      ? 'One person'
                      : 'Combined team'}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Report person
            <select
              className="input mt-1 w-full text-sm"
              value={targetUserId}
              disabled={scope !== 'individual' || !departmentId}
              onChange={(event) => setTargetUserId(event.target.value)}
            >
              <option value="">Choose a person</option>
              {reportMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName || member.email}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Assignee
            <select
              className="input mt-1 w-full text-sm"
              value={assigneeId}
              disabled={!departmentId}
              onChange={(event) => setAssigneeId(event.target.value)}
            >
              <option value="">All assignees</option>
              {reportMembers.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName || member.email}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {data?.scope.mode === 'self'
              ? 'Personal report: your assigned tasks only'
              : data?.scope.mode === 'individual'
                ? 'Individual report for the selected team member'
                : data?.scope.mode === 'combined'
                  ? 'Combined report limited to your permitted team'
                  : isAdmin && !departmentId
                    ? 'Organization-wide admin report'
                    : 'Department management report'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={!canExport}
              onClick={() => exportReport('pdf')}
            >
              {exporting === 'pdf' ? 'Preparing…' : 'Export PDF'}
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!canExport}
              onClick={() => exportReport('xlsx')}
            >
              {exporting === 'xlsx' ? 'Preparing…' : 'Export XLSX'}
            </button>
          </div>
        </div>
      </section>

      {report.isLoading && <LoadingSpinner className="py-12" />}
      {report.isError && (
        <EmptyState
          title="Report could not be loaded"
          description="Your filters are still selected. Retry when the connection is available."
          action={
            <button type="button" className="btn-primary" onClick={() => report.refetch()}>
              Retry report
            </button>
          }
        />
      )}
      {!report.isError && data?.tasks.length === 0 && (
        <EmptyState
          title="No tasks match this report"
          description={describeActiveReportFilters(describedFilters)}
        />
      )}
      {!report.isError && data && data.tasks.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Total tasks" value={data.totals.tasks} />
            <StatCard label="Completed" value={data.totals.completed} tone="text-green-600" />
            <StatCard label="Overdue" value={data.totals.overdue} tone="text-red-600" />
            <StatCard label="Completion rate" value={`${completionRate}%`} tone="text-blue-600" />
            <StatCard
              label="Average completion"
              value={
                data.totals.averageCompletionHours === null
                  ? 'N/A'
                  : `${data.totals.averageCompletionHours}h`
              }
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-4">
              <h3 className="text-sm font-semibold text-slate-800">By status</h3>
              <div className="mt-3 space-y-2 text-sm">
                {['todo', 'in_progress', 'completed', 'blocked'].map((value) => (
                  <div key={value} className="flex justify-between border-b py-2 last:border-0">
                    <span className="capitalize text-slate-600">{value.replace('_', ' ')}</span>
                    <strong>{data.byStatus[value] || 0}</strong>
                  </div>
                ))}
              </div>
            </section>
            <section className="card overflow-hidden">
              <div className="border-b px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-800">Per-user summary</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Assignee</th>
                      <th className="px-4 py-2">Total</th>
                      <th className="px-4 py-2">Completed</th>
                      <th className="px-4 py-2">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byAssignee.map((row) => (
                      <tr key={row.assignee} className="border-t">
                        <td className="px-4 py-2">{row.assignee}</td>
                        <td className="px-4 py-2">{row.total}</td>
                        <td className="px-4 py-2">{row.completed}</td>
                        <td className="px-4 py-2">{row.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="card overflow-hidden">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Current tasks</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2">Department</th>
                    <th className="px-4 py-2">Task</th>
                    <th className="px-4 py-2">Assignee</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Priority</th>
                    <th className="px-4 py-2">Due date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tasks.map((task) => (
                    <tr key={task.id} className="border-t">
                      <td className="px-4 py-2">{task.departmentName}</td>
                      <td className="px-4 py-2">
                        <Link
                          className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                          to={`/tasks/${task.id}`}
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2">{task.assigneeName || 'Unassigned'}</td>
                      <td className="px-4 py-2 capitalize">{task.status.replace('_', ' ')}</td>
                      <td className="px-4 py-2 capitalize">{task.priority}</td>
                      <td className="px-4 py-2">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : 'No due date'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
