'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    MessageSquare,
    LayoutDashboard,
    Settings,
} from 'lucide-react';

interface NavItem {
    href: string;
    label: string;
    icon: React.ReactNode;
}

const navItems: NavItem[] = [
    { href: '/chat', label: 'Chat', icon: <MessageSquare size={20} /> },
    { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { href: '/settings', label: 'Settings', icon: <Settings size={20} /> },
];

/**
 * Returns true when the current pathname matches a nav item's href.
 *
 * Rules:
 * - "/" matches only the exact root path.
 * - "/settings" matches any path starting with "/settings" (prefix match)
 *   so the Settings item stays highlighted on sub-pages.
 * - All other hrefs use exact match with trailing-slash normalisation.
 */
function isNavActive(pathname: string, href: string): boolean {
    const norm = (p: string) => p.replace(/\/$/, '') || '/';
    const current = norm(pathname);
    const target  = norm(href);

    // Settings: prefix match so it highlights on /settings/tools, /settings/memory, etc.
    if (target === '/settings') return current.startsWith('/settings');

    return current === target;
}

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar fixed left-0 top-0 z-40 hidden sm:flex h-screen w-64 flex-col border-r border-[var(--border)]">
            {/* Brand Header */}
            <div className="flex h-16 items-center gap-3 border-b border-[var(--border)] px-5">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-black/60 shadow-[0_0_24px_var(--accent-glow)]">
                    <Image
                        src="/images/aurelius-icon.png"
                        alt="Aurelius logo"
                        fill
                        className="object-contain p-1"
                        sizes="40px"
                        priority
                    />
                </div>

                <div className="min-w-0">
                    <p className="text-sm font-semibold tracking-[0.18em] text-[var(--text-primary)]">
                        Aurelius
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                        Local AI Control Plane
                    </p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 p-4">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        prefetch={false}
                        className={cn(
                            'flex items-center gap-3 rounded-[var(--radius-md)] px-4 py-3 text-sm font-medium transition-all',
                            isNavActive(pathname, item.href)
                                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
                        )}
                    >
                        {item.icon}
                        {item.label}
                    </Link>
                ))}
            </nav>
        </aside>
    );
}
