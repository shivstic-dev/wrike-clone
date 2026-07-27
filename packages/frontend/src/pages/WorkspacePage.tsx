import { useParams, Link } from 'react-router-dom';
import { useFolderTree, useWorkspaceProjects, useWorkspace } from '../api/workspaces';
import { FolderTree } from '../components/Folder/FolderTree';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { EmptyState } from '../components/common/EmptyState';
import type { Project } from '@wrike-clone/shared';

const projectStatusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-amber-100 text-amber-700',
  completed: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { data: workspace, isLoading: wsLoading, error: wsError } = useWorkspace(workspaceId!);
  const { data: folders, isLoading: foldersLoading } = useFolderTree(workspaceId!);
  const {
    data: projects,
    isLoading: projectsLoading,
    error: projectsError,
    refetch,
  } = useWorkspaceProjects(workspaceId!);

  if (wsLoading || foldersLoading || projectsLoading) {
    return <LoadingSpinner className="mt-20" size="lg" />;
  }

  if (wsError || projectsError) {
    return (
      <div className="p-6">
        <ErrorDisplay message="Failed to load workspace" onRetry={() => refetch()} />
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
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Folder tree sidebar */}
        <div className="col-span-3">
          <div className="card p-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Folders
            </h2>
            {folders && folders.length > 0 ? (
              <FolderTree folders={folders} />
            ) : (
              <p className="text-sm text-slate-400">No folders yet</p>
            )}
          </div>
        </div>

        {/* Project list */}
        <div className="col-span-9">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Projects</h2>
          </div>

          {projects && projects.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {projects.map((project: Project) => (
                <Link
                  key={project.id}
                  to={`/projects/${project.id}`}
                  className="card p-5 transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="font-semibold text-slate-900">{project.folderId}</h3>
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
              description="Projects will appear here once they are created."
            />
          )}
        </div>
      </div>
    </div>
  );
}
