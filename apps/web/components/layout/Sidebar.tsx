'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    Home,
    MessageSquare,
    LayoutDashboard,
    Settings,
    ShieldCheck,
    Cpu,
    Globe,
} from 'lucide-react';

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
            {/* Brand Header */}
            <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-5">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-black/60 shadow-[0_0_24px_var(--accent-glow)]">
                    <Image
                        src="/images/aurelius-icon.png"
                        alt="AURELIUS logo"
                        fill
                        className="object-contain p-1"
                        sizes="40px"
                        priority
                    />
                </div>

                <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-[0.18em] text-[var(--text-primary)]">
                        AURELIUS
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Local AI Control Plane
                    </p>
                </div>
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
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
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
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </Link>
                    );
                })}
            </nav>


        </aside>
    );
}
