/**
 * CustomizationPanel — manages custom item types, blueprint templates,
 * and request forms for the workspace.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';

import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import { ErrorDisplay } from '../common/ErrorDisplay';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

// ─── Item Types Tab ──────────────────────────────────────────

function ItemTypesManager() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');

  const {
    data: types,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['custom-item-types'],
    queryFn: async () => {
      const { data } = await apiClient.get('/customization/item-types');
      return Array.isArray(data) ? data : [];
    },
  });

  const addType = useMutation({
    mutationFn: async () => {
      await apiClient.post('/customization/item-types', { name, color });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-item-types'] });
      setShowAdd(false);
      setName('');
      setColor('#6366f1');
      toast.success('Item type created');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create'),
  });

  const deleteType = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/customization/item-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-item-types'] });
      toast.success('Item type deleted');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Custom Item Types</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Define specialized task categories (e.g. Bug, Interview, Grant Application).
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary btn-sm text-xs">
          + New Type
        </button>
      </div>

      {error ? (
        <ErrorDisplay message="Failed to load item types" />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !types || types.length === 0 ? (
        <EmptyState
          title="No custom item types"
          description="Create item types to categorize tasks beyond standard statuses."
        />
      ) : (
        <div className="space-y-2">
          {types.map((t: any) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded text-xs text-white font-bold"
                  style={{ backgroundColor: t.color || '#6366f1' }}
                >
                  {t.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-slate-700">{t.name}</span>
                <span className="text-xs text-slate-400">{t.icon}</span>
              </div>
              <button
                onClick={() => {
                  if (confirm('Delete this item type?')) deleteType.mutate(t.id);
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
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="label text-xs">Name</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="e.g. Bug, Grant Application"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Color</label>
              <input
                type="color"
                className="h-9 w-14 rounded-lg border border-slate-300 cursor-pointer"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </div>
            <button
              onClick={() => addType.mutate()}
              disabled={!name.trim() || addType.isPending}
              className="btn-primary btn-sm"
            >
              {addType.isPending ? '...' : 'Create'}
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

// ─── Blueprints Tab ──────────────────────────────────────────

function BlueprintsManager() {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [createName, setCreateName] = useState('');
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');
  const [targetFolderId, setTargetFolderId] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const {
    data: blueprints,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['blueprints'],
    queryFn: async () => {
      const { data } = await apiClient.get('/customization/blueprints');
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: projects } = useQuery({
    queryKey: ['all-projects'],
    queryFn: async () => {
      const { data } = await apiClient.get('/projects');
      return Array.isArray(data) ? data : [];
    },
    enabled: showSave,
  });

  const { data: folders } = useQuery({
    queryKey: ['all-folders'],
    queryFn: async () => {
      const { data } = await apiClient.get('/folders');
      return Array.isArray(data) ? data : [];
    },
    enabled: showCreate,
  });

  const saveBlueprint = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/customization/blueprints/save/${selectedProjectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blueprints'] });
      setShowSave(false);
      setSelectedProjectId('');
      toast.success('Blueprint saved');
    },
  });

  const createFromBlueprint = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post('/customization/blueprints/create-from', {
        blueprintProjectId: selectedBlueprintId,
        name: createName,
        folderId: targetFolderId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-projects'] });
      setShowCreate(false);
      setCreateName('');
      setSelectedBlueprintId('');
      setTargetFolderId('');
      toast.success('Project created from blueprint');
    },
  });

  return (
    <div className="space-y-6">
      {/* Blueprints list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-sm font-semibold text-slate-700">Project Blueprints</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Reusable project templates for launching standardized workflows.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowSave(true);
                setShowCreate(false);
              }}
              className="btn-secondary btn-sm text-xs"
            >
              + Save as Blueprint
            </button>
            <button
              onClick={() => {
                setShowCreate(true);
                setShowSave(false);
              }}
              className="btn-primary btn-sm text-xs"
            >
              + Create from Blueprint
            </button>
          </div>
        </div>

        {error ? (
          <ErrorDisplay message="Failed to load blueprints" />
        ) : isLoading ? (
          <LoadingSpinner />
        ) : !blueprints || blueprints.length === 0 ? (
          <EmptyState
            title="No blueprints yet"
            description="Save an existing project as a reusable blueprint template."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {blueprints.map((bp: any) => (
              <div key={bp.id} className="rounded-lg border border-slate-200 p-4">
                <h5 className="text-sm font-semibold text-slate-800">{bp.name}</h5>
                {bp.description && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{bp.description}</p>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  Created {new Date(bp.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save as Blueprint form */}
      {showSave && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h5 className="text-sm font-semibold text-slate-700 mb-3">Save Project as Blueprint</h5>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="label text-xs">Select Project</label>
              <select
                className="input text-sm"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
              >
                <option value="">-- Choose a project --</option>
                {(projects || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => saveBlueprint.mutate()}
              disabled={!selectedProjectId || saveBlueprint.isPending}
              className="btn-primary btn-sm"
            >
              {saveBlueprint.isPending ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowSave(false)} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create from Blueprint form */}
      {showCreate && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h5 className="text-sm font-semibold text-slate-700 mb-3">
            Create Project from Blueprint
          </h5>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label text-xs">Blueprint</label>
              <select
                className="input text-sm"
                value={selectedBlueprintId}
                onChange={(e) => setSelectedBlueprintId(e.target.value)}
              >
                <option value="">-- Choose --</option>
                {(blueprints || []).map((bp: any) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs">Project Name</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="My New Project"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Target Folder</label>
              <select
                className="input text-sm"
                value={targetFolderId}
                onChange={(e) => setTargetFolderId(e.target.value)}
              >
                <option value="">-- Choose --</option>
                {(folders || []).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => createFromBlueprint.mutate()}
              disabled={
                !selectedBlueprintId ||
                !createName.trim() ||
                !targetFolderId ||
                createFromBlueprint.isPending
              }
              className="btn-primary btn-sm"
            >
              {createFromBlueprint.isPending ? 'Creating...' : 'Create Project'}
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Request Forms Tab ───────────────────────────────────────

export function RequestFormsManager() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [folderId, setFolderId] = useState('');
  const [isPublic, setIsPublic] = useState(false);

  const { data: folders } = useQuery({
    queryKey: ['all-folders'],
    queryFn: async () => {
      const { data } = await apiClient.get('/folders');
      return Array.isArray(data) ? data : [];
    },
    enabled: showAdd,
  });

  const {
    data: forms,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['request-forms'],
    queryFn: async () => {
      const { data } = await apiClient.get('/customization/request-forms');
      return Array.isArray(data) ? data : [];
    },
  });

  const addForm = useMutation({
    mutationFn: async () => {
      await apiClient.post('/customization/request-forms', {
        name: formName,
        description: formDesc.trim() || undefined,
        folderId,
        isPublic,
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'description', type: 'text', required: false },
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request-forms'] });
      setShowAdd(false);
      setFormName('');
      setFormDesc('');
      setFolderId('');
      setIsPublic(false);
      toast.success('Request form created');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create'),
  });

  const updatePublication = useMutation({
    mutationFn: async ({ formId, isPublic }: { formId: string; isPublic: boolean }) => {
      await apiClient.patch(`/customization/request-forms/${formId}`, { isPublic });
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['request-forms'] });
      toast.success(variables.isPublic ? 'Request form published' : 'Request form unpublished');
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message || 'Failed to update publication'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Request Forms</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Intake forms that let stakeholders submit tasks with predefined fields.
          </p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary btn-sm text-xs">
          + New Form
        </button>
      </div>

      {error ? (
        <ErrorDisplay message="Failed to load request forms" />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !forms || forms.length === 0 ? (
        <EmptyState
          title="No request forms"
          description="Create intake forms so team members and external stakeholders can submit structured requests."
        />
      ) : (
        <div className="space-y-2">
          {forms.map((f: any) => (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-slate-700">{f.name}</p>
                {f.description && <p className="text-xs text-slate-400 mt-0.5">{f.description}</p>}
                <p className="text-xs text-slate-400 mt-0.5">
                  Fields: {Array.isArray(f.form_fields) ? f.form_fields.length : 0}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={clsx(
                    'rounded-full px-2 py-1 text-xs font-medium',
                    f.is_public ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                  )}
                >
                  {f.is_public ? 'Published' : 'Unpublished'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updatePublication.mutate({ formId: f.id, isPublic: !Boolean(f.is_public) })
                  }
                  disabled={updatePublication.isPending}
                  className="btn-secondary btn-sm text-xs"
                >
                  {updatePublication.isPending
                    ? 'Saving...'
                    : f.is_public
                      ? 'Unpublish'
                      : 'Publish'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="space-y-3">
            <div>
              <label className="label text-xs">Form Name</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="e.g. Grant Request Form"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Description</label>
              <textarea
                className="input text-sm resize-none"
                rows={2}
                placeholder="Optional description"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Target Folder (where tasks are created)</label>
              <select
                className="input text-sm"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
              >
                <option value="">-- Choose --</option>
                {(folders || []).map((f: any) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={isPublic}
                onChange={(event) => setIsPublic(event.target.checked)}
              />
              <span>
                <span className="block font-medium">Publish for external submissions</span>
                <span className="block text-xs text-slate-500">
                  Anyone with the form link can view and submit it.
                </span>
              </span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => addForm.mutate()}
                disabled={!formName.trim() || !folderId || addForm.isPending}
                className="btn-primary btn-sm"
              >
                {addForm.isPending ? '...' : 'Create Form'}
              </button>
              <button onClick={() => setShowAdd(false)} className="btn-secondary btn-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Customization Panel ────────────────────────────────

type Tab = 'item-types' | 'blueprints' | 'request-forms';

const TABS: { key: Tab; label: string }[] = [
  { key: 'item-types', label: 'Item Types' },
  { key: 'blueprints', label: 'Blueprints' },
  { key: 'request-forms', label: 'Request Forms' },
];

export default function CustomizationPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('item-types');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-slate-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'item-types' && <ItemTypesManager />}
      {activeTab === 'blueprints' && <BlueprintsManager />}
      {activeTab === 'request-forms' && <RequestFormsManager />}
    </div>
  );
}
