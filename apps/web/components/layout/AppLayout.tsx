'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { DesktopDetector, useIsDesktop } from '@/components/layout/DesktopContext';
import { UpdateNotification } from '@/components/layout/UpdateNotification';
import { VoiceProvider } from '@/components/VoiceProvider';

// ── Web Layout ────────────────────────────────────────────────────────────────
function WebLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen w-full bg-[var(--background)]">
            <Sidebar />
            <main className="sm:ml-64 flex-1 h-screen overflow-auto">
                {children}
            </main>
            <UpdateNotification />
        </div>
    );
}

// ── Overlay Layout (Tauri desktop) ────────────────────────────────────────────
function OverlayLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen w-full bg-transparent overflow-hidden">
            <main className="flex-1 h-screen overflow-hidden">
                {children}
            </main>
            <UpdateNotification />
        </div>
    );
}

// ── Inner (reads context, handles redirect) ───────────────────────────────────
function InnerLayout({ children }: { children: React.ReactNode }) {
    const isDesktop = useIsDesktop();
    const router    = useRouter();
    const pathname  = usePathname();

    // On desktop, always land on /chat
    useEffect(() => {
        if (isDesktop && pathname !== '/chat') {
            router.replace('/chat');
        }
    }, [isDesktop, pathname, router]);

    if (isDesktop) {
        return <OverlayLayout>{children}</OverlayLayout>;
    }

    return <WebLayout>{children}</WebLayout>;
}

// ── Public export ─────────────────────────────────────────────────────────────
export function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <DesktopDetector>
            <VoiceProvider>
                <InnerLayout>{children}</InnerLayout>
            </VoiceProvider>
        </DesktopDetector>
    );
}
