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
        'flex flex-col gap-4 border-b border-atlas-mist pb-6 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
      {...props}
    >
      <div>
        {eyebrow && (
          <p className="font-atlasMono text-xs font-medium uppercase tracking-[0.16em] text-atlas-current">
            {eyebrow}
          </p>
        )}
        <h1
          className={clsx('font-atlasDisplay text-3xl font-bold text-atlas-ink', eyebrow && 'mt-2')}
        >
          {title}
        </h1>
        {description && <p className="mt-2 max-w-3xl text-base text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
