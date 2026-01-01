'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, MessageSquare, LayoutDashboard, Settings, User, LogOut } from 'lucide-react';

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
}

const navItems: NavItem[] = [
    { href: '/', label: 'Home', icon: <Home size={20} /> },
    { href: '/chat', label: 'Chat', icon: <MessageSquare size={20} /> },
    { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
];

const accountItems: NavItem[] = [
    { href: '/settings', label: 'Settings', icon: <Settings size={20} /> },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-[var(--border)]">
            {/* Logo */}
            <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-6">
                <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)]">
                    <span className="text-lg font-bold text-white">A</span>
                </div>
                <span className="text-lg font-semibold text-[var(--text-primary)]">
                    AURELIUS
                </span>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 space-y-1 p-4">
                <p className="px-4 py-2 text-xs font-medium uppercase text-[var(--text-muted)]">
                    Main
                </p>
                {navItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium transition-all',
                                isActive
                                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    );
                })}

                <p className="mt-6 px-4 py-2 text-xs font-medium uppercase text-[var(--text-muted)]">
                    Account
                </p>
                {accountItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                                'flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium transition-all',
                                isActive
                                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            {/* Status Footer */}
            <div className="border-t border-[var(--border)] p-4">
                <div className="glass-strong rounded-[var(--radius-md)] p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)]">
                            <User size={18} className="text-[var(--text-secondary)]" />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-medium text-[var(--text-primary)]">Local Mode</p>
                            <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--safe)] animate-pulse" />
                                <span className="text-xs text-[var(--text-muted)]">Privacy Active</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </aside>
    );
}
