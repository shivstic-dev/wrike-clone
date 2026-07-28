import { clsx } from 'clsx';
import { Panel } from '../ui';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Panel
      padding="none"
      className={clsx(
        'flex flex-col items-center justify-center border-2 border-dashed border-atlas-mist bg-atlas-paper px-6 py-12 text-center',
        className,
      )}
    >
      {icon || (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-atlas-mist">
          <svg
            className="h-6 w-6 text-atlas-current"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
            />
          </svg>
        </div>
      )}
      <h3 className="font-atlasDisplay text-base font-semibold text-atlas-ink">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Panel>
  );
}
