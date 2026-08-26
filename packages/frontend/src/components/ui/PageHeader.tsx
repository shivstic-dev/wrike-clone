import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function PageHeader({
  action,
  className,
  description,
  eyebrow,
  title,
  ...props
}: PageHeaderProps) {
  return (
    <header
      className={clsx(
        'flex flex-col gap-4 border-b border-atlas-mist pb-5 sm:flex-row sm:items-end sm:justify-between sm:pb-6',
        className,
      )}
      {...props}
    >
      <div>
        {eyebrow && (
          <p className="font-atlasMono text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-atlas-current">
            {eyebrow}
          </p>
        )}
        <h1
          className={clsx(
            'font-atlasDisplay text-3xl font-semibold tracking-[-0.035em] text-atlas-ink',
            eyebrow && 'mt-2',
          )}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
