'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    Settings,
    Search,
    Workflow,
    Sparkles,
    Brain,
    Server,
    ChevronLeft,
} from 'lucide-react';

interface SettingsNavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
}

const settingsNav: SettingsNavItem[] = [
    { href: '/settings',             label: 'General',      icon: <Settings size={16} /> },
    { href: '/settings/tools',       label: 'Tools',        icon: <Search size={16} /> },
    { href: '/settings/automations', label: 'Automations',  icon: <Workflow size={16} /> },
    { href: '/settings/skills',      label: 'Skills',       icon: <Sparkles size={16} /> },
    { href: '/settings/memory',      label: 'Memory',       icon: <Brain size={16} /> },
    { href: '/settings/mcp',         label: 'MCP Servers',  icon: <Server size={16} /> },
];

function isActive(pathname: string, href: string): boolean {
    const norm = (p: string) => p.replace(/\/$/, '') || '/';
    return norm(pathname) === norm(href);
}

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="flex h-full">
            {/* Settings sidebar */}
            <aside className="hidden lg:flex w-[200px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg)]">
                <div className="flex items-center gap-2 px-4 py-5 border-b border-[var(--border)]">
                    <Link
                        href="/chat"
                        className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ChevronLeft size={14} />
                        Back
                    </Link>
                    <span className="text-xs text-[var(--text-muted)]">/</span>
                    <span className="text-xs font-medium text-[var(--text-secondary)]">Settings</span>
                </div>

                <nav className="flex-1 p-2 space-y-0.5">
                    {settingsNav.map(item => (
                        <Link
                            key={item.href}
                            href={item.href}
                            prefetch={false}
                            className={cn(
                                'flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-all',
                                isActive(pathname, item.href)
                                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    ))}
                </nav>
            </aside>

            {/* Settings content */}
            <div className="flex-1 min-w-0 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
