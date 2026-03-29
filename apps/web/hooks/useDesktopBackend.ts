'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type BackendStatus =
    | 'unknown'
    | 'checking'
    | 'starting'
    | 'ready'
    | 'error';

interface UseBackendOptions {
    healthUrl?: string;
    enabled?: boolean;
    pollIntervalMs?: number;
    startupTimeoutMs?: number;
}

interface UseBackendResult {
    status: BackendStatus;
    isReady: boolean;
    isChecking: boolean;
    error: string | null;
    checkNow: () => Promise<boolean>;
}

const DEFAULT_HEALTH_URLS = [
    'http://127.0.0.1:4243/health',
    'http://localhost:4243/health',
];

export function useDesktopBackend(
    options: UseBackendOptions = {},
): UseBackendResult {
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

    const [status, setStatus] = useState<BackendStatus>(enabled ? 'checking' : 'unknown');
    const [error, setError] = useState<string | null>(null);

    const mountedRef = useRef(true);
    const checkingRef = useRef(false);
    const startTimeRef = useRef<number | null>(null);
    const statusRef = useRef(status);

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

    const checkNow = useCallback(async (): Promise<boolean> => {
        if (!enabled) return true;
        if (checkingRef.current) return statusRef.current === 'ready';
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
                setError(
                    lastStatusCode !== null
                        ? `Backend did not become ready (HTTP ${lastStatusCode}).`
                        : `Backend unavailable: ${lastErrorMessage ?? 'Unknown backend connection error'}`,
                );
            } else {
                setStatus('starting');
            }

            return false;
        } finally {
            checkingRef.current = false;
        }
    }, [enabled, healthUrls, startupTimeoutMs, checkUrl]);

    // Mount / unmount tracking
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // Polling effect
    useEffect(() => {
        if (!enabled) return;

        void checkNow();

        const intervalId = window.setInterval(() => {
            if (statusRef.current === 'ready') return;
            void checkNow();
        }, pollIntervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [checkNow, enabled, pollIntervalMs]);

    return {
        status,
        isReady: status === 'ready',
        isChecking: status === 'checking' || status === 'starting',
        error,
        checkNow,
    };
}
