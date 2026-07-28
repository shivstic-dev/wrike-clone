import { clsx } from 'clsx';
import { Button, Panel } from '../ui';

interface ErrorDisplayProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({
  title = 'Something went wrong',
  message = 'An unexpected error occurred. Please try again.',
  onRetry,
  className,
}: ErrorDisplayProps) {
  return (
    <Panel
      padding="none"
      role="alert"
      className={clsx(
        'flex flex-col items-center justify-center border-red-200 bg-red-50/50 px-6 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-red-100">
        <svg
          className="h-5 w-5 text-red-700"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h3 className="font-atlasDisplay text-base font-semibold text-atlas-ink">{title}</h3>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Panel>
  );
}
