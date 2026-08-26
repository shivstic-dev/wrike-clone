import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import type {
  CreateDependencyRequest,
  TaskDependency,
  TaskStatus,
  TimelineQuery,
  TimelineResponse,
  TimelineScope,
  TimelineTask,
} from '@wrike-clone/shared';
import {
  useCreateDependency,
  useDeleteDependency,
  useTimeline,
  useUpdateTaskSchedule,
} from '../../api/timeline';
import { ErrorDisplay } from '../common/ErrorDisplay';
import { GanttChart } from './GanttChart';
import {
  TimelineToolbar,
  type TimelineFilterOption,
  type TimelineFilterState,
} from './TimelineToolbar';
import type { TimelineZoom } from './timeline-scale';

const DAY_MS = 86_400_000;
const DEFAULT_SPAN_DAYS = 90;

export interface TimelineViewProps {
  scope: TimelineScope;
}

interface ErrorDetails {
  status?: number;
  code?: string;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return {
    from: dateOnly(new Date(utcToday - 14 * DAY_MS)),
    to: dateOnly(new Date(utcToday + (DEFAULT_SPAN_DAYS - 15) * DAY_MS)),
  };
}

function rangeFromParams(params: URLSearchParams): { from: string; to: string } {
  const from = parseDate(params.get('from'));
  const to = parseDate(params.get('to'));
  if (!from || !to || from > to || (to.getTime() - from.getTime()) / DAY_MS > 729) {
    return defaultRange();
  }
  return { from: dateOnly(from), to: dateOnly(to) };
}

function zoomFromParams(params: URLSearchParams): TimelineZoom {
  const zoom = params.get('zoom');
  return zoom === 'day' || zoom === 'month' ? zoom : 'week';
}

function shiftRange(
  range: { from: string; to: string },
  direction: -1 | 0 | 1,
): { from: string; to: string } {
  const from = parseDate(range.from)!;
  const to = parseDate(range.to)!;
  const span = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (direction === 0) {
    const today = new Date();
    const center = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const before = Math.floor((span - 1) / 2);
    return {
      from: dateOnly(new Date(center - before * DAY_MS)),
      to: dateOnly(new Date(center + (span - before - 1) * DAY_MS)),
    };
  }
  const delta = span * direction * DAY_MS;
  return {
    from: dateOnly(new Date(from.getTime() + delta)),
    to: dateOnly(new Date(to.getTime() + delta)),
  };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function mergeTimeline(previous: TimelineResponse, next: TimelineResponse): TimelineResponse {
  return {
    tasks: uniqueById([...previous.tasks, ...next.tasks]),
    unscheduled: uniqueById([...previous.unscheduled, ...next.unscheduled]),
    dependencies: uniqueById([...previous.dependencies, ...next.dependencies]),
    meta: next.meta,
  };
}

function errorDetails(error: unknown): ErrorDetails {
  const response = (error as { response?: { status?: number; data?: { code?: string } } })
    ?.response;
  return { status: response?.status, code: response?.data?.code };
}

function showMutationError(error: unknown): void {
  const details = errorDetails(error);
  if (details.code === 'STALE_TASK') {
    toast.error('This task changed elsewhere. Timeline refreshed.');
  } else if (details.code === 'DEPENDENCY_CYCLE') {
    toast.error('That dependency would create a circular schedule.');
  } else if (details.status === 403 || details.code === 'FORBIDDEN') {
    toast.error('You do not have permission to edit this task.');
  } else {
    toast.error('Timeline change could not be saved.');
  }
}

function optionSets(data: TimelineResponse | undefined): {
  projects: TimelineFilterOption[];
  departments: TimelineFilterOption[];
  assignees: TimelineFilterOption[];
} {
  const tasks = data ? [...data.tasks, ...data.unscheduled] : [];
  const projects = new Map<string, string>();
  const departments = new Map<string, string>();
  const assignees = new Map<string, string>();
  for (const task of tasks) {
    if (task.projectId) projects.set(task.projectId, task.projectName || 'Project');
    if (task.departmentId) {
      departments.set(task.departmentId, task.departmentName || 'Department');
    }
    for (const assignee of task.assignees ?? []) {
      const id = assignee.userId || assignee.id;
      if (id) assignees.set(id, assignee.displayName || assignee.email || 'Member');
    }
  }
  const toOptions = (entries: Map<string, string>) =>
    Array.from(entries, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label),
    );
  return {
    projects: toOptions(projects),
    departments: toOptions(departments),
    assignees: toOptions(assignees),
  };
}

