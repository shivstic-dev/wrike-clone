import type { TaskLocationOption } from '@wrike-clone/shared';

interface TaskLocationFieldsProps {
  departmentId: string;
  folderId: string;
  projectId: string;
  departments: Array<{ id: string; name: string }>;
  locations: TaskLocationOption[];
  onDepartmentChange: (departmentId: string) => void;
  onFolderChange: (folderId: string) => void;
  onProjectChange: (projectId: string) => void;
}

const selectClasses = 'input mt-1 bg-white focus:ring-2 focus:ring-primary-500/20';

export function TaskLocationFields({
  departmentId,
  folderId,
  projectId,
  departments,
  locations,
  onDepartmentChange,
  onFolderChange,
  onProjectChange,
}: TaskLocationFieldsProps) {
  const selectedFolder = locations.find((location) => location.folderId === folderId);

  return (
    <fieldset>
      <legend className="sr-only">Task location</legend>
      <div className="rounded-xl border border-primary-100 bg-primary-50/70 p-3 sm:p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary-700">
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 6.75A1.75 1.75 0 014.75 5h4l2 2h8.5A1.75 1.75 0 0121 8.75v8.5A1.75 1.75 0 0119.25 19H4.75A1.75 1.75 0 013 17.25V6.75z"
            />
          </svg>
          Where this task lives
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-end">
          <label
            htmlFor="quick-task-department"
            className="block text-sm font-medium text-slate-700"
          >
            Department
            <select
              id="quick-task-department"
              required
              value={departmentId}
              className={selectClasses}
              onChange={(event) => onDepartmentChange(event.target.value)}
            >
              <option value="">Choose department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>

          <span
            aria-hidden="true"
            className="hidden pb-2 text-lg font-medium text-primary-300 sm:block"
          >
            →
          </span>

          <label htmlFor="quick-task-folder" className="block text-sm font-medium text-slate-700">
            Folder
            <select
              id="quick-task-folder"
              value={folderId}
              disabled={!departmentId}
              className={selectClasses}
              onChange={(event) => onFolderChange(event.target.value)}
            >
              <option value="">General (default)</option>
              {locations
                .filter((location) => !location.isGeneral)
                .map((location) => (
                  <option key={location.folderId} value={location.folderId}>
                    {location.folderName}
                  </option>
                ))}
            </select>
          </label>

          <span
            aria-hidden="true"
            className="hidden pb-2 text-lg font-medium text-primary-300 sm:block"
          >
            →
          </span>

          <label htmlFor="quick-task-project" className="block text-sm font-medium text-slate-700">
            Project <span className="font-normal text-slate-500">(optional)</span>
            <select
              id="quick-task-project"
              value={projectId}
              disabled={!selectedFolder}
              className={selectClasses}
              onChange={(event) => onProjectChange(event.target.value)}
            >
              <option value="">General Tasks</option>
              {(selectedFolder?.projects || []).map((project) => (
                <option key={project.projectId} value={project.projectId}>
                  {project.projectName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </fieldset>
  );
}
