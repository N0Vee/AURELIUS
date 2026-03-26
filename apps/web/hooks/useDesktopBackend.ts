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
        startupTimeoutMs = 20000,
    } = options;

    const healthUrls = useMemo(
        () => healthUrl ? [healthUrl, ...DEFAULT_HEALTH_URLS.filter(url => url !== healthUrl)] : DEFAULT_HEALTH_URLS,
        [healthUrl],
    );

    const isDesktop = useMemo(() => detectDesktop(), []);
    const [status, setStatus] = useState<DesktopBackendStatus>(
        isDesktop && enabled ? 'checking' : 'unknown',
    );
    const [error, setError] = useState<string | null>(null);

    const mountedRef = useRef(true);
    const checkingRef = useRef(false);
    const startTimeRef = useRef<number | null>(null);

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

    const checkNow = useCallback(async () => {
        if (!enabled || !isDesktop) return true;
        if (checkingRef.current) return status === 'ready';

        checkingRef.current = true;

        try {
            setError(null);

            if (startTimeRef.current === null) {
                startTimeRef.current = Date.now();
                setStatus('starting');
            } else if (status !== 'ready') {
                setStatus('checking');
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
                        err instanceof Error ? err.message : 'Unknown backend connection error';
                }
            }

            if (!mountedRef.current) return false;

            const elapsed = Date.now() - (startTimeRef.current ?? Date.now());
            if (elapsed >= startupTimeoutMs) {
                setStatus('error');
                if (lastStatusCode !== null) {
                    setError(`Backend did not become ready (${lastStatusCode}).`);
                } else {
                    setError(`Backend unavailable: ${lastErrorMessage ?? 'Unknown backend connection error'}`);
                }
            } else {
                setStatus('starting');
            }

            return false;
        } finally {
            checkingRef.current = false;
        }
    }, [enabled, healthUrls, isDesktop, startupTimeoutMs, status, checkUrl]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (!enabled || !isDesktop) return;

        let intervalId: number | null = null;

        void checkNow();

        intervalId = window.setInterval(() => {
            void checkNow();
        }, pollIntervalMs);

        return () => {
            if (intervalId !== null) {
                window.clearInterval(intervalId);
            }
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
