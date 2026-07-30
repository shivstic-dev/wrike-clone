import { useEffect, useRef } from 'react';
import type { Task } from '@wrike-clone/shared';

export interface HandoffCompletionDialogProps {
  open: boolean;
  task: Task | null;
  isSubmitting?: boolean;
  onConfirm: () => void;
  onNotYet: () => void;
  onCancel: () => void;
}

export function HandoffCompletionDialog({
  open,
  task,
  isSubmitting = false,
  onConfirm,
  onNotYet,
  onCancel,
}: HandoffCompletionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmitting, onCancel]);

  if (!open || !task) return null;

  const ownerName =
    task.handoffOwner?.displayName || task.handoffOwner?.email || 'the task owner';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-6 grid place-items-center">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="handoff-dialog-title"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200"
      >
        <div className="flex items-center gap-3 text-amber-600 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Handoff Confirmation
            </span>
          </div>
        </div>

        <h3
          id="handoff-dialog-title"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold text-slate-900 outline-none"
        >
          Has the finished work been shared with the intended recipient?
        </h3>

        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          Task owner <strong className="text-slate-800">{ownerName}</strong> requires final deliverable
          confirmation before this task is marked completed.
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onConfirm}
            className="btn-primary w-full sm:w-auto px-4 py-2 text-sm font-medium"
          >
            {isSubmitting ? 'Confirming…' : 'Yes, handoff completed'}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onNotYet}
            className="btn-secondary w-full sm:w-auto px-4 py-2 text-sm font-medium"
          >
            Not yet
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
            className="btn-ghost w-full sm:w-auto px-4 py-2 text-sm font-medium text-slate-500"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
