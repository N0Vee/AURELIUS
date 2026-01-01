interface ProgressRingProps {
    value: number; // 0-100
    size?: number;
    strokeWidth?: number;
    color?: string;
    bgColor?: string;
    label?: string;
}

export function ProgressRing({
    value,
    size = 120,
    strokeWidth = 8,
    color = 'var(--accent)',
    bgColor = 'var(--surface)',
    label,
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div className="relative inline-flex items-center justify-center">
            <svg width={size} height={size} className="progress-ring">
                {/* Background circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke={bgColor}
                    strokeWidth={strokeWidth}
                />
                {/* Progress circle */}
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="transparent"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="progress-ring-circle"
                />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-[var(--text-primary)]">
                    {value}%
                </span>
                {label && (
                    <span className="text-xs text-[var(--text-muted)]">{label}</span>
                )}
            </div>
        </div>
    );
}
