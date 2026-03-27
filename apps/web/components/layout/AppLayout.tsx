'use client';

import React from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { DesktopContext } from '@/components/layout/DesktopContext';

export function AppLayout({ children }: { children: React.ReactNode }) {
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
