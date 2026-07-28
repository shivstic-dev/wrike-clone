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
        'sunny-card flex flex-col gap-4 rounded-3xl border border-white bg-white/80 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6',
        className,
      )}
      {...props}
    >
      <div>
        {eyebrow && (
          <p className="font-atlasMono text-xs font-bold tracking-[0.04em] text-atlas-current">
            {eyebrow}
          </p>
        )}
        <h1
          className={clsx(
            'font-atlasDisplay text-3xl font-bold tracking-[-0.02em] text-atlas-ink',
            eyebrow && 'mt-2',
          )}
        >
          {title}
        </h1>
        {description && <p className="mt-2 max-w-3xl text-base text-atlas-ink/70">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
