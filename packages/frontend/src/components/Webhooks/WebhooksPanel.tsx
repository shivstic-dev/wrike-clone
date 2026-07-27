/**
 * WebhooksPanel — manage webhook integrations for external systems.
 * Lists all webhooks, allows creating new ones, toggling active/inactive, and deleting.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import { ErrorDisplay } from '../common/ErrorDisplay';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

const EVENT_OPTIONS = [
  { value: 'task:created', label: 'Task Created' },
  { value: 'task:updated', label: 'Task Updated' },
  { value: 'task:status:changed', label: 'Task Status Changed' },
  { value: 'task:assigned', label: 'Task Assigned' },
  { value: 'task:comment:added', label: 'Comment Added' },
  { value: 'project:status:changed', label: 'Project Status Changed' },
  { value: 'approval:completed', label: 'Approval Completed' },
  { value: 'file:uploaded', label: 'File Uploaded' },
];

export default function WebhooksPanel() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);

  const { data: webhooks, isLoading, error } = useQuery({
    queryKey: ['webhooks'],
    queryFn: async () => {
      const { data } = await apiClient.get('/webhooks');
      return Array.isArray(data) ? data : [];
    },
  });

  const createWebhook = useMutation({
    mutationFn: async () => {
      await apiClient.post('/webhooks', {
        url: url.trim(),
        secret: secret.trim() || undefined,
        events: selectedEvents,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setShowCreate(false);
      setUrl('');
      setSecret('');
      setSelectedEvents([]);
      toast.success('Webhook created');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message || 'Failed to create webhook'),
  });

  const toggleWebhook = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/webhooks/${id}/toggle`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook toggled');
    },
  });

  const deleteWebhook = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      toast.success('Webhook deleted');
    },
  });

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event],
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h4 className="text-sm font-semibold text-slate-700">Webhook Integrations</h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Send real-time event notifications to external systems via HTTP POST.
          </p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary btn-sm text-xs">
          + New Webhook
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <h5 className="text-sm font-semibold text-slate-700 mb-4">Create Webhook</h5>
          <div className="space-y-4">
            <div>
              <label className="label text-xs">Endpoint URL</label>
              <input
                type="url"
                className="input text-sm"
                placeholder="https://hooks.example.com/wrike-events"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Secret (for HMAC signature verification)</label>
              <input
                type="text"
                className="input text-sm"
                placeholder="Optional shared secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
              />
            </div>
            <div>
              <label className="label text-xs">Subscribe to Events</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {EVENT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={clsx(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs cursor-pointer transition-colors',
                      selectedEvents.includes(opt.value)
                        ? 'border-primary-300 bg-primary-50 text-primary-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      checked={selectedEvents.includes(opt.value)}
                      onChange={() => toggleEvent(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => createWebhook.mutate()}
                disabled={!url.trim() || selectedEvents.length === 0 || createWebhook.isPending}
                className="btn-primary btn-sm"
              >
                {createWebhook.isPending ? 'Creating...' : 'Create Webhook'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Webhook list */}
      {error ? (
        <ErrorDisplay message="Failed to load webhooks" />
      ) : isLoading ? (
        <LoadingSpinner />
      ) : !webhooks || webhooks.length === 0 ? (
        <EmptyState
          title="No webhooks configured"
          description="Create a webhook to send real-time events to external services."
        />
      ) : (
        <div className="space-y-3">
          {webhooks.map((wh: any) => (
            <div
              key={wh.id}
              className={clsx(
                'rounded-xl border p-4 transition-colors',
                wh.is_active
                  ? 'border-slate-200 bg-white'
                  : 'border-slate-100 bg-slate-50 opacity-70',
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        'inline-block h-2 w-2 rounded-full',
                        wh.is_active ? 'bg-green-500' : 'bg-slate-300',
                      )}
                    />
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {wh.url}
                    </p>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(wh.events || []).map((evt: string) => (
                      <span
                        key={evt}
                        className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {evt}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {wh.last_triggered_at
                      ? `Last triggered: ${new Date(wh.last_triggered_at).toLocaleString()}`
                      : 'Never triggered'}
                    {wh.failure_count > 0 && (
                      <span className="ml-2 text-red-500">
                        · {wh.failure_count} failures
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => toggleWebhook.mutate({ id: wh.id, isActive: !wh.is_active })}
                    className={clsx(
                      'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      wh.is_active
                        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                        : 'bg-green-50 text-green-700 hover:bg-green-100',
                    )}
                  >
                    {wh.is_active ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this webhook?')) deleteWebhook.mutate(wh.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
