import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaskPriority } from '@wrike-clone/shared';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { TASK_PRIORITY } from '../../api/enums';
import { useTaskLocations } from '../../api/task-locations';
import { useCreateTask } from '../../api/tasks';
import { useWorkspaceMembers, useWorkspaces } from '../../api/workspaces';
import { useAuth } from '../../contexts/AuthContext';
import { TaskLocationFields } from './TaskLocationFields';
import {
  canSetQuickTaskVisibility,
  changeQuickTaskDepartment,
  changeQuickTaskFolder,
  createQuickTaskFormState,
  creatableQuickTaskDepartments,
  normalizeQuickTaskInput,
  permittedQuickTaskAssignees,
} from './quick-task-form';

interface QuickTaskModalProps {
  open: boolean;
  initialDepartmentId: string;
  onClose: () => void;
}

const inputClasses = 'input mt-1 focus:ring-2 focus:ring-primary-500/20';
const quickTaskErrorFallback = 'Task could not be created. Review the details and try again.';

export function getQuickTaskErrorMessage(error: unknown): string {
  const responseData =
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof error.response === 'object' &&
    error.response !== null &&
    'data' in error.response &&
    typeof error.response.data === 'object' &&
    error.response.data !== null
      ? error.response.data
      : null;
  const directMessage =
    responseData && 'message' in responseData && typeof responseData.message === 'string'
      ? responseData.message.trim()
      : '';
  const envelopeMessage =
    responseData &&
    'error' in responseData &&
    typeof responseData.error === 'object' &&
    responseData.error !== null &&
    'message' in responseData.error &&
    typeof responseData.error.message === 'string'
      ? responseData.error.message.trim()
      : '';
  const responseMessage = envelopeMessage || directMessage;
  if (responseMessage) return responseMessage;

  const errorMessage = error instanceof Error ? error.message.trim() : '';
  return errorMessage && !/^Request failed with status code \d+$/i.test(errorMessage)
    ? errorMessage
    : quickTaskErrorFallback;
}

