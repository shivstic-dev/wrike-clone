import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../api/client';
import { useCreateWorkspace, useUpdateWorkspace, useWorkspaces } from '../api/workspaces';
import { ErrorDisplay } from '../components/common/ErrorDisplay';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import type { WorkspaceMember } from '@wrike-clone/shared';

// ---- Add Member Modal ----

function AddMemberModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [role, setRole] = useState('employee');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !tempPassword.trim()) {
      toast.error('Email and temp password are required');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient.post(`/workspaces/${workspaceId}/members`, {
        email: email.trim(),
        displayName: displayName.trim() || email.split('@')[0],
        tempPassword,
        role,
      });
      toast.success('Member added successfully');
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Object && 'response' in err
          ? (err as { response: { data: { error: { message: string } } } }).response?.data?.error
              ?.message
          : 'Failed to add member';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="workboard-card w-full max-w-md rounded-2xl border border-atlas-mist bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Add Department Member</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="colleague@company.com"
            />
          </div>
          <div>
            <label className="label">Display name</label>
            <input
              type="text"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label className="label">Temporary password</label>
            <input
              type="text"
              className="input"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              required
              minLength={8}
              placeholder="tempPass123!"
            />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="department_head">Department Head</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Adding...' : 'Add member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Workspace Members Section ----

type EditableWorkspaceMemberRole = Exclude<WorkspaceMember['role'], 'admin'>;

export function WorkspaceMemberRoleControl({
  role,
  disabled,
  onRoleChange,
}: {
  role: WorkspaceMember['role'];
  disabled: boolean;
  onRoleChange: (role: EditableWorkspaceMemberRole) => void;
}) {
  if (role === 'admin') {
    return (
      <span className="rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-xs font-medium text-primary-800">
        Admin
      </span>
    );
  }

  return (
    <select
      className={clsx(
        'rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium',
        role === 'department_head'
          ? 'bg-amber-50 text-amber-700'
          : role === 'manager'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-slate-50 text-slate-600',
      )}
      value={role}
      disabled={disabled}
      onChange={(event) => onRoleChange(event.target.value as EditableWorkspaceMemberRole)}
    >
      <option value="employee">Employee</option>
      <option value="manager">Manager</option>
      <option value="department_head">Department Head</option>
    </select>
  );
}

function WorkspaceMembers({ workspaceId }: { workspaceId: string }) {
  const {
    data: members,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: async () => {
      const { data } = await apiClient.get(`/workspaces/${workspaceId}/members`);
      return data;
    },
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const queryClient = useQueryClient();

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/workspaces/${workspaceId}/members/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      toast.success('Member removed');
    },
  });
  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiClient.patch(`/workspaces/${workspaceId}/members/${userId}`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Department role updated');
    },
    onError: () => toast.error('Role update failed'),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay message="Failed to load members" />;

  const memberList = Array.isArray(members) ? members : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-700">Members ({memberList.length})</h4>
        <button onClick={() => setShowAddModal(true)} className="btn-primary btn-sm text-xs">
          + Add member
        </button>
      </div>

      {memberList.length === 0 ? (
        <p className="text-sm text-slate-400">No members in this department yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {memberList.map((member: any) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                  {(member.display_name || member.email || '?').charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {member.display_name || member.email}
                  </p>
                  <p className="text-xs text-slate-400">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <WorkspaceMemberRoleControl
                  role={member.role}
                  disabled={updateRole.isPending}
                  onRoleChange={(role) =>
                    updateRole.mutate({
                      userId: member.userId || member.user_id,
                      role,
                    })
                  }
                />
                <button
                  onClick={() => {
                    if (confirm('Remove this member from the department?')) {
                      removeMember.mutate(member.userId || member.user_id);
                    }
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
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddMemberModal workspaceId={workspaceId} onClose={() => setShowAddModal(false)} />
      )}
    </div>
  );
}

// ---- Main Admin Page ----

export default function AdminPage() {
  const { data: workspaces, isLoading: wsLoading, error: wsError } = useWorkspaces();
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [editingDepartmentId, setEditingDepartmentId] = useState<string | null>(null);
  const [editingDepartmentName, setEditingDepartmentName] = useState('');
  const createWorkspace = useCreateWorkspace();
  const updateWorkspace = useUpdateWorkspace();

  if (wsLoading) return <LoadingSpinner className="mt-20" size="lg" />;
  if (wsError)
    return (
      <div className="p-6">
        <ErrorDisplay message="Failed to load admin data" />
      </div>
    );

  const wsList = Array.isArray(workspaces) ? workspaces : [];

  async function createDepartment(event: React.FormEvent) {
    event.preventDefault();
    if (!newDepartmentName.trim()) return;
    try {
      const created = await createWorkspace.mutateAsync({ name: newDepartmentName.trim() });
      setNewDepartmentName('');
      setSelectedWorkspace(created.id);
      toast.success('Department created');
    } catch {
      toast.error('Department creation failed');
    }
  }

  async function saveDepartmentName() {
    if (!editingDepartmentId || !editingDepartmentName.trim()) return;
    try {
      await updateWorkspace.mutateAsync({
        id: editingDepartmentId,
        name: editingDepartmentName.trim(),
      });
      setEditingDepartmentId(null);
      toast.success('Department updated');
    } catch {
      toast.error('Department update failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Admin Panel</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create departments, assign scoped roles, and manage members.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="card p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Departments</h3>
            <form className="mb-3 flex gap-2" onSubmit={createDepartment}>
              <input
                className="input min-w-0 flex-1 text-sm"
                placeholder="New department"
                value={newDepartmentName}
                onChange={(event) => setNewDepartmentName(event.target.value)}
              />
              <button
                className="btn-primary btn-sm"
                disabled={createWorkspace.isPending || !newDepartmentName.trim()}
              >
                Add
              </button>
            </form>
            {wsList.length === 0 ? (
              <p className="text-sm text-slate-400">No departments yet.</p>
            ) : (
              <div className="space-y-1">
                {wsList.map((ws: any) => (
                  <div key={ws.id} className="flex items-center gap-1">
                    {editingDepartmentId === ws.id ? (
                      <>
                        <input
                          className="input min-w-0 flex-1 text-sm"
                          value={editingDepartmentName}
                          onChange={(event) => setEditingDepartmentName(event.target.value)}
                        />
                        <button className="btn-primary btn-sm" onClick={saveDepartmentName}>
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setSelectedWorkspace(ws.id)}
                          className={clsx(
                            'flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors',
                            selectedWorkspace === ws.id
                              ? 'bg-primary-50 text-primary-700'
                              : 'text-slate-600 hover:bg-slate-50',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-600">
                              {ws.name.charAt(0).toUpperCase()}
                            </span>
                            {ws.name}
                          </span>
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          aria-label={`Rename ${ws.name}`}
                          onClick={() => {
                            setEditingDepartmentId(ws.id);
                            setEditingDepartmentName(ws.name);
                          }}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          {selectedWorkspace ? (
            <div className="card p-4">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">
                {wsList.find((workspace: any) => workspace.id === selectedWorkspace)?.name ||
                  'Department'}{' '}
                Members
              </h3>
              <WorkspaceMembers workspaceId={selectedWorkspace} />
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border-2 border-dashed border-slate-200">
              <p className="text-sm text-slate-400">Select a department to manage its members.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
