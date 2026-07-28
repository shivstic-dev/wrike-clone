import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
} as const;

export function Panel({ className, padding = 'md', ...props }: PanelProps) {
  return (
    <div
      className={clsx(
        'rounded-xl border border-atlas-mist bg-white shadow-sm',
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
}