export function QuickTaskModal({ open, initialDepartmentId, onClose }: QuickTaskModalProps) {
  const {
    data: departments = [],
    isPending: departmentsPending,
    isError: departmentsError,
  } = useWorkspaces();
  const { membership, user } = useAuth();
  const navigate = useNavigate();
  const createTask = useCreateTask();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const submissionRef = useRef(false);
  const [state, setState] = useState(() => createQuickTaskFormState(initialDepartmentId));
  const [submitError, setSubmitError] = useState('');
  const {
    data: locations = [],
    isPending: locationsPending,
    isError: locationsError,
  } = useTaskLocations(state.departmentId);
  const {
    data: departmentMembers = [],
    isPending: membersPending,
    isError: membersError,
  } = useWorkspaceMembers(state.departmentId);

  const creatableDepartments = creatableQuickTaskDepartments(departments, membership?.role);
  const selectedDepartment = departments.find((department) => department.id === state.departmentId);
  const canSetVisibility = canSetQuickTaskVisibility(
    membership?.role,
    selectedDepartment?.departmentRole,
  );
  const assignableMembers = permittedQuickTaskAssignees(
    departmentMembers,
    membership?.role === 'admin' ? 'admin' : selectedDepartment?.departmentRole,
    user?.id,
  );

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => {
        const closedDetails = element.closest('details:not([open])');
        if (!closedDetails) return true;
        return (
          element.tagName === 'SUMMARY' &&
          element.parentElement === closedDetails &&
          !closedDetails.parentElement?.closest('details:not([open])')
        );
      });
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements.at(-1);
      if (!firstFocusable || !lastFocusable) return;

      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    titleInputRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const closeIfIdle = () => {
    if (!submissionRef.current) onClose();
  };

  const handleDepartmentChange = (departmentId: string) => {
    const nextDepartment = departments.find((department) => department.id === departmentId);
    const nextCanSetVisibility = canSetQuickTaskVisibility(
      membership?.role,
      nextDepartment?.departmentRole,
    );

    setSubmitError('');
    setState((current) => ({
      ...changeQuickTaskDepartment(current, departmentId),
      visibility: nextCanSetVisibility ? current.visibility : 'department',
    }));
  };

  const handleFolderChange = (folderId: string) => {
    setSubmitError('');
    setState((current) => changeQuickTaskFolder(current, folderId));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionRef.current) return;

    if (!state.title.trim() || !state.departmentId) {
      setSubmitError('Add a task title and choose a department.');
      titleInputRef.current?.focus();
      return;
    }

    submissionRef.current = true;
    setSubmitError('');

    try {
      const task = await createTask.mutateAsync(normalizeQuickTaskInput(state));
      const selectedFolder = locations.find((location) => location.folderId === state.folderId);
      const selectedProject = selectedFolder?.projects.find(
        (project) => project.projectId === state.projectId,
      );
      const folderName = task.folderName || selectedFolder?.folderName || 'General';
      const projectName = task.projectName || selectedProject?.projectName || 'General Tasks';

      toast.custom((toastInstance) => (
        <div
          role="status"
          className="flex w-[min(24rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-slate-200 border-l-4 border-l-teal-700 bg-white p-4 text-sm text-slate-700 shadow-xl"
        >
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">Task created</p>
            <p className="mt-0.5 truncate">
              {folderName} → {projectName}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 rounded-lg px-2 py-1.5 font-semibold text-primary-700 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            onClick={() => {
              toast.dismiss(toastInstance.id);
              navigate(`/tasks/${task.id}`);
            }}
          >
            Open task
          </button>
        </div>
      ));
      onClose();
    } catch (error) {
      setSubmitError(getQuickTaskErrorMessage(error));
      submissionRef.current = false;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-0 backdrop-blur-[1px] sm:p-4">
      <div
        className="grid min-h-full place-items-center"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeIfIdle();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-task-title"
          aria-describedby="quick-task-hint"
          tabIndex={-1}
          className="flex min-h-screen w-full flex-col bg-white shadow-2xl outline-none sm:min-h-0 sm:max-w-3xl sm:rounded-2xl sm:border sm:border-slate-200"
        >
          <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6 sm:py-5">
            <div>
              <h2
                id="quick-task-title"
                className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
              >
                Create task
              </h2>
              <p id="quick-task-hint" className="mt-1 text-sm text-slate-500">
                Capture the work now. Add the finer details when you need them.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close create task"
              disabled={createTask.isPending}
              className="ml-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={closeIfIdle}
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <form onSubmit={submit} aria-busy={createTask.isPending} className="flex flex-1 flex-col">
            <div className="flex-1 space-y-5 px-5 py-5 sm:px-6">
              <div>
                <label
                  htmlFor="quick-task-name"
                  className="block text-sm font-semibold text-slate-800"
                >
                  Task title
                </label>
                <input
                  ref={titleInputRef}
                  id="quick-task-name"
                  required
                  value={state.title}
                  className="mt-1.5 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-medium text-slate-900 shadow-sm placeholder:font-normal placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="What needs to get done?"
                  onChange={(event) => {
                    setSubmitError('');
                    setState((current) => ({
                      ...current,
                      title: event.target.value,
                    }));
                  }}
                />
              </div>

              <TaskLocationFields
                departmentId={state.departmentId}
                folderId={state.folderId}
                projectId={state.projectId}
                departments={creatableDepartments}
                locations={locations}
                onDepartmentChange={handleDepartmentChange}
                onFolderChange={handleFolderChange}
                onProjectChange={(projectId) => {
                  setSubmitError('');
                  setState((current) => ({ ...current, projectId }));
                }}
              />

              {departmentsPending && <p className="text-xs text-slate-500">Loading departments…</p>}
              {departmentsError && (
                <p role="alert" className="text-sm text-red-600">
                  Departments could not be loaded. Close this window and try again.
                </p>
              )}
              {state.departmentId && locationsPending && (
                <p className="text-xs text-slate-500">Loading folders and projects…</p>
              )}
              {locationsError && (
                <p role="alert" className="text-sm text-red-600">
                  Folders and projects could not be loaded. Choose General or try again.
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="quick-task-assignees"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Assignees
                  </label>
                  <select
                    id="quick-task-assignees"
                    multiple
                    size={Math.min(Math.max(assignableMembers.length, 2), 4)}
                    value={state.assigneeIds}
                    disabled={!state.departmentId || membersPending}
                    className={inputClasses}
                    onChange={(event) => {
                      const assigneeIds = Array.from(
                        event.currentTarget.selectedOptions,
                        (option) => option.value,
                      );
                      setState((current) => ({
                        ...current,
                        assigneeIds,
                      }));
                    }}
                  >
                    {membersPending && <option disabled>Loading assignees…</option>}
                    {!membersPending && assignableMembers.length === 0 && (
                      <option disabled>No assignees available</option>
                    )}
                    {assignableMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName || member.email}
                        {member.role ? ` (${member.role.replace('_', ' ')})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">Select one or more people.</p>
                  {membersError && (
                    <p role="alert" className="mt-1 text-xs text-red-600">
                      Assignees could not be loaded.
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="quick-task-due-date"
                    className="block text-sm font-medium text-slate-700"
                  >
                    Due date
                  </label>
                  <input
                    id="quick-task-due-date"
                    type="date"
                    value={state.dueDate}
                    className={inputClasses}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
                <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between">
                    More details
                    <svg
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                </summary>

                <div className="grid gap-4 border-t border-slate-200 px-4 py-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="quick-task-description"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Description
                    </label>
                    <textarea
                      id="quick-task-description"
                      rows={3}
                      value={state.description}
                      className={`${inputClasses} resize-y`}
                      placeholder="Add context, links, or a clear finish line."
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quick-task-priority"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Priority
                    </label>
                    <select
                      id="quick-task-priority"
                      value={state.priority}
                      className={inputClasses}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          priority: event.target.value as TaskPriority,
                        }))
                      }
                    >
                      {Object.values(TASK_PRIORITY).map((priority) => (
                        <option key={priority} value={priority}>
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="quick-task-start-date"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Start date
                    </label>
                    <input
                      id="quick-task-start-date"
                      type="date"
                      value={state.startDate}
                      className={inputClasses}
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          startDate: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="quick-task-estimate"
                      className="block text-sm font-medium text-slate-700"
                    >
                      Estimated hours
                    </label>
                    <input
                      id="quick-task-estimate"
                      type="number"
                      min="0"
                      step="0.25"
                      value={state.estimatedHours}
                      className={inputClasses}
                      placeholder="0"
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          estimatedHours:
                            event.target.value === '' ? '' : Number(event.target.value),
                        }))
                      }
                    />
                  </div>

                  {canSetVisibility && (
                    <div>
                      <label
                        htmlFor="quick-task-visibility"
                        className="block text-sm font-medium text-slate-700"
                      >
                        Visibility
                      </label>
                      <select
                        id="quick-task-visibility"
                        value={state.visibility}
                        className={inputClasses}
                        onChange={(event) =>
                          setState((current) => ({
                            ...current,
                            visibility: event.target.value as 'global' | 'department',
                          }))
                        }
                      >
                        <option value="department">Department</option>
                        <option value="global">Organization</option>
                      </select>
                    </div>
                  )}
                </div>
              </details>

              {submitError && (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {submitError}
                </p>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:rounded-b-2xl sm:px-6">
              <button
                type="button"
                className="btn-secondary"
                disabled={createTask.isPending}
                onClick={closeIfIdle}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary min-w-28"
                disabled={
                  createTask.isPending ||
                  departmentsPending ||
                  !state.title.trim() ||
                  !state.departmentId
                }
              >
                {createTask.isPending ? 'Creating…' : 'Create task'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
