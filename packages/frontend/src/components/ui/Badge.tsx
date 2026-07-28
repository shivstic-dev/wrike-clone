import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export type BadgeTone = 'neutral' | 'info' | 'positive' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

const toneClasses = {
  neutral: 'bg-atlas-mist/70 text-atlas-ink',
  info: 'bg-atlas-mist text-atlas-canopy',
  positive: 'bg-atlas-sprout/65 text-[#315f50]',
  warning: 'bg-[#fff0bd] text-[#725b1d]',
  danger: 'bg-atlas-blush text-[#99475f]',
} as const;

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
