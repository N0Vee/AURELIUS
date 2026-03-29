'use client';

import { useSystemStats } from '@/hooks/useSystemStats';
import { useSettings }    from '@/hooks/useSettings';
import { useSkills }      from '@/hooks/useSkills';
import { useDashboardStats } from '@/hooks/useDashboardStats';
import { useOpenRouterCredits } from '@/hooks/useOpenRouterCredits';
import { Container }      from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import {
    Cpu, MemoryStick, MonitorSpeaker, Clock, Activity, Thermometer,
    MessageSquare, Zap, Brain, Hash, Server, Sparkles,
    CircleDot, TrendingUp, Database, ArrowUpRight, ArrowDownLeft,
    Bot, PlugZap, Wallet, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

function formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

function formatNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}

function formatRelative(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60_000);
    const h = Math.floor(diff / 3_600_000);
    const d = Math.floor(diff / 86_400_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    if (d < 7)  return `${d}d ago`;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─────────────────────────────────────────────────────────────
// Micro-components
// ─────────────────────────────────────────────────────────────

function StatusDot({ online }: { online: boolean }) {
    return (
        <span className={cn(
            'inline-block w-2 h-2 rounded-full shrink-0',
            online
                ? 'bg-[var(--safe)] shadow-[0_0_6px_var(--safe)] animate-pulse'
                : 'bg-[var(--text-muted)]',
        )} />
    );
}

function MiniBar({
    value,
    max = 100,
    color = 'var(--accent)',
    className,
}: {
    value: number;
    max?: number;
    color?: string;
    className?: string;
}) {
    const pct = Math.min(100, (value / max) * 100);
    return (
        <div className={cn('h-1.5 bg-[var(--surface)] rounded-full overflow-hidden', className)}>
            <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
            />
        </div>
    );
}

function StatCard({
    title,
    value,
    sub,
    icon,
    accent,
}: {
    title: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
    accent: string;
}) {
    return (
        <Card className="relative overflow-hidden">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
                            {title}
                        </p>
                        <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums leading-none">
                            {value}
                        </p>
                        {sub && (
                            <p className="text-xs text-[var(--text-muted)] mt-1.5 truncate">{sub}</p>
                        )}
                    </div>
                    <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ml-3"
                        style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)` }}
                    >
                        <span style={{ color: accent }}>{icon}</span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] mb-3 px-0.5">
            {children}
        </p>
    );
}

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const { stats, error: statsError }    = useSystemStats({ refreshInterval: 2000 });
    const { settings, isLoading: settingsLoading } = useSettings();
    const { activeSkill }                 = useSkills();
    const dash                            = useDashboardStats();
    const {
        credits,
        isLoading: creditsLoading,
        lastUpdated: creditsUpdatedAt,
        error: creditsError,
        refetch: refetchCredits,
    } = useOpenRouterCredits(settings?.openrouterApiKeySet ?? false);

    const backendOnline = !statsError && !!stats;

    // ── Derived provider info ──────────────────────────────────
    const isOpenRouter = settings?.llmProvider === 'openrouter';
    const providerLabel = isOpenRouter ? 'OpenRouter' : 'Ollama';
    const modelLabel    = isOpenRouter
        ? (settings?.openrouterModel ?? '—')
        : (settings?.ollamaModel ?? '—');
    const hostLabel     = isOpenRouter
        ? (settings?.openrouterApiKeySet ? 'API key set ✓' : 'No API key')
        : (settings?.ollamaHost ?? '—');

    // ── Credits derived values ─────────────────────────────────
    const usagePct = credits && credits.total_credits > 0
        ? Math.min(100, (credits.total_usage / credits.total_credits) * 100)
        : 0;

    // ── Token ratio for mini chart ─────────────────────────────
    const totalToks = dash.totalTokens;
    const promptPct = totalToks > 0
        ? Math.round((dash.promptTokens / totalToks) * 100)
        : 0;
    const completionPct = 100 - promptPct;

    return (
        <div className="min-h-screen py-8">
            <Container>

                {/* ── Header ──────────────────────────────────────────── */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <p className="text-sm text-[var(--text-muted)]">Pages / Dashboard</p>
                        <h1 className="text-3xl font-bold text-[var(--text-primary)]">
                            Dashboard
                        </h1>
                    </div>
                    <div className="flex items-center gap-2.5 glass-strong px-4 py-2 rounded-[var(--radius-md)]">
                        <StatusDot online={backendOnline} />
                        <span className="text-sm text-[var(--text-secondary)]">
                            {backendOnline ? 'System Online' : 'Backend Offline'}
                        </span>
                    </div>
                </div>

                {/* ── Usage stats row ──────────────────────────────────── */}
                <SectionLabel>Usage Overview</SectionLabel>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard
                        title="Conversations"
                        value={formatNum(dash.sessionCount)}
                        sub="chat sessions stored"
                        icon={<MessageSquare size={20} />}
                        accent="var(--accent)"
                    />
                    <StatCard
                        title="Messages"
                        value={formatNum(dash.messageCount)}
                        sub="in local IndexedDB"
                        icon={<Hash size={20} />}
                        accent="var(--safe)"
                    />
                    <StatCard
                        title="Tokens Today"
                        value={dash.tokensToday > 0 ? formatTokens(dash.tokensToday) : '—'}
                        sub={dash.tokensToday > 0 ? 'since midnight' : 'no usage today'}
                        icon={<Zap size={20} />}
                        accent="var(--sensitive)"
                    />
                    <StatCard
                        title="All-time Tokens"
                        value={totalToks > 0 ? formatTokens(totalToks) : '—'}
                        sub={totalToks > 0 ? `${dash.completionTokens > 0 ? formatTokens(dash.completionTokens) + ' generated' : 'across all sessions'}` : 'no usage recorded'}
                        icon={<Brain size={20} />}
                        accent="var(--accent)"
                    />
                </div>

                {/* ── Token breakdown (only if there's data) ───────────── */}
                {totalToks > 0 && (
                    <div className="mb-8">
                        <Card>
                            <CardContent className="p-5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                                        <TrendingUp size={16} className="text-[var(--accent)]" />
                                        Token Breakdown
                                    </p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        {formatTokens(totalToks)} total
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    {/* Prompt */}
                                    <div>
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                                                <ArrowUpRight size={12} className="text-[var(--sensitive)]" />
                                                Prompt (input)
                                            </span>
                                            <span className="text-[var(--text-primary)] font-medium tabular-nums">
                                                {formatTokens(dash.promptTokens)}
                                                <span className="text-[var(--text-muted)] ml-1">
                                                    ({promptPct}%)
                                                </span>
                                            </span>
                                        </div>
                                        <MiniBar
                                            value={promptPct}
                                            color="var(--sensitive)"
                                            className="h-2"
                                        />
                                    </div>
                                    {/* Completion */}
                                    <div>
                                        <div className="flex justify-between text-xs mb-1.5">
                                            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                                                <ArrowDownLeft size={12} className="text-[var(--safe)]" />
                                                Completion (output)
                                            </span>
                                            <span className="text-[var(--text-primary)] font-medium tabular-nums">
                                                {formatTokens(dash.completionTokens)}
                                                <span className="text-[var(--text-muted)] ml-1">
                                                    ({completionPct}%)
                                                </span>
                                            </span>
                                        </div>
                                        <MiniBar
                                            value={completionPct}
                                            color="var(--safe)"
                                            className="h-2"
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-[var(--text-muted)] mt-3 flex items-center gap-1">
                                    <CircleDot size={10} />
                                    OpenRouter only — Ollama usage is not tracked
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* ── Intelligence panel ───────────────────────────────── */}
                <SectionLabel>Intelligence</SectionLabel>
                <div className={cn(
                    'grid grid-cols-1 md:grid-cols-2 gap-4 mb-8',
                    isOpenRouter && settings?.openrouterApiKeySet
                        ? 'lg:grid-cols-4'
                        : 'lg:grid-cols-3',
                )}>

                    {/* Provider card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Bot size={16} className="text-[var(--accent)]" />
                                LLM Provider
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {settingsLoading ? (
                                <div className="space-y-2 animate-pulse">
                                    <div className="h-4 bg-[var(--surface)] rounded w-3/4" />
                                    <div className="h-3 bg-[var(--surface)] rounded w-1/2" />
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className={cn(
                                            'px-2 py-0.5 rounded-full text-[11px] font-semibold',
                                            isOpenRouter
                                                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                                : 'bg-[var(--safe-glow)] text-[var(--safe)]',
                                        )}>
                                            {providerLabel}
                                        </span>
                                        <StatusDot online={backendOnline && !settingsLoading} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Model</p>
                                        <p className="text-sm font-medium text-[var(--text-primary)] truncate" title={modelLabel}>
                                            {modelLabel}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                                            {isOpenRouter ? 'Key Status' : 'Host'}
                                        </p>
                                        <p className="text-xs text-[var(--text-secondary)] truncate font-mono" title={hostLabel}>
                                            {hostLabel}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Temp</p>
                                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                                            {settings?.temperature ?? '—'}
                                        </span>
                                        <span className="text-[var(--text-muted)] mx-1">·</span>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">Max tokens</p>
                                        <span className="text-xs text-[var(--text-secondary)] font-mono">
                                            {settings?.maxTokens ? formatNum(settings.maxTokens) : '—'}
                                        </span>
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>

                    {/* ── OpenRouter Credits card ── */}
                    {isOpenRouter && settings?.openrouterApiKeySet && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-sm">
                                    <Wallet size={16} className="text-[var(--accent)]" />
                                    Credits
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {creditsLoading && !credits && (
                                    <div className="space-y-2 animate-pulse">
                                        <div className="h-8 bg-[var(--surface)] rounded w-2/3" />
                                        <div className="h-2 bg-[var(--surface)] rounded w-full" />
                                        <div className="h-3 bg-[var(--surface)] rounded w-1/2" />
                                    </div>
                                )}

                                {!creditsLoading && creditsError && creditsError !== 'no_key' && (
                                    <div className="space-y-2">
                                        <p className="text-xs text-[var(--dangerous)] flex items-center gap-1.5">
                                            <AlertTriangle size={12} className="shrink-0" />
                                            Failed to load
                                        </p>
                                        <p className="text-[10px] text-[var(--text-muted)] font-mono break-all leading-relaxed">
                                            {creditsError}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => void refetchCredits()}
                                            className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                                        >
                                            <RefreshCw size={10} />
                                            Retry
                                        </button>
                                    </div>
                                )}

                                {credits && (
                                    <>
                                        {/* Remaining — big number */}
                                        <div>
                                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">
                                                Remaining
                                            </p>
                                            <p className={cn(
                                                'text-2xl font-bold tabular-nums leading-none',
                                                credits.remaining <= 0
                                                    ? 'text-[var(--dangerous)]'
                                                    : credits.remaining < 1
                                                        ? 'text-[var(--sensitive)]'
                                                        : 'text-[var(--text-primary)]',
                                            )}>
                                                ${credits.remaining.toFixed(4)}
                                            </p>
                                        </div>

                                        {/* Usage bar */}
                                        <div>
                                            <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1.5">
                                                <span>Used {usagePct.toFixed(1)}%</span>
                                                <span>${credits.total_credits.toFixed(2)} total</span>
                                            </div>
                                            <MiniBar
                                                value={usagePct}
                                                color={
                                                    usagePct > 90 ? 'var(--dangerous)' :
                                                    usagePct > 70 ? 'var(--sensitive)' :
                                                    'var(--accent)'
                                                }
                                                className="h-2"
                                            />
                                        </div>

                                        {/* Breakdown */}
                                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                                            <div>
                                                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Purchased</p>
                                                <p className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                                                    ${credits.total_credits.toFixed(4)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Used</p>
                                                <p className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
                                                    ${credits.total_usage.toFixed(4)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Last updated */}
                                        <div className="flex items-center justify-between pt-0.5">
                                            {creditsUpdatedAt && (
                                                <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                                                    <RefreshCw size={9} />
                                                    {new Date(creditsUpdatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => void refetchCredits()}
                                                disabled={creditsLoading}
                                                className="text-[10px] text-[var(--accent)] hover:underline flex items-center gap-1 disabled:opacity-40 ml-auto"
                                            >
                                                <RefreshCw size={9} className={creditsLoading ? 'animate-spin' : ''} />
                                                Refresh
                                            </button>
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Active skill card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Sparkles size={16} className="text-[var(--sensitive)]" />
                                Active Skill
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {activeSkill ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2.5">
                                        <span className="text-2xl leading-none">{activeSkill.icon}</span>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                                {activeSkill.displayName}
                                            </p>
                                            <p className="text-[10px] text-[var(--safe)] font-medium">Active</p>
                                        </div>
                                    </div>
                                    {activeSkill.description && (
                                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                                            {activeSkill.description}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-4 text-center">
                                    <Sparkles size={24} className="text-[var(--text-muted)] mb-2" />
                                    <p className="text-xs text-[var(--text-muted)]">No skill active</p>
                                    <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                                        Activate one in Settings → Skills
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Backend / system card */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Server size={16} className="text-[var(--accent)]" />
                                Backend
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex items-center gap-2">
                                <StatusDot online={backendOnline} />
                                <span className="text-sm font-medium text-[var(--text-primary)]">
                                    {backendOnline ? 'Online' : 'Offline'}
                                </span>
                                <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)] bg-[var(--surface)] px-1.5 py-0.5 rounded">
                                    :4243
                                </span>
                            </div>
                            {stats ? (
                                <>
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Uptime</p>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">
                                            {formatUptime(stats.uptime)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-0.5">Platform</p>
                                        <p className="text-xs font-mono text-[var(--text-secondary)]">
                                            {stats.platform}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 pt-1">
                                        <PlugZap size={12} className="text-[var(--accent)] shrink-0" />
                                        <p className="text-[10px] text-[var(--text-muted)]">
                                            Sidecar running — auto-starts with app
                                        </p>
                                    </div>
                                </>
                            ) : (
                                <p className="text-xs text-[var(--text-muted)]">
                                    Start the backend to see details
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── System hardware ──────────────────────────────────── */}
                <SectionLabel>System Hardware</SectionLabel>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">

                    {/* CPU */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Cpu size={16} className="text-[var(--accent)]" />
                                CPU
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {stats ? (
                                <>
                                    {/* Big usage number */}
                                    <div className="flex items-end gap-3">
                                        <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)] leading-none">
                                            {stats.cpu.usage}
                                        </span>
                                        <span className="text-lg text-[var(--text-muted)] mb-0.5">%</span>
                                        <span className="ml-auto text-xs text-[var(--text-muted)]">
                                            {stats.cpu.cores} cores
                                        </span>
                                    </div>
                                    <MiniBar
                                        value={stats.cpu.usage}
                                        color={stats.cpu.usage > 80 ? 'var(--dangerous)' : stats.cpu.usage > 50 ? 'var(--sensitive)' : 'var(--accent)'}
                                        className="h-2.5"
                                    />
                                    <p className="text-xs text-[var(--text-muted)] truncate" title={stats.cpu.model}>
                                        {stats.cpu.model || 'Unknown CPU'}
                                    </p>
                                </>
                            ) : (
                                <div className="py-4 text-center text-sm text-[var(--text-muted)]">
                                    No data — backend offline
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Memory */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <MemoryStick size={16} className="text-[var(--safe)]" />
                                Memory
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {stats ? (
                                <>
                                    <div className="flex items-end gap-3">
                                        <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)] leading-none">
                                            {stats.memory.used.toFixed(1)}
                                        </span>
                                        <span className="text-lg text-[var(--text-muted)] mb-0.5">GB</span>
                                        <span className="ml-auto text-xs text-[var(--text-muted)]">
                                            of {stats.memory.total.toFixed(1)} GB
                                        </span>
                                    </div>
                                    <MiniBar
                                        value={stats.memory.usagePercent}
                                        color={stats.memory.usagePercent > 85 ? 'var(--dangerous)' : stats.memory.usagePercent > 60 ? 'var(--sensitive)' : 'var(--safe)'}
                                        className="h-2.5"
                                    />
                                    <div className="flex justify-between text-xs text-[var(--text-muted)]">
                                        <span>{stats.memory.usagePercent.toFixed(1)}% used</span>
                                        <span>{stats.memory.free.toFixed(1)} GB free</span>
                                    </div>
                                </>
                            ) : (
                                <div className="py-4 text-center text-sm text-[var(--text-muted)]">
                                    No data — backend offline
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── GPU + Recent sessions ────────────────────────────── */}
                <SectionLabel>GPU & Recent Conversations</SectionLabel>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                    {/* GPU */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <MonitorSpeaker size={16} className="text-[var(--sensitive)]" />
                                GPU
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {stats?.gpu ? (
                                <div className="space-y-4">
                                    {/* VRAM */}
                                    <div>
                                        <div className="flex items-end gap-3 mb-2">
                                            <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)] leading-none">
                                                {(stats.gpu.memoryUsed / 1024).toFixed(1)}
                                            </span>
                                            <span className="text-lg text-[var(--text-muted)] mb-0.5">GB VRAM</span>
                                            <span className="ml-auto text-xs text-[var(--text-muted)]">
                                                of {(stats.gpu.memoryTotal / 1024).toFixed(1)} GB
                                            </span>
                                        </div>
                                        <MiniBar
                                            value={stats.gpu.memoryUsed}
                                            max={stats.gpu.memoryTotal}
                                            color="var(--sensitive)"
                                            className="h-2.5"
                                        />
                                    </div>

                                    {/* Utilization + Temp */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-[var(--surface)] rounded-[var(--radius-md)] p-3">
                                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1">
                                                <Activity size={10} /> Utilization
                                            </p>
                                            <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">
                                                {stats.gpu.utilization}%
                                            </p>
                                        </div>
                                        <div className="bg-[var(--surface)] rounded-[var(--radius-md)] p-3">
                                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider mb-1 flex items-center gap-1">
                                                <Thermometer size={10} /> Temp
                                            </p>
                                            <p className={cn(
                                                'text-xl font-bold tabular-nums',
                                                stats.gpu.temperature > 80
                                                    ? 'text-[var(--dangerous)]'
                                                    : stats.gpu.temperature > 65
                                                        ? 'text-[var(--sensitive)]'
                                                        : 'text-[var(--text-primary)]',
                                            )}>
                                                {stats.gpu.temperature}°C
                                            </p>
                                        </div>
                                    </div>

                                    <p className="text-xs text-[var(--text-muted)] truncate" title={stats.gpu.name}>
                                        {stats.gpu.name}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <MonitorSpeaker size={32} className="text-[var(--text-muted)] mb-2 opacity-40" />
                                    <p className="text-sm text-[var(--text-muted)]">No NVIDIA GPU detected</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">
                                        Using CPU inference
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Recent sessions */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Database size={16} className="text-[var(--accent)]" />
                                Recent Conversations
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {dash.recentSessions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <MessageSquare size={32} className="text-[var(--text-muted)] mb-2 opacity-40" />
                                    <p className="text-sm text-[var(--text-muted)]">No conversations yet</p>
                                    <p className="text-xs text-[var(--text-muted)] mt-1 opacity-60">
                                        Start chatting to see sessions here
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {dash.recentSessions.map((session) => (
                                        <div
                                            key={session.id}
                                            className="flex items-center gap-3 px-2 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--surface)] transition-colors group"
                                        >
                                            {/* Icon */}
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
                                                <MessageSquare size={13} className="text-[var(--accent)]" />
                                            </div>

                                            {/* Title + date */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                                                    {session.title}
                                                </p>
                                                <p className="text-[10px] text-[var(--text-muted)]">
                                                    {formatRelative(session.updatedAt)}
                                                </p>
                                            </div>

                                            {/* Token count */}
                                            {session.usage && session.usage.totalTokens > 0 ? (
                                                <div className="shrink-0 text-right">
                                                    <p className="text-xs font-medium tabular-nums text-[var(--text-secondary)]">
                                                        {formatTokens(session.usage.totalTokens)}
                                                    </p>
                                                    <p className="text-[10px] text-[var(--text-muted)]">
                                                        tokens
                                                    </p>
                                                </div>
                                            ) : (
                                                <span className="shrink-0 text-[10px] text-[var(--text-muted)] opacity-50">
                                                    —
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Clock row ────────────────────────────────────────── */}
                {stats && (
                    <div className="mt-4">
                        <Card>
                            <CardContent className="py-3 px-5">
                                <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                                    <span className="flex items-center gap-1.5">
                                        <Clock size={12} />
                                        System uptime: <span className="text-[var(--text-secondary)] font-medium ml-1">{formatUptime(stats.uptime)}</span>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Activity size={12} />
                                        Stats refresh every 2s
                                    </span>
                                    <span>
                                        Platform: <span className="text-[var(--text-secondary)] font-medium">{stats.platform}</span>
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                )}

            </Container>
        </div>
    );
}
