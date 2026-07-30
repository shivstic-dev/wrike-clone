import { TaskStatus } from '@wrike-clone/shared';
import type { TimelineZoom } from './timeline-scale';

export interface TimelineFilterState {
  projectId: string;
  departmentId: string;
  assigneeId: string;
  status: string;
  criticalOnly: boolean;
}

export interface TimelineFilterOption {
  id: string;
  label: string;
}

export interface TimelineToolbarProps {
  zoom: TimelineZoom;
  onZoomChange(zoom: TimelineZoom): void;
  onPrevious(): void;
  onNext(): void;
  onToday(): void;
  filters: TimelineFilterState;
  onFiltersChange(filters: TimelineFilterState): void;
  projects?: TimelineFilterOption[];
  departments?: TimelineFilterOption[];
  assignees?: TimelineFilterOption[];
}

const statuses = [
  { id: TaskStatus.TODO, label: 'To do' },
  { id: TaskStatus.IN_PROGRESS, label: 'In progress' },
  { id: TaskStatus.BLOCKED, label: 'Blocked' },
  { id: TaskStatus.COMPLETED, label: 'Completed' },
];

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: TimelineFilterOption[];
  onChange(value: string): void;
}) {
  return (
    <label className="timeline-toolbar__field">
      <span>{label}</span>
      <select
        aria-label={`Filter by ${label.toLowerCase()}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function TimelineToolbar({
  zoom,
  onZoomChange,
  onPrevious,
  onNext,
  onToday,
  filters,
  onFiltersChange,
  projects = [],
  departments = [],
  assignees = [],
}: TimelineToolbarProps) {
  const changeFilter = <Key extends keyof TimelineFilterState>(
    key: Key,
    value: TimelineFilterState[Key],
  ) => onFiltersChange({ ...filters, [key]: value });

  return (
    <section className="timeline-toolbar" aria-label="Timeline controls">
      <div className="timeline-toolbar__navigation" role="group" aria-label="Visible date range">
        <button type="button" aria-label="Previous date range" onClick={onPrevious}>
          <span aria-hidden="true">←</span> Previous
        </button>
        <button type="button" aria-label="Show today" onClick={onToday}>Today</button>
        <button type="button" aria-label="Next date range" onClick={onNext}>
          Next <span aria-hidden="true">→</span>
        </button>
      </div>

      <label className="timeline-toolbar__field timeline-toolbar__zoom">
        <span>Zoom</span>
        <select
          aria-label="Timeline zoom"
          value={zoom}
          onChange={(event) => onZoomChange(event.target.value as TimelineZoom)}
        >
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </label>

      <div className="timeline-toolbar__filters">
        <FilterSelect
          label="Project"
          value={filters.projectId}
          options={projects}
          onChange={(value) => changeFilter('projectId', value)}
        />
        <FilterSelect
          label="Department"
          value={filters.departmentId}
          options={departments}
          onChange={(value) => changeFilter('departmentId', value)}
        />
        <FilterSelect
          label="Assignee"
          value={filters.assigneeId}
          options={assignees}
          onChange={(value) => changeFilter('assigneeId', value)}
        />
        <FilterSelect
          label="Status"
          value={filters.status}
          options={statuses}
          onChange={(value) => changeFilter('status', value)}
        />
      </div>

      <label className="timeline-toolbar__critical">
        <input
          type="checkbox"
          aria-label="Show critical path only"
          checked={filters.criticalOnly}
          onChange={(event) => changeFilter('criticalOnly', event.target.checked)}
        />
        <span aria-hidden="true" className="timeline-toolbar__thread" />
        Critical path
      </label>
    </section>
  );
}
