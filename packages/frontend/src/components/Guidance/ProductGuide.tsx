import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ShellRole } from '../../design/navigation';

interface GuideStep {
  actionLabel: string;
  body: string;
  title: string;
  to?: string;
}

export interface ProductGuideProps {
  canQuickCreate: boolean;
  onClose: () => void;
  onCreateTask: () => void;
  role: ShellRole;
}

function stepsFor(role: ShellRole, canQuickCreate: boolean): GuideStep[] {
  const finalStep =
    role === 'admin' || role === 'department_head'
      ? {
          actionLabel: 'Open reports',
          body: 'Review current task data, compare work, and export the report you can see.',
          title: 'Turn work into a report',
          to: '/reports',
        }
      : {
          actionLabel: 'Open my tasks',
          body: 'See the work assigned to you, its status, priority, and due dates in one place.',
          title: 'Keep your day focused',
          to: '/my-tasks',
        };

  return [
    {
      actionLabel: 'See dashboard',
      body: 'The dashboard shows real workload, progress, attention items, and 30-day movement for your current scope.',
      title: 'Start with the big picture',
      to: '/dashboard',
    },
    {
      actionLabel: 'Search tasks',
      body: 'Use the search bar to find a task by title instead of opening departments one by one.',
      title: 'Find anything quickly',
      to: '/search',
    },
    canQuickCreate
      ? {
          actionLabel: 'Create a task',
          body: 'Quick create saves a task immediately and lets you choose its department and folder.',
          title: 'Capture work while it is fresh',
        }
      : {
          actionLabel: 'Open my tasks',
          body: 'Your role can review assigned work here. A manager can create and assign new work.',
          title: 'Know what you can do',
          to: '/my-tasks',
        },
    finalStep,
  ];
}

export function ProductGuide({ canQuickCreate, onClose, onCreateTask, role }: ProductGuideProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const steps = stepsFor(role, canQuickCreate);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const step = steps[stepIndex]!;
  const isLast = stepIndex === steps.length - 1;

  return (
    <aside
      aria-label="OpenWork field guide"
      className="workboard-card fixed bottom-4 right-4 z-50 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-[1.5rem] border border-atlas-mist bg-white shadow-[0_24px_70px_rgba(13,59,42,0.2)]"
      role="dialog"
    >
      <div className="bg-atlas-canopy px-5 py-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-atlasMono text-[0.625rem] uppercase tracking-[0.14em] text-primary-100">
              Field guide · {stepIndex + 1} of {steps.length}
            </p>
            <h2 className="mt-2 font-atlasDisplay text-xl font-semibold tracking-[-0.025em]">
              {step.title}
            </h2>
          </div>
          <button
            aria-label="Close field guide"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 text-xl hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="mt-5 flex gap-1.5" aria-hidden="true">
          {steps.map((item, index) => (
            <span
              className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? 'bg-white' : 'bg-white/25'}`}
              key={item.title}
            />
          ))}
        </div>
      </div>
      <div className="px-5 py-5">
        <p className="text-sm leading-6 text-slate-600">{step.body}</p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            className="text-sm font-semibold text-slate-500 hover:text-atlas-ink disabled:opacity-30"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            type="button"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                className="min-h-10 rounded-xl px-3 text-sm font-semibold text-atlas-current hover:bg-atlas-paper"
                onClick={() => setStepIndex((current) => Math.min(steps.length - 1, current + 1))}
                type="button"
              >
                Next
              </button>
            )}
            {step.to ? (
              <Link
                className="inline-flex min-h-10 items-center rounded-xl bg-atlas-canopy px-4 text-sm font-semibold text-white hover:bg-atlas-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
                onClick={onClose}
                to={step.to}
              >
                {isLast ? 'Finish · ' : ''}
                {step.actionLabel}
              </Link>
            ) : (
              <button
                className="min-h-10 rounded-xl bg-atlas-canopy px-4 text-sm font-semibold text-white hover:bg-atlas-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atlas-current"
                onClick={onCreateTask}
                type="button"
              >
                {step.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
