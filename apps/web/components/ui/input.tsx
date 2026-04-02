import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                ref={ref}
                className={cn(
                    'flex h-10 w-full rounded-[var(--radius-md)] px-3 py-2',
                    'bg-[var(--surface)] border border-[var(--border)]',
                    'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
                    'focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    'transition-all',
                    className
                )}
                {...props}
            />
        );
    }
);
Input.displayName = 'Input';

export { Input };
