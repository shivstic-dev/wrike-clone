import { useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  useCreateFolder,
  useCreateProject,
  useFolderTree,
  useWorkspaceProjects,
  useWorkspace,
} from '../api/workspaces';
import { FolderTree } from '../components/Folder/FolderTree';
import { TaskTable } from '../components/Table/TaskTable';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import { useTasks } from '../api/tasks';
import { useAuth } from '../contexts/AuthContext';
import { TASK_PRIORITY } from '../api/enums';
import type {
  CreateFolderRequest,
  CreateProjectRequest,
  Folder,
  Project,
} from '@wrike-clone/shared';
import toast from 'react-hot-toast';

const projectStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

type SetupModal = 'folder' | 'project' | null;

const inputClasses =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder-slate-400 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:bg-slate-50 disabled:text-slate-500';

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="workboard-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-atlas-mist bg-white p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-modal-title"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="workspace-modal-title" className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateFolderForm({
  workspaceId,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  workspaceId: string;
  isSubmitting: boolean;
  onSubmit: (input: CreateFolderRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    await onSubmit({
      workspaceId,
      name: name.trim(),
      description: description.trim() || undefined,
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="label" htmlFor="folder-name">
          Folder name <span className="text-red-500">*</span>
        </label>
        <input
          id="folder-name"
          className={inputClasses}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Example: Marketing projects"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="folder-description">
          Description
        </label>
        <textarea
          id="folder-description"
          className={`${inputClasses} resize-none`}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What work belongs in this folder?"
        />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button className="btn-primary" type="submit" disabled={!name.trim() || isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create folder'}
        </button>
      </div>
    </form>
  );
}

function CreateProjectForm({
  folders,
  isSubmitting,
  onSubmit,
  onCancel,
}: {
  folders: Folder[];
  isSubmitting: boolean;
  onSubmit: (input: CreateProjectRequest) => Promise<void>;
  onCancel: () => void;
}) {
  const [folderId, setFolderId] = useState(folders[0]?.id || '');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<CreateProjectRequest['priority']>(
    TASK_PRIORITY.MEDIUM as CreateProjectRequest['priority'],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!folderId || !name.trim()) return;
    if (startDate && dueDate && dueDate < startDate) {
      toast.error('Due date must be on or after the start date');
      return;
    }
    await onSubmit({
      folderId,
      name: name.trim(),
      description: description.trim() || undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      priority,
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div>
        <label className="label" htmlFor="project-folder">
          Folder <span className="text-red-500">*</span>
        </label>
        <select
          id="project-folder"
          className={inputClasses}
          value={folderId}
          onChange={(event) => setFolderId(event.target.value)}
          required
        >
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="project-name">
          Project name <span className="text-red-500">*</span>
        </label>
        <input
          id="project-name"
          className={inputClasses}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Example: Annual report"
          autoFocus
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="project-description">
          Description
        </label>
        <textarea
          id="project-description"
          className={`${inputClasses} resize-none`}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this project trying to achieve?"
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="project-start-date">
            Start date
          </label>
          <input
            id="project-start-date"
            className={inputClasses}
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="project-due-date">
            Due date
          </label>
          <input
            id="project-due-date"
            className={inputClasses}
            type="date"
            value={dueDate}
            min={startDate || undefined}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="project-priority">
          Priority
        </label>
        <select
          id="project-priority"
          className={inputClasses}
          value={priority}
          onChange={(event) => setPriority(event.target.value as CreateProjectRequest['priority'])}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <button className="btn-secondary" type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button
          className="btn-primary"
          type="submit"
          disabled={!folderId || !name.trim() || isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Create project'}
        </button>
      </div>
    </form>
  );
}

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const { membership } = useAuth();
  const [modal, setModal] = useState<SetupModal>(null);
  const [continueToProject, setContinueToProject] = useState(false);
  const [folderSelection, setFolderSelection] = useState({
    workspaceId: workspaceId || '',
    folderId: '',
  });
  const selectedFolderId =
    folderSelection.workspaceId === workspaceId ? folderSelection.folderId : '';
  const {
    data: workspace,
    isLoading: wsLoading,
    error: wsError,
    refetch: refetchWorkspace,
  } = useWorkspace(workspaceId!);
  const {
    data: folders,
    isLoading: foldersLoading,
    error: foldersError,
    refetch: refetchFolders,
  } = useFolderTree(workspaceId!);
  const {
    data: projects,
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useWorkspaceProjects(workspaceId!);
  const folderTasks = useTasks({ folderId: selectedFolderId, perPage: 100 }, !!selectedFolderId);
  const createFolder = useCreateFolder();
  const createProject = useCreateProject();
  const canManageStructure = membership?.role === 'admin';
  const selectedFolder = folders?.find((folder) => folder.id === selectedFolderId);
  const visibleProjects = (projects || []).filter(
    (project) => !project.isSystem && (!selectedFolderId || project.folderId === selectedFolderId),
  );

  function openFolderModal(andThenCreateProject = false) {
    setContinueToProject(andThenCreateProject);
    setModal('folder');
  }

  async function handleCreateFolder(input: CreateFolderRequest) {
    try {
      await createFolder.mutateAsync(input);
      toast.success('Folder created');
      if (continueToProject) {
        setContinueToProject(false);
        setModal('project');
      } else {
        setModal(null);
      }
    } catch {
      toast.error('Folder creation failed');
    }
  }

  async function handleCreateProject(input: CreateProjectRequest) {
    try {
      const project = await createProject.mutateAsync({ ...input, workspaceId: workspaceId! });
      toast.success('Project created — now add your first task');
      setModal(null);
      navigate(`/projects/${project.id}`);
    } catch {
      toast.error('Project creation failed');
    }
  }

  if (wsLoading || foldersLoading || projectsLoading) {
    return <LoadingSpinner className="mt-20" size="lg" />;
  }

  if (wsError || foldersError || projectsError) {
    const failedSources = [
      wsError ? 'workspace details' : '',
      foldersError ? 'folders' : '',
      projectsError ? 'projects' : '',
    ].filter(Boolean);
    const failedSourceText =
      failedSources.length > 1
        ? `${failedSources.slice(0, -1).join(', ')} and ${failedSources.at(-1)}`
        : failedSources[0];

    return (
      <div className="p-6">
        <ErrorDisplay
          title="Workspace could not be loaded"
          message={`We couldn't load ${failedSourceText}.`}
          onRetry={() => {
            if (wsError) void refetchWorkspace();
            if (foldersError) void refetchFolders();
            if (projectsError) void refetchProjects();
          }}
        />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="p-6">
        <ErrorDisplay
          title="Workspace not found"
          message="This workspace does not exist or you don't have access."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-lg font-bold text-primary-700">
              {workspace.name.charAt(0).toUpperCase()}
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{workspace.name}</h1>
              {workspace.description && (
                <p className="mt-0.5 text-sm text-slate-500">{workspace.description}</p>
              )}
            </div>
          </div>
          {canManageStructure && (
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={() => openFolderModal()}>
                New folder
              </button>
              {folders && folders.length > 0 && (
                <button className="btn-primary" onClick={() => setModal('project')}>
                  New project
                </button>
              )}
            </div>
          )}
        </div>
        {canManageStructure && folders?.length === 0 && (
          <p className="mt-3 text-sm text-slate-500">
            Start with a folder, then create a project inside it and add tasks.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Folder tree sidebar */}
        <div className="lg:col-span-3">
          <div className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Folders
              </h2>
              {canManageStructure && (
                <button
                  className="text-sm font-medium text-primary-600 hover:text-primary-700"
                  onClick={() => openFolderModal()}
                >
                  + Add
                </button>
              )}
            </div>
            {folders && folders.length > 0 ? (
              <FolderTree
                folders={folders}
                selectedFolderId={selectedFolderId}
                onSelect={(folder) =>
                  setFolderSelection({
                    workspaceId: workspaceId || '',
                    folderId: folder.id,
                  })
                }
              />
            ) : (
              <p className="text-sm text-slate-400">No folders yet</p>
            )}
          </div>
        </div>

        {/* Project list */}
        <div className="lg:col-span-9">
          {selectedFolderId && (
            <section className="mb-8" aria-labelledby="folder-tasks-heading" aria-live="polite">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary-600">
                    Selected folder
                  </p>
                  <h2
                    id="folder-tasks-heading"
                    className="mt-1 text-lg font-semibold text-slate-900"
                  >
                    Tasks in {selectedFolder?.name || 'this folder'}
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    setFolderSelection({
                      workspaceId: workspaceId || '',
                      folderId: '',
                    })
                  }
                >
                  Show all projects
                </button>
              </div>
              {folderTasks.error ? (
                <ErrorDisplay
                  title="Tasks could not be loaded"
                  message="Try loading this folder again."
                  onRetry={() => folderTasks.refetch()}
                />
              ) : (
                <div className="overflow-x-auto">
                  <TaskTable
                    tasks={folderTasks.data?.data || []}
                    isLoading={folderTasks.isLoading}
                  />
                </div>
              )}
            </section>
          )}

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {selectedFolder ? `Projects in ${selectedFolder.name}` : 'Projects'}
            </h2>
            {canManageStructure && folders && folders.length > 0 && (
              <button className="btn-primary" onClick={() => setModal('project')}>
                New project
              </button>
            )}
          </div>

          {visibleProjects.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {visibleProjects.map((project: Project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="font-semibold text-slate-900">
                      {project.name || project.folderId}
                    </h3>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${projectStatusColors[project.status] || 'bg-slate-100 text-slate-600'}`}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    {project.dueDate && (
                      <span>Due: {new Date(project.dueDate).toLocaleDateString()}</span>
                    )}
                    {project.budget != null && (
                      <span>Budget: ${project.budget.toLocaleString()}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No projects yet"
              description={
                canManageStructure
                  ? folders && folders.length > 0
                    ? selectedFolder
                      ? `Create a project in ${selectedFolder.name}, or keep tasks in General Tasks.`
                      : 'Create a project, then open it to add tasks.'
                    : 'Create a folder first. Your projects and tasks will live inside it.'
                  : selectedFolder
                    ? 'This folder has no regular projects. Its direct tasks are shown above.'
                    : 'An administrator needs to create a project before tasks can be added.'
              }
              action={
                canManageStructure ? (
                  folders && folders.length > 0 ? (
                    <button className="btn-primary" onClick={() => setModal('project')}>
                      Create first project
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={() => openFolderModal(true)}>
                      Create folder and continue
                    </button>
                  )
                ) : undefined
              }
            />
          )}
        </div>
      </div>

      {modal === 'folder' && (
        <ModalShell
          title={continueToProject ? 'First, create a folder' : 'Create folder'}
          onClose={() => {
            setContinueToProject(false);
            setModal(null);
          }}
        >
          <CreateFolderForm
            workspaceId={workspaceId!}
            isSubmitting={createFolder.isPending}
            onSubmit={handleCreateFolder}
            onCancel={() => {
              setContinueToProject(false);
              setModal(null);
            }}
          />
        </ModalShell>
      )}

      {modal === 'project' && folders && folders.length > 0 && (
        <ModalShell title="Create project" onClose={() => setModal(null)}>
          <CreateProjectForm
            folders={folders}
            isSubmitting={createProject.isPending}
            onSubmit={handleCreateProject}
            onCancel={() => setModal(null)}
          />
        </ModalShell>
      )}
    </div>
  );
}
