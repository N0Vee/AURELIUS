import * as React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: 'default' | 'safe' | 'sensitive' | 'dangerous';
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ className, variant = 'default', ...props }, ref) => {
        return (
            <span
                ref={ref}
                className={cn(
                    'inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full',

                    variant === 'default' && 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]',
                    variant === 'safe' && 'badge-safe',
                    variant === 'sensitive' && 'badge-sensitive',
                    variant === 'dangerous' && 'badge-dangerous',

                    className
                )}
                {...props}
            />
        );
    }
);
Badge.displayName = 'Badge';

export { Badge };
