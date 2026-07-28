import { clsx } from 'clsx';
import type { HTMLAttributes, ReactNode } from 'react';
import { Panel } from './Panel';

export interface StatePanelProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'empty' | 'error' | 'forbidden';
  icon?: ReactNode;
}

const toneClasses = {
  empty: 'border-dashed border-atlas-mist bg-atlas-paper',
  error: 'border-rose-200 bg-rose-50',
  forbidden: 'border-amber-200 bg-amber-50',
} as const;

export function StatePanel({
  action,
  className,
  description,
  icon,
  title,
  tone = 'empty',
  ...props
}: StatePanelProps) {
  return (
    <Panel
      className={clsx(
        'flex flex-col items-center justify-center text-center',
        toneClasses[tone],
        className,
      )}
      role={tone === 'error' ? 'alert' : undefined}
      {...props}
    >
      {icon && <div className="mb-4">{icon}</div>}
      <h2 className="font-atlasDisplay text-lg font-bold text-atlas-ink">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Panel>
  );
}