export function TimelineView({ scope }: TimelineViewProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [zoom, setZoom] = useState<TimelineZoom>(() => zoomFromParams(searchParams));
  const [range, setRange] = useState(() => rangeFromParams(searchParams));
  const [filters, setFilters] = useState<TimelineFilterState>({
    projectId: '',
    departmentId: '',
    assigneeId: '',
    status: '',
    criticalOnly: false,
  });
  const [cursor, setCursor] = useState<string>();
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [accumulated, setAccumulated] = useState<{
    identity: string;
    response: TimelineResponse;
  }>();

  const identity = [
    scope.kind,
    scope.kind === 'project' ? scope.projectId : scope.departmentId || 'all',
    range.from,
    range.to,
    filters.projectId,
    filters.departmentId,
    filters.assigneeId,
    filters.status,
    filters.criticalOnly,
  ].join('|');

  const query: TimelineQuery = {
    from: range.from,
    to: range.to,
    projectId: filters.projectId || undefined,
    departmentId: filters.departmentId || undefined,
    assigneeId: filters.assigneeId || undefined,
    status: filters.status ? [filters.status as TaskStatus] : undefined,
    cursor,
    perPage: 500,
    includeCriticalPath: filters.criticalOnly,
  };
  const timeline = useTimeline(scope, query);
  const schedule = useUpdateTaskSchedule();
  const createDependency = useCreateDependency();
  const deleteDependency = useDeleteDependency();

  useEffect(() => {
    setCursor(undefined);
  }, [identity]);

  useEffect(() => {
    if (!timeline.data) return;
    setAccumulated((current) => ({
      identity,
      response:
        cursor && current?.identity === identity
          ? mergeTimeline(current.response, timeline.data)
          : timeline.data,
    }));
  }, [cursor, identity, timeline.data]);

  useEffect(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('from', range.from);
        next.set('to', range.to);
        next.set('zoom', zoom);
        return next;
      },
      { replace: true },
    );
  }, [range.from, range.to, setSearchParams, zoom]);

  const data = accumulated?.identity === identity ? accumulated.response : timeline.data;
  const visibleData = useMemo(() => {
    if (!data || !filters.criticalOnly) return data;
    const tasks = data.tasks.filter((task) => task.isCritical);
    const taskIds = new Set(tasks.map((task) => task.id));
    return {
      ...data,
      tasks,
      unscheduled: [],
      dependencies: data.dependencies.filter(
        (dependency) => taskIds.has(dependency.taskId) && taskIds.has(dependency.dependsOnTaskId),
      ),
    };
  }, [data, filters.criticalOnly]);
  const options = useMemo(() => optionSets(data), [data]);

  function updateRange(next: { from: string; to: string }): void {
    setCursor(undefined);
    setAccumulated(undefined);
    setRange(next);
  }

  function updateFilters(next: TimelineFilterState): void {
    setCursor(undefined);
    setAccumulated(undefined);
    setFilters(next);
  }

  async function updateSchedule(
    task: TimelineTask,
    next: { startDate: string; dueDate: string },
  ): Promise<void> {
    try {
      await schedule.mutateAsync({
        taskId: task.id,
        startDate: next.startDate,
        dueDate: next.dueDate,
        expectedUpdatedAt: task.updatedAt,
      });
      toast.success('Schedule updated');
    } catch (error) {
      showMutationError(error);
    }
  }

  async function addDependency(input: CreateDependencyRequest): Promise<void> {
    try {
      await createDependency.mutateAsync(input);
    } catch (error) {
      showMutationError(error);
    }
  }

  async function removeDependency(dependencyId: TaskDependency['id']): Promise<void> {
    try {
      await deleteDependency.mutateAsync(dependencyId);
    } catch (error) {
      showMutationError(error);
    }
  }

  function openTask(taskId: string): void {
    setSelectedTaskId(taskId);
    navigate(`/tasks/${taskId}`);
  }

  return (
    <section className="space-y-4" aria-label="Timeline">
      <TimelineToolbar
        zoom={zoom}
        onZoomChange={setZoom}
        onPrevious={() => updateRange(shiftRange(range, -1))}
        onNext={() => updateRange(shiftRange(range, 1))}
        onToday={() => updateRange(shiftRange(range, 0))}
        filters={filters}
        onFiltersChange={updateFilters}
        projects={options.projects}
        departments={scope.kind === 'dashboard' ? options.departments : []}
        assignees={options.assignees}
      />

      {timeline.isLoading && !visibleData && (
        <div
          aria-label="Loading timeline"
          className="overflow-hidden rounded-2xl border border-atlas-mist bg-white"
        >
          <div className="h-14 animate-pulse border-b border-atlas-mist bg-atlas-paper" />
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        </div>
      )}

      {timeline.error && !visibleData && (
        <ErrorDisplay
          title="Timeline is unavailable"
          message="The schedule could not be loaded."
          onRetry={() => void timeline.refetch()}
        />
      )}

      {visibleData && (
        <>
          {visibleData.tasks.length === 0 && (
            <div className="rounded-2xl border border-dashed border-atlas-mist bg-white px-6 py-8">
              <h2 className="font-atlasDisplay text-lg font-semibold text-atlas-ink">
                No scheduled work in this range
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Move the date range or schedule work from the planning inbox below.
              </p>
            </div>
          )}
          <GanttChart
            data={visibleData}
            zoom={zoom}
            selectedTaskId={selectedTaskId}
            onScheduleChange={(task, next) => void updateSchedule(task, next)}
            onOpenTask={openTask}
            onCreateDependency={(input) => void addDependency(input)}
            onDeleteDependency={(dependencyId) => void removeDependency(dependencyId)}
          />
          {visibleData.meta.nextCursor && (
            <div className="flex justify-center">
              <button
                type="button"
                className="rounded-xl border border-atlas-canopy bg-white px-4 py-2 text-sm font-semibold text-atlas-canopy hover:bg-atlas-paper disabled:opacity-50"
                disabled={timeline.isFetching}
                onClick={() => setCursor(visibleData.meta.nextCursor ?? undefined)}
              >
                {timeline.isFetching ? 'Loading more…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
