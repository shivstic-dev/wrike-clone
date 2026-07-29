import { useEffect, useRef } from 'react';
import type { Task } from '@wrike-clone/shared';

export interface HandoffCompletionDialogProps {
  open: boolean;
  task: Task | null;
  isPending: boolean;
  onConfirm: () => void;
  onNotYet: () => void;
  onCancel: () => void;
}

export function HandoffCompletionDialog({
  open,
  task,
  isPending,
  onConfirm,
  onNotYet,
  onCancel,
}: HandoffCompletionDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || !task) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPending) {
        event.preventDefault();
        onCancel();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    headingRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isPending, onCancel, open, task]);

  if (!open || !task) return null;

  const ownerName = task.handoffOwner?.displayName || task.handoffOwner?.email || 'Task owner';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-atlas-ink/40 p-0 backdrop-blur-[2px] sm:p-4">
      <div
        className="grid min-h-full place-items-center"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isPending) onCancel();
        }}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="handoff-completion-title"
          aria-describedby="handoff-completion-question"
          className="flex min-h-screen w-full flex-col bg-white shadow-2xl outline-none sm:min-h-0 sm:max-w-lg sm:rounded-2xl sm:border sm:border-atlas-mist"
        >
          <div className="border-b border-atlas-mist bg-slate-50 px-5 py-5 sm:rounded-t-2xl sm:px-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-atlas-current">
              Final handoff
            </p>
            <h2
              ref={headingRef}
              id="handoff-completion-title"
              tabIndex={-1}
              className="mt-2 font-atlasDisplay text-xl font-semibold tracking-[-0.035em] text-atlas-ink outline-none focus-visible:ring-2 focus-visible:ring-atlas-current focus-visible:ring-offset-2 sm:text-2xl"
            >
              Confirm final handoff
            </h2>
          </div>

          <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
            <p id="handoff-completion-question" className="text-base leading-6 text-slate-700">
              Has the finished work been shared with the intended recipient?
            </p>

            <div className="mt-5 rounded-xl border border-atlas-mist border-l-4 border-l-atlas-current bg-atlas-sky px-4 py-3.5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-atlas-current shadow-[0_1px_2px_rgba(13,59,42,0.08)]"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-atlas-canopy">
                    Intended recipient
                  </p>
                  <p className="mt-1 text-sm font-semibold text-atlas-ink">{ownerName}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Task owner
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">
              Choose Not yet to keep this task in Ready for handoff.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-atlas-mist bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:rounded-b-2xl sm:px-6">
            <button
              type="button"
              disabled={isPending}
              className="btn-secondary min-h-10 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
              onClick={onNotYet}
            >
              Not yet
            </button>
            <button
              type="button"
              disabled={isPending}
              className="btn-primary min-h-10 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
              onClick={onConfirm}
            >
              Yes, handoff completed
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
