'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export interface Settings {
    llmProvider: 'ollama' | 'openrouter';

    // Ollama
    ollamaHost: string;
    ollamaModel: string;

    // OpenRouter
    openrouterApiKey: string;        // '***' when set, '' when not set
    openrouterApiKeySet: boolean;    // true when a key exists on the server
    openrouterModel: string;
    openrouterBaseUrl: string;
    openrouterSiteUrl: string;
    openrouterSiteName: string;

    // Network
    corsOrigin: string;

    // Audio
    audioEngineUrl: string;

    // Tools
    tavilyApiKey: string;        // '***' when set, '' when not set
    tavilyApiKeySet: boolean;    // true when a key exists on the server
    screenshotSavePath: string;
    defaultFileRoot: string;
    allowedReadRoots: string[];
    allowedWriteRoot: string;
    appSearchRoots: string[];

    // Prompt & Model Behavior
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
}

export interface TestResult {
    success: boolean;
    provider: 'ollama' | 'openrouter';
    message: string;
}

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
            return `${base}/api/settings`;
        }
    }

    return `${API_BASE_CANDIDATES[0]}/api/settings`;
}

// ============================================================
// Hook
// ============================================================

export function useSettings() {
    const [settings, setSettings]     = useState<Settings | null>(null);
    const [isLoading, setIsLoading]   = useState(true);
    const [isSaving, setIsSaving]     = useState(false);
    const [isTesting, setIsTesting]   = useState(false);
    const [error, setError]           = useState<string | null>(null);
    const [saveError, setSaveError]   = useState<string | null>(null);
    const [testResult, setTestResult] = useState<TestResult | null>(null);
    const [apiBase, setApiBase]       = useState<string | null>(null);

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
    // Fetch
    // ----------------------------------------------------------
    const fetchSettings = useCallback(async () => {
        if (!apiBase) return;

        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(apiBase);
            if (!res.ok) throw new Error(`Server responded with HTTP ${res.status}`);
            const data: Settings = await res.json();
            setSettings(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load settings');
        } finally {
            setIsLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase) return;
        void fetchSettings();
    }, [apiBase, fetchSettings]);

    // ----------------------------------------------------------
    // Save (PATCH)
    // ----------------------------------------------------------
    const saveSettings = useCallback(
        async (partial: Partial<Omit<Settings, 'openrouterApiKeySet'>>): Promise<boolean> => {
            if (!apiBase) return false;

            setIsSaving(true);
            setSaveError(null);
            try {
                const res = await fetch(apiBase, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(partial),
                });

                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Save failed with HTTP ${res.status}`);
                }

                const updated: Settings = await res.json();
                setSettings(updated);
                return true;
            } catch (err) {
                setSaveError(err instanceof Error ? err.message : 'Failed to save settings');
                return false;
            } finally {
                setIsSaving(false);
            }
        },
        [apiBase]
    );

    // ----------------------------------------------------------
    // Test Connection
    // ----------------------------------------------------------
    const testConnection = useCallback(async () => {
        if (!apiBase) return;

        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${apiBase}/test`, { method: 'POST' });
            const data: TestResult = await res.json();
            setTestResult(data);
        } catch (err) {
            setTestResult({
                success: false,
                provider: settings?.llmProvider ?? 'ollama',
                message: err instanceof Error ? err.message : 'Connection test failed',
            });
        } finally {
            setIsTesting(false);
        }
    }, [apiBase, settings?.llmProvider]);

    const clearTestResult = useCallback(() => setTestResult(null), []);
    const clearSaveError  = useCallback(() => setSaveError(null), []);

    return {
        settings,
        isLoading: isLoading || !apiBase,
        isSaving,
        isTesting,
        error,
        saveError,
        testResult,
        saveSettings,
        testConnection,
        clearTestResult,
        clearSaveError,
        refetch: fetchSettings,
    };
}
