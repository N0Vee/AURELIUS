'use client';

import { cn } from '@/lib/utils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Rough context-window sizes for common model families */
function guessContextLimit(model: string): number {
    const m = model.toLowerCase();
    if (m.includes('gpt-4o'))          return 128_000;
    if (m.includes('gpt-4.1'))         return 1_000_000;
    if (m.includes('gpt-4'))           return 128_000;
    if (m.includes('claude-3'))        return 200_000;
    if (m.includes('claude-4'))        return 200_000;
    if (m.includes('gemini-2'))        return 1_000_000;
    if (m.includes('gemini'))          return 1_000_000;
    if (m.includes('llama'))           return 128_000;
    if (m.includes('mistral'))         return 128_000;
    if (m.includes('deepseek'))        return 128_000;
    if (m.includes('qwen'))            return 128_000;
    return 128_000; // sensible default
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TokenUsageBarProps {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    model: string;
    turnCount: number;
    /** Real context window from OpenRouter API; falls back to heuristic if omitted */
    contextLimit?: number;
}

export function TokenUsageBar({
    totalTokens,
    promptTokens,
    completionTokens,
    model,
    turnCount,
    contextLimit: contextLimitProp,
}: TokenUsageBarProps) {
    if (totalTokens === 0) return null;

    const contextLimit = contextLimitProp || guessContextLimit(model);
    const pct = Math.min((totalTokens / contextLimit) * 100, 100);

    const barColor =
        pct > 80
            ? 'bg-[var(--dangerous)]'
            : pct > 50
              ? 'bg-amber-500'
              : 'bg-[var(--accent)]';

    const tooltip = `${formatTokens(totalTokens)} / ${formatTokens(contextLimit)} tokens\n${formatTokens(promptTokens)} prompt · ${formatTokens(completionTokens)} completion\n${turnCount} turn${turnCount !== 1 ? 's' : ''}`;

    return (
        <div className="flex items-center gap-2 group relative" title={tooltip}>
            {/* Compact text label */}
            <span className="text-[10px] font-medium text-[var(--text-muted)] whitespace-nowrap tabular-nums">
                {formatTokens(totalTokens)}
            </span>

            {/* Progress bar */}
            <div className="w-16 h-1.5 rounded-full bg-[var(--surface)] overflow-hidden">
                <div
                    className={cn('h-full rounded-full transition-all duration-500', barColor)}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}
