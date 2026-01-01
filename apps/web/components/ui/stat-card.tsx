import { cn } from '@/lib/utils';

interface StatCardProps {
    title: string;
    value: string | number;
    change?: string;
    changeType?: 'positive' | 'negative' | 'neutral';
    icon: React.ReactNode;
    iconBg?: string;
}

export function StatCard({
    title,
    value,
    change,
    changeType = 'neutral',
    icon,
    iconBg = 'bg-[var(--accent-muted)]',
}: StatCardProps) {
    return (
        <div className="stat-card p-5">
            <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <p className="text-sm text-[var(--text-secondary)]">{title}</p>
                    <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
                    {change && (
                        <p
                            className={cn(
                                'text-xs font-medium',
                                changeType === 'positive' && 'text-[var(--safe)]',
                                changeType === 'negative' && 'text-[var(--dangerous)]',
                                changeType === 'neutral' && 'text-[var(--text-muted)]'
                            )}
                        >
                            {change}
                        </p>
                    )}
                </div>
                <div
                    className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-[var(--radius-md)] text-xl',
                        iconBg
                    )}
                >
                    {icon}
                </div>
            </div>
        </div>
    );
}
