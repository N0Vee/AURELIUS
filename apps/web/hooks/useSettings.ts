'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

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

const API_BASE = 'http://localhost:3001/api/settings';

// ============================================================
// Hook
// ============================================================

export function useSettings() {
    const [settings, setSettings]       = useState<Settings | null>(null);
    const [isLoading, setIsLoading]     = useState(true);
    const [isSaving, setIsSaving]       = useState(false);
    const [isTesting, setIsTesting]     = useState(false);
    const [error, setError]             = useState<string | null>(null);
    const [saveError, setSaveError]     = useState<string | null>(null);
    const [testResult, setTestResult]   = useState<TestResult | null>(null);

    // ----------------------------------------------------------
    // Fetch
    // ----------------------------------------------------------
    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(API_BASE);
            if (!res.ok) throw new Error(`Server responded with HTTP ${res.status}`);
            const data: Settings = await res.json();
            setSettings(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load settings');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // ----------------------------------------------------------
    // Save (PATCH)
    // ----------------------------------------------------------
    const saveSettings = useCallback(
        async (partial: Partial<Omit<Settings, 'openrouterApiKeySet'>>): Promise<boolean> => {
            setIsSaving(true);
            setSaveError(null);
            try {
                const res = await fetch(API_BASE, {
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
        []
    );

    // ----------------------------------------------------------
    // Test Connection
    // ----------------------------------------------------------
    const testConnection = useCallback(async () => {
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${API_BASE}/test`, { method: 'POST' });
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
    }, [settings?.llmProvider]);

    const clearTestResult = useCallback(() => setTestResult(null), []);
    const clearSaveError  = useCallback(() => setSaveError(null), []);

    return {
        settings,
        isLoading,
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
