'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { resolveBackendApiBase } from '@/lib/backend-api';

// ============================================================
// Types  (matches https://openrouter.ai/api/v1/models response)
// ============================================================

export interface OpenRouterModel {
    id: string;
    name: string;
    created?: number;
    description?: string;
    context_length?: number;
    architecture?: {
        modality?: string;
        input_modalities?: string[];
        output_modalities?: string[];
        tokenizer?: string;
        instruct_type?: string;
    };
    pricing?: {
        prompt: string;
        completion: string;
        request?: string;
        image?: string;
    };
    top_provider?: {
        is_moderated?: boolean;
        context_length?: number;
        max_completion_tokens?: number;
    };
    supported_parameters?: string[];
}

/** Returns true when both prompt and completion pricing are "0" */
export function isModelFree(model: OpenRouterModel): boolean {
    return (
        model.pricing?.prompt === '0' &&
        model.pricing?.completion === '0'
    );
}

/** Format context length as "8K", "128K", "1M", etc. */
export function formatContextLength(ctx: number | undefined): string | null {
    if (!ctx) return null;
    if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
    if (ctx >= 1_000)     return `${Math.round(ctx / 1_000)}K`;
    return String(ctx);
}

async function resolveModelsEndpoint(forceRefresh = false): Promise<string> {
    const base = await resolveBackendApiBase(forceRefresh);
    return `${base}/api/settings/openrouter-models`;
}

// ============================================================
// Hook
// ============================================================

/**
 * Fetches the live OpenRouter model list from the backend proxy.
 *
 * @param apiKeySet  Pass `settings.openrouterApiKeySet` — the fetch is
 *                   skipped (and the list cleared) until a key is stored.
 */
export function useOpenRouterModels(apiKeySet: boolean) {
    const [models, setModels]       = useState<OpenRouterModel[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]         = useState<string | null>(null);

    // Resolved endpoint URL cached after first probe
    const endpointRef = useRef<string | null>(null);

    // Warm-up: resolve the endpoint as soon as the component mounts
    useEffect(() => {
        let cancelled = false;
        resolveModelsEndpoint().then(url => {
            if (!cancelled) endpointRef.current = url;
        });
        return () => { cancelled = true; };
    }, []);

    const fetchModels = useCallback(async () => {
        // Resolve endpoint (uses cache after first call)
        const endpoint = endpointRef.current ?? await resolveModelsEndpoint();
        endpointRef.current = endpoint;

        if (!apiKeySet) {
            setModels([]);
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
                data: OpenRouterModel[];
                error: string | null;
            };

            if (json.error === 'no_key') {
                setModels([]);
                setError('no_key');
                return;
            }

            if (json.error) {
                throw new Error(json.error);
            }

            const list = json.data ?? [];

            // Sort: free models first (alphabetically), then paid (alphabetically)
            const sorted = [...list].sort((a, b) => {
                const aFree = isModelFree(a);
                const bFree = isModelFree(b);
                if (aFree !== bFree) return aFree ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

            setModels(sorted);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch models');
            setModels([]);
        } finally {
            setIsLoading(false);
        }
    }, [apiKeySet]);

    // Re-fetch whenever key availability changes
    useEffect(() => {
        void fetchModels();
    }, [fetchModels]);

    return {
        models,
        isLoading,
        /** null = ok | 'no_key' = key not saved yet | string = real error message */
        error,
        refetch: fetchModels,
    };
}
