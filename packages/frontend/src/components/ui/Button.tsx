import { clsx } from 'clsx';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const variantClasses = {
  primary:
    'bg-atlas-current text-white hover:bg-atlas-canopy focus-visible:outline-atlas-field-note',
  secondary:
    'border border-atlas-mist bg-white text-atlas-canopy hover:bg-atlas-paper focus-visible:outline-atlas-current',
  ghost: 'text-atlas-canopy hover:bg-atlas-mist focus-visible:outline-atlas-current',
  danger:
    'bg-atlas-signalCoral text-white hover:bg-[#D96745] focus-visible:outline-atlas-field-note',
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
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});

Button.displayName = 'Button';
