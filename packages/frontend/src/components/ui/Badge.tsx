import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-atlas-mist text-atlas-canopy',
  positive: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-rose-100 text-rose-800',
} as const;

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
