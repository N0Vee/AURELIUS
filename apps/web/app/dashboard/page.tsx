'use client';

import { useSystemStats } from '@/hooks/useSystemStats';
import { Container } from '@/components/layout';
import { Card, CardHeader, CardTitle, CardContent, StatCard, ProgressRing } from '@/components/ui';
import { Cpu, MemoryStick, MonitorSpeaker, Clock, Activity, Thermometer } from 'lucide-react';

function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
}

export default function DashboardPage() {
    const { stats, isLoading, error } = useSystemStats({ refreshInterval: 2000 });

    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Card className="max-w-md text-center">
                    <CardContent className="py-12 px-8">
                        <div className="flex justify-center mb-4">
                            <Activity size={48} className="text-[var(--dangerous)]" />
                        </div>
                        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                            Backend Not Connected
                        </h2>
                        <p className="text-[var(--text-secondary)] mb-4">
                            Start the backend server to see live stats
                        </p>
                        <code className="text-sm text-[var(--accent)] bg-[var(--surface)] px-3 py-2 rounded-[var(--radius-sm)]">
                            bun run dev:backend
                        </code>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen py-8">
            <Container>
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-[var(--text-muted)]">Pages / Dashboard</p>
                            <h1 className="text-3xl font-bold text-[var(--text-primary)]">
                                Dashboard
                            </h1>
                        </div>
                        <div className="flex items-center gap-3 glass-strong px-4 py-2 rounded-[var(--radius-md)]">
                            <span className={`w-2 h-2 rounded-full ${stats ? 'bg-[var(--safe)] animate-pulse' : 'bg-[var(--text-muted)]'}`} />
                            <span className="text-sm text-[var(--text-secondary)]">
                                {stats ? 'System Online' : 'Connecting...'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Top Stats Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                    <StatCard
                        title="CPU Usage"
                        value={isLoading ? '—' : `${stats?.cpu.usage ?? 0}%`}
                        change={stats ? `${stats.cpu.cores} cores` : ''}
                        changeType="neutral"
                        icon={<Cpu size={24} className="text-[var(--accent)]" />}
                        iconBg="bg-[var(--accent-muted)]"
                    />
                    <StatCard
                        title="Memory Used"
                        value={isLoading ? '—' : `${stats?.memory.used.toFixed(1) ?? 0} GB`}
                        change={stats ? `of ${stats.memory.total.toFixed(1)} GB` : ''}
                        changeType="neutral"
                        icon={<MemoryStick size={24} className="text-[var(--safe)]" />}
                        iconBg="bg-[var(--safe-glow)]"
                    />
                    <StatCard
                        title="GPU VRAM"
                        value={isLoading ? '—' : stats?.gpu ? `${(stats.gpu.memoryUsed / 1024).toFixed(1)} GB` : 'N/A'}
                        change={stats?.gpu ? `${stats.gpu.temperature}°C` : 'No GPU'}
                        changeType={stats?.gpu && stats.gpu.temperature > 80 ? 'negative' : 'neutral'}
                        icon={<MonitorSpeaker size={24} className="text-[var(--sensitive)]" />}
                        iconBg="bg-[var(--sensitive-glow)]"
                    />
                    <StatCard
                        title="Uptime"
                        value={isLoading ? '—' : stats ? formatUptime(stats.uptime) : '—'}
                        change={stats?.platform || ''}
                        changeType="neutral"
                        icon={<Clock size={24} className="text-[var(--accent)]" />}
                        iconBg="bg-[var(--accent-muted)]"
                    />
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Welcome Card */}
                    <div className="lg:col-span-2 gradient-card rounded-[var(--radius-xl)] p-6 relative overflow-hidden">
                        <div className="relative z-10">
                            <p className="text-sm text-[var(--text-secondary)]">Welcome back,</p>
                            <h2 className="text-2xl font-bold text-[var(--text-primary)] mt-1">
                                Aum
                            </h2>
                            <p className="text-[var(--text-secondary)] mt-2 max-w-md">
                                Aurelius is ready to assist. All systems running locally with full privacy.
                            </p>
                        </div>
                        <div className="absolute right-6 top-1/2 -translate-y-1/2">
                            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--accent-muted)] opacity-50">
                                <Activity size={40} className="text-[var(--accent)]" />
                            </div>
                        </div>
                    </div>

                    {/* System Health Ring */}
                    <Card className="flex flex-col items-center justify-center py-8">
                        <CardHeader className="text-center pb-2">
                            <CardTitle>System Health</CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center">
                            <ProgressRing
                                value={stats ? Math.round(100 - stats.memory.usagePercent) : 0}
                                size={140}
                                strokeWidth={12}
                                color="var(--accent)"
                                label="Available"
                            />
                            <p className="text-sm text-[var(--text-muted)] mt-4">
                                Memory availability
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Resource Details */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {/* CPU Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Cpu size={20} className="text-[var(--accent)]" /> CPU Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[var(--text-secondary)]">Usage</span>
                                    <span className="text-[var(--text-primary)] font-medium">
                                        {stats?.cpu.usage ?? 0}%
                                    </span>
                                </div>
                                <div className="h-2 bg-[var(--surface)] rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                                        style={{ width: `${stats?.cpu.usage ?? 0}%` }}
                                    />
                                </div>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] truncate">
                                {stats?.cpu.model || 'Loading...'}
                            </p>
                        </CardContent>
                    </Card>

                    {/* GPU Details */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MonitorSpeaker size={20} className="text-[var(--sensitive)]" /> GPU Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {stats?.gpu ? (
                                <>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-[var(--text-secondary)]">VRAM</span>
                                            <span className="text-[var(--text-primary)] font-medium">
                                                {(stats.gpu.memoryUsed / 1024).toFixed(1)} / {(stats.gpu.memoryTotal / 1024).toFixed(1)} GB
                                            </span>
                                        </div>
                                        <div className="h-2 bg-[var(--surface)] rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full bg-[var(--sensitive)] transition-all duration-500"
                                                style={{ width: `${(stats.gpu.memoryUsed / stats.gpu.memoryTotal) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <div className="flex items-center gap-1 text-[var(--text-muted)]">
                                            <Activity size={14} /> {stats.gpu.utilization}%
                                        </div>
                                        <div className="flex items-center gap-1 text-[var(--text-muted)]">
                                            <Thermometer size={14} /> {stats.gpu.temperature}°C
                                        </div>
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] truncate">
                                        {stats.gpu.name}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[var(--text-muted)]">No NVIDIA GPU detected</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </Container>
        </div>
    );
}
