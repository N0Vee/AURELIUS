'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Hook
// ============================================================

/**
 * Controls the OS-level autostart (launch on login) behaviour.
 *
 * Uses dynamic imports so the @tauri-apps/plugin-autostart module is never
 * bundled into the web build — the same pattern used by the rest of the
 * codebase (see DesktopContext.tsx, chat/page.tsx).
 *
 * Returns `isTauri: false` and a no-op toggle in the web/browser context so
 * callers can always render unconditionally.
 */
export function useAutostart() {
    const [isTauri, setIsTauri]     = useState(false);
    const [enabled, setEnabled]     = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError]         = useState<string | null>(null);

    // ── Detect Tauri + read current autostart state ───────────────────────
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                // Reuse the same isTauri() check the rest of the app uses
                const { isTauri: checkTauri } = await import('@tauri-apps/api/core');
                if (!checkTauri()) {
                    if (!cancelled) setIsLoading(false);
                    return;
                }

                if (!cancelled) setIsTauri(true);

                const { isEnabled } = await import('@tauri-apps/plugin-autostart');
                const current = await isEnabled();
                if (!cancelled) {
                    setEnabled(current);
                    setIsLoading(false);
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : 'Autostart unavailable');
                    setIsLoading(false);
                }
            }
        }

        void init();
        return () => { cancelled = true; };
    }, []);

    // ── Toggle ────────────────────────────────────────────────────────────
    const toggle = useCallback(async (value: boolean) => {
        setError(null);
        try {
            const { enable, disable } = await import('@tauri-apps/plugin-autostart');
            if (value) {
                await enable();
            } else {
                await disable();
            }
            setEnabled(value);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update autostart');
        }
    }, []);

    return {
        /** Whether the code is running inside a Tauri window */
        isTauri,
        /** Current autostart state (false in web context) */
        enabled,
        /** True while the initial OS state is being read */
        isLoading,
        /** Non-null when the last toggle call failed */
        error,
        /** Enable or disable autostart. No-op in web context. */
        toggle,
    };
}
