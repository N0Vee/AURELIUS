'use client';

import { useState, useEffect, useCallback } from 'react';
import { resolveSettingsApiUrl } from '@/lib/backend-api';

const SETTINGS_FETCH_MAX_ATTEMPTS = 5;
const SETTINGS_FETCH_RETRY_BASE_MS = 750;

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

    const ensureApiBase = useCallback(async (forceRefresh = false) => {
        const resolved = await resolveSettingsApiUrl(forceRefresh);
        setApiBase((current) => (current === resolved ? current : resolved));
        return resolved;
    }, []);

    // ----------------------------------------------------------
    // Fetch
    // ----------------------------------------------------------
    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        let lastError = 'Failed to load settings';

        try {
            for (let attempt = 1; attempt <= SETTINGS_FETCH_MAX_ATTEMPTS; attempt++) {
                const settingsUrl = await ensureApiBase(attempt > 1);

                try {
                    const res = await fetch(settingsUrl, { cache: 'no-store' });
                    if (!res.ok) {
                        throw new Error(`Server responded with HTTP ${res.status}`);
                    }

                    const data: Settings = await res.json();
                    setSettings(data);
                    setError(null);
                    return true;
                } catch (err) {
                    lastError = err instanceof Error ? err.message : 'Failed to load settings';

                    if (attempt < SETTINGS_FETCH_MAX_ATTEMPTS) {
                        await new Promise((resolve) => {
                            window.setTimeout(resolve, SETTINGS_FETCH_RETRY_BASE_MS * attempt);
                        });
                    }
                }
            }

            setError(lastError);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [ensureApiBase]);

    useEffect(() => {
        void fetchSettings();
    }, [fetchSettings]);

    // ----------------------------------------------------------
    // Save (PATCH)
    // ----------------------------------------------------------
    const saveSettings = useCallback(
        async (partial: Partial<Omit<Settings, 'openrouterApiKeySet'>>): Promise<boolean> => {
            const settingsUrl = apiBase ?? await ensureApiBase();

            setIsSaving(true);
            setSaveError(null);
            try {
                const res = await fetch(settingsUrl, {
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
        [apiBase, ensureApiBase]
    );

    // ----------------------------------------------------------
    // Test Connection
    // ----------------------------------------------------------
    const testConnection = useCallback(async () => {
        const settingsUrl = apiBase ?? await ensureApiBase();

        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${settingsUrl}/test`, { method: 'POST' });
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
    }, [apiBase, ensureApiBase, settings?.llmProvider]);

    const clearTestResult = useCallback(() => setTestResult(null), []);
    const clearSaveError  = useCallback(() => setSaveError(null), []);

    return {
        settings,
        isLoading: isLoading || (settings === null && !apiBase),
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
