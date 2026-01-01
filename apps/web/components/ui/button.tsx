import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'ghost' | 'outline' | 'destructive';
    size?: 'sm' | 'md' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'default', size = 'md', ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    // Base
                    'inline-flex items-center justify-center font-medium transition-all',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
                    'disabled:pointer-events-none disabled:opacity-50',

                    // Variants
                    variant === 'default' && 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90',
                    variant === 'ghost' && 'bg-transparent hover:bg-[var(--surface-hover)]',
                    variant === 'outline' && 'border border-[var(--border)] bg-transparent hover:bg-[var(--surface)]',
                    variant === 'destructive' && 'bg-[var(--dangerous)] text-white hover:bg-[var(--dangerous)]/90',

                    // Sizes
                    size === 'sm' && 'h-8 px-3 text-sm rounded-[var(--radius-sm)]',
                    size === 'md' && 'h-10 px-4 text-sm rounded-[var(--radius-md)]',
                    size === 'lg' && 'h-12 px-6 text-base rounded-[var(--radius-md)]',
                    size === 'icon' && 'h-10 w-10 rounded-[var(--radius-md)]',

                    className
                )}
                {...props}
            />
        );
    }
);
Button.displayName = 'Button';

export { Button };
