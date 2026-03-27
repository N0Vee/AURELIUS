'use client';

import React, { useEffect, useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { DesktopContext } from '@/components/layout/DesktopContext';
import { useRouter } from 'next/navigation';
import { X, Minus, GripHorizontal } from 'lucide-react';

export function AppLayout({ children }: { children: React.ReactNode }) {
    const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
    const router = useRouter();

    useEffect(() => {
        const checkTauri = () => {
            if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)) {
                setIsDesktop(true);
                document.documentElement.classList.add('tauri');
                document.documentElement.style.background = 'transparent';
                document.body.style.background = 'transparent';
                document.body.style.overflow = 'hidden';

                if (window.location.pathname === '/') {
                    router.push('/chat');
                }
            } else {
                setIsDesktop(false);
            }
        };

        checkTauri();
    }, [router]);

    if (isDesktop === null) return null;

    // ─── TAURI DESKTOP OVERLAY ────────────────────────────────────────────────
    if (isDesktop) {
        return (
            <DesktopContext.Provider value={true}>
                <div
                    className="w-screen h-screen bg-transparent flex items-center justify-center"
                    style={{ background: 'transparent' }}
                >
                    {/* ── Floating Panel ─────────────────────────────── */}
                    <div
                        className="flex flex-col w-full h-full overflow-hidden"
                        style={{
                            background: 'rgba(10, 10, 10, 0.72)',
                            backdropFilter: 'blur(32px)',
                            WebkitBackdropFilter: 'blur(32px)',
                            border: '1px solid rgba(245, 158, 11, 0.12)',
                            borderRadius: '20px',
                            boxShadow: '0 32px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
                        }}
                    >
                        {/* ── Titlebar / Drag Region ─────────────────── */}
                        <div
                            data-tauri-drag-region="true"
                            className="flex items-center justify-between px-4 shrink-0"
                            style={{
                                height: '44px',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                cursor: 'grab',
                            }}
                        >
                            {/* Left: Logo + Name */}
                            <div
                                data-tauri-drag-region="true"
                                className="flex items-center gap-2.5 select-none pointer-events-none"
                            >
                                <div
                                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                                    style={{ background: 'rgba(245, 158, 11, 0.15)' }}
                                >
                                    <span style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, lineHeight: 1 }}>A</span>
                                </div>
                                <span
                                    style={{
                                        fontSize: '12px',
                                        fontWeight: 600,
                                        color: 'rgba(255,255,255,0.5)',
                                        letterSpacing: '0.08em',
                                    }}
                                >
                                    Aurelius
                                </span>
                            </div>

                            {/* Center: drag handle icon */}
                            <div
                                data-tauri-drag-region="true"
                                className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
                            >
                                <GripHorizontal size={14} style={{ color: 'rgba(255,255,255,0.12)' }} />
                            </div>

                            {/* Right: Window controls */}
                            <div className="flex items-center gap-1" style={{ cursor: 'default' }}>
                                <button
                                    onClick={async () => {
                                        try {
                                            const { getCurrentWindow } = await import('@tauri-apps/api/window');
                                            await getCurrentWindow().minimize();
                                        } catch {}
                                    }}
                                    className="group flex items-center justify-center rounded-full transition-all"
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        background: 'rgba(255,255,255,0.04)',
                                    }}
                                    title="Minimize"
                                >
                                    <Minus size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            const { getCurrentWindow } = await import('@tauri-apps/api/window');
                                            await getCurrentWindow().hide();
                                        } catch {}
                                    }}
                                    className="flex items-center justify-center rounded-full transition-all hover:bg-red-500/20"
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        background: 'rgba(255,255,255,0.04)',
                                    }}
                                    title="Hide (Ctrl+Shift+Space to show)"
                                >
                                    <X size={10} style={{ color: 'rgba(255,255,255,0.3)' }} />
                                </button>
                            </div>
                        </div>

                        {/* ── Main Content ───────────────────────────── */}
                        <main
                            className="flex-1 min-h-0 overflow-hidden"
                            style={{ background: 'transparent' }}
                        >
                            {children}
                        </main>

                        {/* ── Bottom accent line ─────────────────────── */}
                        <div
                            className="shrink-0"
                            style={{
                                height: '2px',
                                background: 'linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.3) 40%, rgba(245,158,11,0.5) 50%, rgba(245,158,11,0.3) 60%, transparent 100%)',
                                borderRadius: '0 0 20px 20px',
                            }}
                        />
                    </div>
                </div>
            </DesktopContext.Provider>
        );
    }

    // ─── STANDARD WEB LAYOUT ──────────────────────────────────────────────────
    return (
        <DesktopContext.Provider value={false}>
            <div className="flex h-screen w-full bg-[var(--background)]">
                <Sidebar />
                <main className="ml-64 flex-1 h-screen overflow-auto">
                    {children}
                </main>
            </div>
        </DesktopContext.Provider>
    );
}
