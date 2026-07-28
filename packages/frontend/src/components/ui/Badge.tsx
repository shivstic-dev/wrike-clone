import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  info: 'border-primary-200 bg-primary-50 text-primary-800',
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
} as const;

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
