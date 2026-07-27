/**
 * Automation Rules UI.
 * Allows users to create, edit, toggle, and delete no-code automation rules.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { EmptyState } from '../common/EmptyState';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
// Using inline SVGs instead of @heroicons/react to avoid dependency issues

interface AutomationRule {
  id: string;
  name: string;
  isActive: boolean;
  triggerEvent: string;
  conditions: Array<{ field: string; operator: string; value: unknown }>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
}

const TRIGGER_EVENTS = [
  { value: 'task:created', label: 'Task Created' },
  { value: 'task:updated', label: 'Task Updated' },
  { value: 'task:status:changed', label: 'Status Changed' },
  { value: 'task:assigned', label: 'Task Assigned' },
  { value: 'task:comment:added', label: 'Comment Added' },
  { value: 'project:status:changed', label: 'Project Status Changed' },
  { value: 'approval:completed', label: 'Approval Completed' },
  { value: 'file:uploaded', label: 'File Uploaded' },
];

const ACTION_TYPES = [
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'change_status', label: 'Change Status' },
  { value: 'assign_user', label: 'Assign User' },
  { value: 'update_field', label: 'Update Field' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'webhook', label: 'Call Webhook' },
];

const CONDITION_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater Than' },
  { value: 'less_than', label: 'Less Than' },
  { value: 'is_set', label: 'Is Set' },
  { value: 'is_not_set', label: 'Is Not Set' },
];

function CreateRuleModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('task:created');
  const [conditions, setConditions] = useState<
    Array<{ field: string; operator: string; value: string }>
  >([]);
  const [actions, setActions] = useState<Array<{ type: string; config: Record<string, string> }>>(
    [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addCondition = () =>
    setConditions([...conditions, { field: '', operator: 'equals', value: '' }]);
  const removeCondition = (i: number) => setConditions(conditions.filter((_, idx) => idx !== i));
  const updateCondition = (i: number, key: string, val: string) => {
    const updated = [...conditions];
    (updated[i] as any)[key] = val;
    setConditions(updated);
  };

  const addAction = () => setActions([...actions, { type: 'send_notification', config: {} }]);
  const removeAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));
  const updateAction = (i: number, key: string, val: string) => {
    const updated = [...actions];
    (updated[i] as any)[key] = val;
    setActions(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || actions.length === 0) {
      toast.error('Name and at least one action are required');
      return;
    }
    setIsSubmitting(true);
    try {
      await apiClient.post('/automation', {
        name: name.trim(),
        triggerEvent,
        conditions,
        actions,
      });
      toast.success('Rule created');
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      onClose();
    } catch {
      toast.error('Failed to create rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-xl rounded-xl bg-white p-6 shadow-xl max-h-[80vh] overflow-y-auto">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Create Automation Rule</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Rule Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Notify on high priority"
              required
            />
          </div>

          <div>
            <label className="label">When (Trigger Event)</label>
            <select
              className="input"
              value={triggerEvent}
              onChange={(e) => setTriggerEvent(e.target.value)}
            >
              {TRIGGER_EVENTS.map((ev) => (
                <option key={ev.value} value={ev.value}>
                  {ev.label}
                </option>
              ))}
            </select>
          </div>

          {/* Conditions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Conditions (optional)</label>
              <button
                type="button"
                onClick={addCondition}
                className="btn-ghost btn-sm text-xs text-primary-600"
              >
                + Add condition
              </button>
            </div>
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  className="input flex-1 text-sm"
                  placeholder="Field"
                  value={cond.field}
                  onChange={(e) => updateCondition(i, 'field', e.target.value)}
                />
                <select
                  className="input w-32 text-sm"
                  value={cond.operator}
                  onChange={(e) => updateCondition(i, 'operator', e.target.value)}
                >
                  {CONDITION_OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input w-24 text-sm"
                  placeholder="Value"
                  value={cond.value}
                  onChange={(e) => updateCondition(i, 'value', e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  className="p-1 text-red-400 hover:text-red-600"
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

          {/* Actions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Then (Actions)</label>
              <button
                type="button"
                onClick={addAction}
                className="btn-ghost btn-sm text-xs text-primary-600"
              >
                + Add action
              </button>
            </div>
            {actions.map((action, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <select
                  className="input flex-1 text-sm"
                  value={action.type}
                  onChange={(e) => updateAction(i, 'type', e.target.value)}
                >
                  {ACTION_TYPES.map((at) => (
                    <option key={at.value} value={at.value}>
                      {at.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeAction(i)}
                  className="p-1 text-red-400 hover:text-red-600"
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

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn-primary">
              {isSubmitting ? 'Creating...' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AutomationRules() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    data: rules,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['automation-rules'],
    queryFn: async () => {
      const { data } = await apiClient.get('/automation');
      return data as AutomationRule[];
    },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiClient.patch(`/automation/${id}/toggle`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Rule toggled');
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/automation/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Rule deleted');
    },
  });

  if (isLoading) return <LoadingSpinner className="py-12" />;
  if (error) return <p className="text-red-500">Failed to load automation rules.</p>;

  const ruleList = Array.isArray(rules) ? rules : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Automation Rules</h3>
          <p className="text-xs text-slate-400">Create if/then rules for automatic task actions.</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-sm">
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Rule
        </button>
      </div>

      {ruleList.length === 0 ? (
        <EmptyState
          title="No automation rules"
          description="Create rules to automate repetitive tasks."
          action={
            <button onClick={() => setShowCreateModal(true)} className="btn-primary btn-sm">
              Create your first rule
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {ruleList.map((rule) => (
            <div key={rule.id} className="card flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleRule.mutate({ id: rule.id, isActive: !rule.isActive })}
                  className={clsx(
                    'relative h-5 w-9 rounded-full transition-colors',
                    rule.isActive ? 'bg-primary-600' : 'bg-slate-300',
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                      rule.isActive && 'translate-x-4',
                    )}
                  />
                </button>
                <div>
                  <p className="text-sm font-medium text-slate-900">{rule.name}</p>
                  <p className="text-xs text-slate-400">
                    When {rule.triggerEvent.replace(/_/g, ' ')} → {rule.actions?.length || 0}{' '}
                    action(s)
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm('Delete this rule?')) deleteRule.mutate(rule.id);
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
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && <CreateRuleModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}
