'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export interface AutomationParameter {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
}

export interface AutomationStep {
    id: string;
    toolName: string;
    label: string;
    args: Record<string, string>;
    condition?: 'always' | 'previous_success' | 'previous_failure';
}

export interface CustomAutomation {
    id: string;
    name: string;
    displayName: string;
    description: string;
    icon?: string;
    parameters: AutomationParameter[];
    steps: AutomationStep[];
    createdAt: number;
    updatedAt: number;
    enabled: boolean;
}

export type AutomationDraft = Omit<CustomAutomation, 'id' | 'createdAt' | 'updatedAt'>;

// ============================================================
// API base resolution
// ============================================================

const API_BASE_CANDIDATES = [
    'http://127.0.0.1:3001',
    'http://localhost:3001',
];

async function probeApiBase(base: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);

        try {
            const res = await fetch(`${base}/health`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            return res.ok;
        } finally {
            window.clearTimeout(timeout);
        }
    } catch {
        return false;
    }
}

async function resolveApiBase(): Promise<string> {
    for (const base of API_BASE_CANDIDATES) {
        if (await probeApiBase(base)) {
            return `${base}/api/automations`;
        }
    }

    return `${API_BASE_CANDIDATES[0]}/api/automations`;
}

// ============================================================
// Hook
// ============================================================

export function useAutomations() {
    const [automations, setAutomations] = useState<CustomAutomation[]>([]);
    const [isLoading, setIsLoading]     = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [apiBase, setApiBase]         = useState<string | null>(null);

    // ----------------------------------------------------------
    // Resolve API base on mount
    // ----------------------------------------------------------
    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            const resolved = await resolveApiBase();
            if (!cancelled) setApiBase(resolved);
        };

        void init();

        return () => {
            cancelled = true;
        };
    }, []);

    // ----------------------------------------------------------
    // Fetch all automations
    // ----------------------------------------------------------
    const fetchAutomations = useCallback(async () => {
        if (!apiBase) return;

        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(apiBase);
            if (!res.ok) throw new Error(`Server responded with HTTP ${res.status}`);
            const data: CustomAutomation[] = await res.json();
            setAutomations(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load automations');
        } finally {
            setIsLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase) return;
        void fetchAutomations();
    }, [apiBase, fetchAutomations]);

    // ----------------------------------------------------------
    // Create automation (POST)
    // ----------------------------------------------------------
    const createAutomation = useCallback(
        async (draft: AutomationDraft): Promise<CustomAutomation | null> => {
            if (!apiBase) return null;

            try {
                const res = await fetch(apiBase, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(draft),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Create failed with HTTP ${res.status}`);
                }

                const created: CustomAutomation = await res.json();
                await fetchAutomations();
                return created;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create automation');
                return null;
            }
        },
        [apiBase, fetchAutomations],
    );

    // ----------------------------------------------------------
    // Update automation (PATCH /:id)
    // ----------------------------------------------------------
    const updateAutomation = useCallback(
        async (id: string, partial: Partial<AutomationDraft>): Promise<boolean> => {
            if (!apiBase) return false;

            try {
                const res = await fetch(`${apiBase}/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(partial),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Update failed with HTTP ${res.status}`);
                }

                const updated: CustomAutomation = await res.json();
                setAutomations((prev) =>
                    prev.map((a) => (a.id === id ? updated : a)),
                );
                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to update automation');
                return false;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Delete automation (DELETE /:id)
    // ----------------------------------------------------------
    const deleteAutomation = useCallback(
        async (id: string): Promise<boolean> => {
            if (!apiBase) return false;

            try {
                const res = await fetch(`${apiBase}/${id}`, {
                    method: 'DELETE',
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Delete failed with HTTP ${res.status}`);
                }

                setAutomations((prev) => prev.filter((a) => a.id !== id));
                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete automation');
                return false;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Test automation (POST /:id/test)
    // ----------------------------------------------------------
    const testAutomation = useCallback(
        async (
            id: string,
            args: Record<string, string>,
        ): Promise<{ success: boolean; result: string } | null> => {
            if (!apiBase) return null;

            try {
                const res = await fetch(`${apiBase}/${id}/test`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Test failed with HTTP ${res.status}`);
                }

                const data: { success: boolean; result: string } = await res.json();
                return data;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to test automation');
                return null;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Public API
    // ----------------------------------------------------------
    return {
        automations,
        isLoading: isLoading || !apiBase,
        error,
        createAutomation,
        updateAutomation,
        deleteAutomation,
        testAutomation,
        refetch: fetchAutomations,
    };
}
