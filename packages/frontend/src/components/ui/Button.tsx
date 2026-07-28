import { clsx } from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  primary:
    'bg-atlas-current text-white shadow-[0_4px_0_#4f4388] hover:-translate-y-0.5 hover:bg-primary-500 hover:shadow-[0_6px_0_#4f4388] active:translate-y-0.5 active:shadow-[0_2px_0_#4f4388] focus-visible:outline-atlas-canopy motion-reduce:transform-none',
  secondary:
    'border border-atlas-mist bg-white text-atlas-ink shadow-sm hover:bg-atlas-paper focus-visible:outline-atlas-current',
  ghost: 'text-atlas-current hover:bg-atlas-mist/70 focus-visible:outline-atlas-current',
  danger:
    'bg-atlas-signalCoral text-atlas-ink shadow-[0_4px_0_#bd596a] hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-atlas-canopy motion-reduce:transform-none',
} as const;

const sizeClasses = {
  sm: 'min-h-8 px-3 text-xs',
  md: 'min-h-10 px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
} as const;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, size = 'md', type = 'button', variant = 'primary', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});

Button.displayName = 'Button';
