'use client';

import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { VoiceProvider } from '@/components/VoiceProvider';

function WebLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex h-screen w-full bg-[var(--background)]">
            <Sidebar />
            <main className="sm:ml-64 flex-1 h-screen overflow-auto">
                {children}
            </main>
        </div>
    );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <VoiceProvider>
            <WebLayout>{children}</WebLayout>
        </VoiceProvider>
    );
}
