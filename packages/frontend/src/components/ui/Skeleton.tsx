import { clsx } from 'clsx';
import type { HTMLAttributes } from 'react';

export type SkeletonProps = HTMLAttributes<HTMLDivElement>;

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={clsx('animate-pulse rounded-md bg-atlas-mist', className)}
      {...props}
    />
  );
}
