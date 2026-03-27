'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type DesktopBackendStatus =
    | 'unknown'
    | 'checking'
    | 'starting'
    | 'ready'
    | 'error';

interface UseDesktopBackendOptions {
    healthUrl?: string;
    enabled?: boolean;
    pollIntervalMs?: number;
    startupTimeoutMs?: number;
}

interface UseDesktopBackendResult {
    isDesktop: boolean;
    status: DesktopBackendStatus;
    isReady: boolean;
    isChecking: boolean;
    error: string | null;
    checkNow: () => Promise<boolean>;
}

const DEFAULT_HEALTH_URLS = [
    'http://127.0.0.1:3001/health',
    'http://localhost:3001/health',
];

function detectDesktop() {
    if (typeof window === 'undefined') return false;
    return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

export function useDesktopBackend(
    options: UseDesktopBackendOptions = {},
): UseDesktopBackendResult {
    const {
        healthUrl,
        enabled = true,
        pollIntervalMs = 2500,
        startupTimeoutMs = 30000,
    } = options;

    const healthUrls = useMemo(
        () =>
            healthUrl
                ? [healthUrl, ...DEFAULT_HEALTH_URLS.filter((url) => url !== healthUrl)]
                : DEFAULT_HEALTH_URLS,
        [healthUrl],
    );

    const isDesktop = useMemo(() => detectDesktop(), []);

    const [status, setStatus] = useState<DesktopBackendStatus>(
        isDesktop && enabled ? 'checking' : 'unknown',
    );
    const [error, setError] = useState<string | null>(null);

    // Use refs for values that checkNow reads but should NOT trigger re-creation
    const mountedRef = useRef(true);
    const checkingRef = useRef(false);
    const startTimeRef = useRef<number | null>(null);
    const statusRef = useRef(status);

    // Keep statusRef in sync
    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    const checkUrl = useCallback(async (url: string) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);

        try {
            const response = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            return response;
        } finally {
            window.clearTimeout(timeout);
        }
    }, []);

    // checkNow has STABLE dependencies only (no `status` in the dep array)
    const checkNow = useCallback(async (): Promise<boolean> => {
        if (!enabled || !isDesktop) return true;
        if (checkingRef.current) return statusRef.current === 'ready';

        // Already ready — no need to re-check
        if (statusRef.current === 'ready') return true;

        checkingRef.current = true;

        try {
            setError(null);

            if (startTimeRef.current === null) {
                startTimeRef.current = Date.now();
                setStatus('starting');
            }

            let lastStatusCode: number | null = null;
            let lastErrorMessage: string | null = null;

            for (const url of healthUrls) {
                try {
                    const response = await checkUrl(url);

                    if (!mountedRef.current) return false;

                    if (response.ok) {
                        setStatus('ready');
                        setError(null);
                        return true;
                    }

                    lastStatusCode = response.status;
                } catch (err) {
                    lastErrorMessage =
                        err instanceof Error
                            ? err.message
                            : 'Unknown backend connection error';
                }
            }

            if (!mountedRef.current) return false;

            const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
            if (elapsed >= startupTimeoutMs) {
                setStatus('error');
                if (lastStatusCode !== null) {
                    setError(`Backend did not become ready (HTTP ${lastStatusCode}).`);
                } else {
                    setError(
                        `Backend unavailable: ${lastErrorMessage ?? 'Unknown backend connection error'}`,
                    );
                }
            } else {
                // Stay in "starting" while waiting — don't flip to "checking"
                // to avoid UI flicker
                setStatus('starting');
            }

            return false;
        } finally {
            checkingRef.current = false;
        }
        // NOTE: `status` is intentionally excluded — we read from statusRef instead
        // to keep checkNow stable and avoid resetting the polling interval
    }, [enabled, healthUrls, isDesktop, startupTimeoutMs, checkUrl]);

    // Mount / unmount
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Listen to Tauri backend-status events from the Rust side
    useEffect(() => {
        if (!isDesktop) return;

        let unlisten: (() => void) | null = null;

        (async () => {
            try {
                // Dynamically import to avoid errors in non-Tauri environments
                const { listen } = await import('@tauri-apps/api/event');
                const unlistenFn = await listen<string>('backend-status', (event) => {
                    if (!mountedRef.current) return;

                    const payload = event.payload;
                    if (payload === 'ready') {
                        setStatus('ready');
                        setError(null);
                    } else if (payload === 'error') {
                        setStatus('error');
                        setError('Backend sidecar failed to start.');
                    } else if (payload === 'starting') {
                        // Only move to starting if not already ready
                        setStatus((prev) => (prev === 'ready' ? prev : 'starting'));
                    }
                });
                unlisten = unlistenFn;
            } catch {
                // Not in Tauri environment — ignore
            }
        })();

        return () => {
            unlisten?.();
        };
    }, [isDesktop]);

    // Stable polling — checkNow reference is stable so this effect
    // doesn't keep restarting
    useEffect(() => {
        if (!enabled || !isDesktop) return;

        // Initial check
        void checkNow();

        const intervalId = window.setInterval(() => {
            // Stop polling once ready
            if (statusRef.current === 'ready') return;
            void checkNow();
        }, pollIntervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [checkNow, enabled, isDesktop, pollIntervalMs]);

    return {
        isDesktop,
        status,
        isReady: status === 'ready',
        isChecking: status === 'checking' || status === 'starting',
        error,
        checkNow,
    };
}
