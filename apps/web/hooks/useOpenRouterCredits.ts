'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// Types
// ============================================================

export interface OpenRouterCredits {
    total_credits: number;
    total_usage:   number;
    remaining:     number;
}

// ============================================================
// API base resolution  (mirrors useSettings.ts)
// ============================================================

const API_BASE_CANDIDATES = [
    'http://127.0.0.1:4243',
    'http://localhost:4243',
];

async function resolveCreditsEndpoint(): Promise<string> {
    for (const base of API_BASE_CANDIDATES) {
        try {
            const controller = new AbortController();
            const tid = window.setTimeout(() => controller.abort(), 2000);
            try {
                const res = await fetch(`${base}/health`, {
                    method: 'GET',
                    cache:  'no-store',
                    signal: controller.signal,
                });
                if (res.ok) return `${base}/api/settings/openrouter-credits`;
            } finally {
                window.clearTimeout(tid);
            }
        } catch {
            // try next candidate
        }
    }
    return `${API_BASE_CANDIDATES[0]}/api/settings/openrouter-credits`;
}

// ============================================================
// Hook
// ============================================================

const REFRESH_INTERVAL_MS = 60_000; // 60 seconds

/**
 * Fetches the OpenRouter credit balance via the backend proxy.
 *
 * @param apiKeySet  Pass `settings.openrouterApiKeySet`.
 *                   The fetch is skipped until a key is stored.
 */
export function useOpenRouterCredits(apiKeySet: boolean) {
    const [credits, setCredits]         = useState<OpenRouterCredits | null>(null);
    const [isLoading, setIsLoading]     = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);
    const [error, setError]             = useState<string | null>(null);

    // Resolved endpoint URL — cached after first probe
    const endpointRef  = useRef<string | null>(null);
    const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);

    // Warm-up: resolve endpoint on mount
    useEffect(() => {
        let cancelled = false;
        resolveCreditsEndpoint().then(url => {
            if (!cancelled) endpointRef.current = url;
        });
        return () => { cancelled = true; };
    }, []);

    const fetchCredits = useCallback(async () => {
        const endpoint = endpointRef.current ?? await resolveCreditsEndpoint();
        endpointRef.current = endpoint;

        if (!apiKeySet) {
            setCredits(null);
            setError(null);
            return;
        }

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(endpoint, { cache: 'no-store' });

            if (!res.ok) {
                throw new Error(`Backend responded with HTTP ${res.status}`);
            }

            const json = await res.json() as {
                data:  OpenRouterCredits | null;
                error: string | null;
            };

            if (json.error === 'no_key') {
                setCredits(null);
                setError('no_key');
                return;
            }

            if (json.error) {
                throw new Error(json.error);
            }

            if (json.data) {
                setCredits(json.data);
                setLastUpdated(Date.now());
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch credits');
        } finally {
            setIsLoading(false);
        }
    }, [apiKeySet]);

    // Initial fetch + re-fetch when key availability changes
    useEffect(() => {
        void fetchCredits();
    }, [fetchCredits]);

    // Auto-refresh every 60 seconds while key is set
    useEffect(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }

        if (!apiKeySet) return;

        intervalRef.current = setInterval(() => {
            void fetchCredits();
        }, REFRESH_INTERVAL_MS);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, [apiKeySet, fetchCredits]);

    return {
        credits,
        isLoading,
        lastUpdated,
        /** null = ok | 'no_key' = key not saved yet | string = real error message */
        error,
        refetch: fetchCredits,
    };
}
