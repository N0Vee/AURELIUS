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
    Workflow,
    Sparkles,
    Brain,
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
    { href: '/settings/automations', label: 'Automations', icon: <Workflow size={20} /> },
    { href: '/settings/skills', label: 'Skills', icon: <Sparkles size={20} /> },
    { href: '/settings/memory', label: 'Memory', icon: <Brain size={20} /> },
];

/**
 * Returns true when the current pathname matches a nav item's href.
 *
 * Rules:
 * - "/" matches only the exact root path.
 * - "/settings" matches "/settings" but NOT "/settings/automations" so that
 *   the parent item doesn't stay highlighted when a child is active.
 * - All other hrefs use an exact match augmented by a trailing-slash-insensitive
 *   comparison, because `trailingSlash: true` in next.config.ts causes the
 *   browser URL to carry a trailing slash while `usePathname()` may or may not
 *   include it depending on the navigation method.
 */
function isNavActive(pathname: string, href: string): boolean {
    // Normalise both sides: strip any trailing slash for comparison
    const norm = (p: string) => p.replace(/\/$/, '') || '/';
    const current = norm(pathname);
    const target  = norm(href);

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

            {/* Main Navigation */}
            <nav className="flex-1 space-y-1 p-4">
                <p className="px-4 py-2 text-xs font-medium uppercase text-[var(--text-muted)]">
                    Main
                </p>

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

                <p className="mt-6 px-4 py-2 text-xs font-medium uppercase text-[var(--text-muted)]">
                    Account
                </p>

                {accountItems.map((item) => (
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
