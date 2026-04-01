'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSettings, type Settings } from '@/hooks/useSettings';
import { useOpenRouterModels, isModelFree, formatContextLength } from '@/hooks/useOpenRouterModels';
import { useAutostart } from '@/hooks/useAutostart';
import { Container } from '@/components/layout';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Button, Input, Badge,
} from '@/components/ui';
import {
    Settings as SettingsIcon,

    Wifi,
    MessageSquare,
    Thermometer,
    Hash,
    RotateCcw as ResetIcon,
    Check,
    X,
    Loader2,
    Eye,
    EyeOff,
    Save,
    RotateCcw,
    AlertTriangle,
    Info,
    Zap,
    Lock,
    Radio,
    Search,
    ChevronDown,
    MonitorPlay,
    Power,
} from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// ============================================================
// Small helpers
// ============================================================

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
    return (
        <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--text-secondary)]">
            {children}
        </label>
    );
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-[var(--text-muted)]">{children}</p>;
}

// ============================================================
// Page
// ============================================================

export default function SettingsPage() {
    const {
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
    } = useSettings();

    // Draft starts as null.
    // form = draft ?? settings  →  inputs always show something once settings load.
    // On first edit, update() copies settings into draft so only changed fields diverge.
    const [draft, setDraft] = useState<Settings | null>(null);

    // The API key is never pre-filled (it comes back as '***').
    // Track it separately so we never accidentally overwrite with an empty string.
    const [apiKeyInput, setApiKeyInput]         = useState('');
    const [showApiKey, setShowApiKey]           = useState(false);
    const [saveStatus, setSaveStatus]           = useState<'idle' | 'success' | 'error'>('idle');
    const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
    const [modelSearch, setModelSearch]             = useState('');
    const modelDropdownRef = useRef<HTMLDivElement>(null);

    // ── Live OpenRouter model list ────────────────────────────────────────
    const {
        models: orModels,
        isLoading: orModelsLoading,
        error: orModelsError,
        refetch: refetchModels,
    } = useOpenRouterModels(settings?.openrouterApiKeySet ?? false);

    // ── Autostart (Desktop only) ──────────────────────────────────────────
    const {
        isTauri,
        enabled:   autostartEnabled,
        isLoading: autostartLoading,
        error:     autostartError,
        toggle:    toggleAutostart,
    } = useAutostart();
    const [autostartSaving, setAutostartSaving] = useState(false);

    const handleAutostartToggle = useCallback(async () => {
        setAutostartSaving(true);
        await toggleAutostart(!autostartEnabled);
        setAutostartSaving(false);
    }, [autostartEnabled, toggleAutostart]);

    // Effective values shown in every input field
    const form = useMemo(() => draft ?? settings, [draft, settings]);

    // Mutate one field. Lazily initialises draft from settings on first call.
    const update = useCallback(
        <K extends keyof Settings>(key: K, value: Settings[K]) => {
            setDraft(prev => {
                const base = prev ?? settings;
                if (!base) return prev;
                return { ...base, [key]: value };
            });
            clearSaveError();
            setSaveStatus('idle');
            clearTestResult();
        },
        [settings, clearSaveError, clearTestResult],
    );

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
                setModelDropdownOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // True when the draft diverges from the persisted settings
    const hasChanges = useMemo(() => {
        if (!settings) return false;

        // API key inputs are tracked separately from draft (never pre-filled)
        if (apiKeyInput.trim()) return true;

        if (!draft) return false;
        const keys = (Object.keys(settings) as (keyof Settings)[]).filter(
            k => k !== 'openrouterApiKey' && k !== 'openrouterApiKeySet'
               && k !== 'tavilyApiKey'    && k !== 'tavilyApiKeySet',
        );
        for (const k of keys) {
            if (draft[k] !== settings[k]) return true;
        }
        return false;
    }, [draft, settings, apiKeyInput]);

    const handleSave = async () => {
        const current = draft ?? settings;
        if (!current) return;

        const payload: Partial<Settings> = { ...current };

        // Send the new key if the user typed one; otherwise use sentinel to keep existing
        payload.openrouterApiKey = apiKeyInput.trim() || '***';
        payload.tavilyApiKey     = '***';

        const ok = await saveSettings(payload);
        if (ok) {
            setSaveStatus('success');
            setApiKeyInput('');
            setDraft(null);               // reset: form will now show the freshly-saved settings
            setTimeout(() => setSaveStatus('idle'), 3000);
        } else {
            setSaveStatus('error');
        }
    };

    const handleDiscard = () => {
        setDraft(null);
        setApiKeyInput('');
        setSaveStatus('idle');
        clearSaveError();
        clearTestResult();
    };

    // ── Loading ──────────────────────────────────────────────
    if (isLoading || !form) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                    <p className="text-sm text-[var(--text-muted)]">Loading settings…</p>
                </div>
            </div>
        );
    }

    // ── Backend offline ──────────────────────────────────────
    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Card className="max-w-md text-center">
                    <CardContent className="py-12 px-8">
                        <AlertTriangle size={48} className="text-[var(--dangerous)] mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                            Cannot Load Settings
                        </h2>
                        <p className="text-[var(--text-secondary)] text-sm mb-4">{error}</p>
                        <p className="text-xs text-[var(--text-muted)]">
                            Make sure the backend is running on{' '}
                            <code className="text-[var(--accent)]">localhost:4243</code>
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const ollamaActive     = form.llmProvider === 'ollama';
    const openrouterActive = form.llmProvider === 'openrouter';

    return (
        <div className="h-full overflow-y-auto py-8">
            <Container>

                {/* ── Page Header ──────────────────────────────── */}
                <div className="mb-8">
                    <p className="text-sm text-[var(--text-muted)]">Settings / General</p>

                    <div className="flex items-center justify-between mt-1">
                        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Settings</h1>

                        {/* Header actions — slide in when there are unsaved changes */}
                        <div className={cn(
                            'flex items-center gap-3 transition-all duration-300',
                            hasChanges
                                ? 'opacity-100 translate-y-0'
                                : 'opacity-0 pointer-events-none translate-y-2',
                        )}>
                            <Button variant="ghost" size="sm" onClick={handleDiscard} className="gap-2">
                                <RotateCcw size={14} />
                                Discard
                            </Button>
                            <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="gap-2 min-w-[130px]"
                            >
                                {isSaving ? (
                                    <><Loader2 size={14} className="animate-spin" />Saving…</>
                                ) : saveStatus === 'success' ? (
                                    <><Check size={14} />Saved!</>
                                ) : (
                                    <><Save size={14} />Save Changes</>
                                )}
                            </Button>
                        </div>
                    </div>

                    {/* Save error banner */}
                    {saveError && (
                        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30">
                            <X size={14} className="text-[var(--dangerous)] shrink-0" />
                            <p className="text-sm text-[var(--dangerous)]">{saveError}</p>
                        </div>
                    )}
                </div>

                {/* ── LLM Provider ─────────────────────────────── */}
                <section className="mb-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Zap size={18} className="text-[var(--accent)]" />
                                LLM Provider
                            </CardTitle>
                            <CardDescription>
                                Choose where Aurelius sends chat requests.
                                Ollama is fully local and private; OpenRouter routes to cloud models.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                {/* Ollama */}
                                <button
                                    onClick={() => update('llmProvider', 'ollama')}
                                    className={cn(
                                        'relative flex flex-col items-start gap-3 p-5 rounded-[var(--radius-lg)] border text-left transition-all duration-200',
                                        ollamaActive
                                            ? 'border-[var(--accent)] bg-[var(--accent-muted)] shadow-[0_0_24px_var(--accent-glow)]'
                                            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    {ollamaActive && (
                                        <span className="absolute top-3 right-3 flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                                            <Radio size={11} className="fill-[var(--accent)]" />
                                            Active
                                        </span>
                                    )}
                                    <div className={cn(
                                        'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border transition-colors',
                                        ollamaActive
                                            ? 'border-[var(--accent)] bg-white/50 shadow-[0_0_20px_var(--accent-glow)]'
                                            : 'border-[var(--border)] bg-white/40',
                                    )}>
                                        <Image
                                            src="/images/ollama-logo.webp"
                                            alt="Ollama"
                                            fill
                                            className="object-contain p-1.5"
                                            sizes="40px"
                                        />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-[var(--text-primary)]">Ollama</p>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Local &amp; Private</p>
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                        Runs models entirely on your machine. No data ever leaves your system.
                                    </p>
                                    <Badge variant="safe" className="mt-1">No API Key Required</Badge>
                                </button>

                                {/* OpenRouter */}
                                <button
                                    onClick={() => update('llmProvider', 'openrouter')}
                                    className={cn(
                                        'relative flex flex-col items-start gap-3 p-5 rounded-[var(--radius-lg)] border text-left transition-all duration-200',
                                        openrouterActive
                                            ? 'border-[var(--accent)] bg-[var(--accent-muted)] shadow-[0_0_24px_var(--accent-glow)]'
                                            : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]',
                                    )}
                                >
                                    {openrouterActive && (
                                        <span className="absolute top-3 right-3 flex items-center gap-1 text-xs font-medium text-[var(--accent)]">
                                            <Radio size={11} className="fill-[var(--accent)]" />
                                            Active
                                        </span>
                                    )}
                                    <div className={cn(
                                        'relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border transition-colors',
                                        openrouterActive
                                            ? 'border-[var(--accent)] bg-white/50 shadow-[0_0_20px_var(--accent-glow)]'
                                            : 'border-[var(--border)] bg-white/40',
                                    )}>
                                        <Image
                                            src="/images/openrouter-logo.webp"
                                            alt="OpenRouter"
                                            fill
                                            className="object-contain p-1.5"
                                            sizes="40px"
                                        />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-[var(--text-primary)]">OpenRouter</p>
                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Cloud API</p>
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                                        Access 200+ models (Claude, GPT-4o, Gemini) through a single API key.
                                        Includes a free tier.
                                    </p>
                                    <Badge variant="sensitive" className="mt-1">API Key Required</Badge>
                                </button>

                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* ── Config Grid ──────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                    {/* ── Ollama ────────────────────────────────── */}
                    <Card className={cn(
                        'transition-all duration-300',
                        !ollamaActive && 'opacity-40 pointer-events-none',
                    )}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <span className="relative h-[18px] w-[18px] overflow-hidden rounded-sm border border-[var(--border)] bg-white/50 shadow-sm">
                                        <Image
                                            src="/images/ollama-logo.webp"
                                            alt="Ollama"
                                            fill
                                            className="object-contain p-[1px]"
                                            sizes="18px"
                                        />
                                    </span>
                                    Ollama Configuration
                                </CardTitle>
                                {ollamaActive && <Badge variant="safe">Active</Badge>}
                            </div>
                            <CardDescription>
                                Install from{' '}
                                <a
                                    href="https://ollama.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--accent)] hover:underline"
                                >
                                    ollama.com
                                </a>
                                , then pull a model:{' '}
                                <code className="text-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5 rounded text-[11px]">
                                    ollama pull qwen2.5:7b
                                </code>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">

                            <div className="space-y-2">
                                <FieldLabel>Host URL</FieldLabel>
                                <Input
                                    value={form.ollamaHost}
                                    onChange={e => update('ollamaHost', e.target.value)}
                                    placeholder="http://localhost:11434"
                                />
                                <FieldHint>The URL where your Ollama instance is running.</FieldHint>
                            </div>

                            <div className="space-y-2">
                                <FieldLabel>Model</FieldLabel>
                                <Input
                                    value={form.ollamaModel}
                                    onChange={e => update('ollamaModel', e.target.value)}
                                    placeholder="qwen2.5:7b"
                                />
                                <FieldHint>
                                    Must be pulled locally first. e.g.{' '}
                                    <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-[11px]">llama3.1:8b</code>
                                    {' '}or{' '}
                                    <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-[11px]">qwen2.5:7b</code>
                                </FieldHint>
                            </div>

                        </CardContent>
                    </Card>

                    {/* ── OpenRouter ────────────────────────────── */}
                    <Card className={cn(
                        'transition-all duration-300',
                        !openrouterActive && 'opacity-40 pointer-events-none',
                    )}>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <span className="relative h-[18px] w-[18px] overflow-hidden rounded-sm border border-[var(--border)] bg-white/50 shadow-sm">
                                        <Image
                                            src="/images/openrouter-logo.webp"
                                            alt="OpenRouter"
                                            fill
                                            className="object-contain p-[1px]"
                                            sizes="18px"
                                        />
                                    </span>
                                    OpenRouter Configuration
                                </CardTitle>
                                {openrouterActive && <Badge variant="sensitive">Active</Badge>}
                            </div>
                            <CardDescription>
                                Get your API key at{' '}
                                <a
                                    href="https://openrouter.ai/keys"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--accent)] hover:underline"
                                >
                                    openrouter.ai/keys
                                </a>
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-5">

                            {/* API Key */}
                            <div className="space-y-2">
                                <FieldLabel>API Key</FieldLabel>
                                <div className="relative">
                                    <Input
                                        type={showApiKey ? 'text' : 'password'}
                                        value={apiKeyInput}
                                        onChange={e => {
                                            setApiKeyInput(e.target.value);
                                            clearSaveError();
                                            setSaveStatus('idle');
                                        }}
                                        placeholder={
                                            settings?.openrouterApiKeySet
                                                ? 'Key is saved — type here to replace it'
                                                : 'sk-or-v1-…'
                                        }
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowApiKey(v => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                                    >
                                        {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                {settings?.openrouterApiKeySet ? (
                                    <div className="flex items-center gap-1.5 text-xs text-[var(--safe)]">
                                        <Check size={12} />
                                        API key is saved on the server
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                        <Lock size={12} />
                                        No API key stored yet
                                    </div>
                                )}
                            </div>

                            {/* Model */}
                            <div className="space-y-2">
                                <FieldLabel>Model</FieldLabel>
                                <div className="relative" ref={modelDropdownRef}>
                                    {/* Trigger */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setModelDropdownOpen(v => !v);
                                            setModelSearch('');
                                        }}
                                        className={cn(
                                            'flex h-10 w-full items-center justify-between rounded-[var(--radius-md)] px-3 py-2',
                                            'bg-[var(--surface)] border border-[var(--border)]',
                                            'text-left text-sm transition-all',
                                            modelDropdownOpen
                                                ? 'ring-2 ring-[var(--accent)] border-transparent'
                                                : 'hover:border-[var(--accent)]/40',
                                        )}
                                    >
                                        <span className={cn(
                                            'truncate',
                                            form?.openrouterModel
                                                ? 'text-[var(--text-primary)]'
                                                : 'text-[var(--text-muted)]',
                                        )}>
                                            {form?.openrouterModel || 'meta-llama/llama-3.1-8b-instruct:free'}
                                        </span>
                                        <ChevronDown
                                            size={16}
                                            className={cn(
                                                'shrink-0 ml-2 text-[var(--text-muted)] transition-transform duration-200',
                                                modelDropdownOpen && 'rotate-180',
                                            )}
                                        />
                                    </button>

                                    {/* Dropdown */}
                                    {modelDropdownOpen && (
                                        <div className="absolute z-50 mt-1 w-full rounded-[var(--radius-md)] border border-[var(--overlay-border)] bg-[var(--overlay-glass-strong)] shadow-[0_8px_32px_rgba(0,0,0,0.6)] overflow-hidden">
                                            {/* Search bar */}
                                            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--overlay-border)]">
                                                <Search size={14} className="text-[var(--text-muted)] shrink-0" />
                                                <input
                                                    autoFocus
                                                    value={modelSearch}
                                                    onChange={e => setModelSearch(e.target.value)}
                                                    placeholder="Search models…"
                                                    className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                                                />
                                                {modelSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setModelSearch('')}
                                                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            {/* Options */}
                                            <ul className="max-h-52 overflow-y-auto py-1">
                                                {/* Loading state */}
                                                {orModelsLoading && (
                                                    <li className="flex items-center gap-2 px-3 py-3 text-sm text-[var(--text-muted)]">
                                                        <Loader2 size={13} className="animate-spin shrink-0" />
                                                        Loading models…
                                                    </li>
                                                )}

                                                {/* No API key */}
                                                {!orModelsLoading && orModelsError === 'no_key' && (
                                                    <li className="px-3 py-3 text-sm text-[var(--text-muted)] italic text-center">
                                                        Save an API key first to browse models.
                                                    </li>
                                                )}

                                                {/* Real error */}
                                                {!orModelsLoading && orModelsError && orModelsError !== 'no_key' && (
                                                    <li className="px-3 py-3 space-y-2">
                                                        <p className="text-xs text-[var(--dangerous)] flex items-center gap-1.5 font-medium">
                                                            <AlertTriangle size={12} className="shrink-0" />
                                                            Failed to load models
                                                        </p>
                                                        <p className="text-[11px] text-[var(--text-muted)] font-mono break-all leading-relaxed">
                                                            {orModelsError}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() => void refetchModels()}
                                                            className="text-xs text-[var(--accent)] hover:underline"
                                                        >
                                                            Retry
                                                        </button>
                                                    </li>
                                                )}

                                                {/* Model rows */}
                                                {!orModelsLoading && !orModelsError && (() => {
                                                    const filtered = orModels.filter(m =>
                                                        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
                                                        m.id.toLowerCase().includes(modelSearch.toLowerCase())
                                                    );
                                                    if (filtered.length === 0) {
                                                        return (
                                                            <li className="px-3 py-3 text-sm text-[var(--text-muted)] italic text-center">
                                                                No models match &ldquo;{modelSearch}&rdquo;
                                                            </li>
                                                        );
                                                    }
                                                    return filtered.map(m => {
                                                        const free = isModelFree(m);
                                                        const ctx  = formatContextLength(m.context_length);
                                                        const isSelected = form?.openrouterModel === m.id;
                                                        return (
                                                            <li key={m.id}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        update('openrouterModel', m.id);
                                                                        setModelDropdownOpen(false);
                                                                    }}
                                                                    className={cn(
                                                                        'w-full flex items-center gap-3 px-3 py-2 text-sm text-left transition-colors',
                                                                        isSelected
                                                                            ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                                                            : 'text-[var(--text-primary)] hover:bg-white/[0.06]',
                                                                    )}
                                                                >
                                                                    {/* Name + ID stacked */}
                                                                    <span className="flex-1 min-w-0">
                                                                        <span className="block font-medium truncate">{m.name}</span>
                                                                        <span className={cn(
                                                                            'block text-[10px] font-mono truncate mt-0.5',
                                                                            isSelected ? 'text-[var(--accent)]/70' : 'text-[var(--text-muted)]',
                                                                        )}>
                                                                            {m.id}
                                                                        </span>
                                                                    </span>
                                                                    {/* Badges */}
                                                                    <span className="flex items-center gap-1 shrink-0">
                                                                        {ctx && (
                                                                            <span className={cn(
                                                                                'px-1.5 py-0.5 rounded text-[10px] font-medium border',
                                                                                isSelected
                                                                                    ? 'border-[var(--accent)]/40 text-[var(--accent)]/80 bg-transparent'
                                                                                    : 'border-[var(--border)] text-[var(--text-muted)] bg-transparent',
                                                                            )}>
                                                                                {ctx}
                                                                            </span>
                                                                        )}
                                                                        {free ? (
                                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--safe-glow)] border border-[var(--safe)]/40 text-[var(--safe)]">
                                                                                FREE
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--sensitive-glow,transparent)] border border-[var(--sensitive)]/30 text-[var(--sensitive)]">
                                                                                PAID
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </button>
                                                            </li>
                                                        );
                                                    });
                                                })()}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                                <FieldHint>Live model list from OpenRouter. Search by name or model ID.</FieldHint>
                            </div>

                            {/* Base URL */}
                            <div className="space-y-2">
                                <FieldLabel>Base URL</FieldLabel>
                                <Input
                                    value={form.openrouterBaseUrl}
                                    onChange={e => update('openrouterBaseUrl', e.target.value)}
                                    placeholder="https://openrouter.ai/api/v1"
                                />
                                <FieldHint>Only change this if you are using a custom proxy.</FieldHint>
                            </div>

                        </CardContent>
                    </Card>
                </div>

                {/* ── Advanced ─────────────────────────────────── */}
                <section className="mb-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <SettingsIcon size={18} className="text-[var(--text-secondary)]" />
                                Advanced
                            </CardTitle>
                            <CardDescription>
                                Network, CORS, and service endpoint configuration.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                <div className="space-y-2">
                                    <FieldLabel>CORS Origin</FieldLabel>
                                    <Input
                                        value={form.corsOrigin}
                                        onChange={e => update('corsOrigin', e.target.value)}
                                        placeholder="http://localhost:4242"
                                    />
                                    <FieldHint>
                                        The origin allowed to call the backend API.
                                        Should match the frontend URL.
                                    </FieldHint>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <FieldLabel>Audio Engine URL</FieldLabel>
                                        <Badge className="text-[10px] py-0">Phase 2</Badge>
                                    </div>
                                    <Input
                                        value={form.audioEngineUrl}
                                        onChange={e => update('audioEngineUrl', e.target.value)}
                                        placeholder="ws://localhost:8000/ws"
                                    />
                                    <FieldHint>
                                        WebSocket URL for the Typhoon-2-Audio Python service.
                                    </FieldHint>
                                </div>

                                <div className="space-y-2">
                                    <FieldLabel>OpenRouter Site URL</FieldLabel>
                                    <Input
                                        value={form.openrouterSiteUrl}
                                        onChange={e => update('openrouterSiteUrl', e.target.value)}
                                        placeholder="http://localhost:4242"
                                    />
                                    <FieldHint>
                                        Sent as{' '}
                                        <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-[11px]">HTTP-Referer</code>
                                        {' '}header to OpenRouter.
                                    </FieldHint>
                                </div>

                                <div className="space-y-2">
                                    <FieldLabel>OpenRouter Site Name</FieldLabel>
                                    <Input
                                        value={form.openrouterSiteName}
                                        onChange={e => update('openrouterSiteName', e.target.value)}
                                        placeholder="Aurelius"
                                    />
                                    <FieldHint>
                                        Shown in your OpenRouter activity dashboard as the app name.
                                    </FieldHint>
                                </div>

                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* ── Prompt & Model Behavior ───────────────────── */}
                <section className="mb-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="flex items-center gap-2">
                                    <MessageSquare size={18} className="text-[var(--accent)]" />
                                    Prompt &amp; Model Behavior
                                </CardTitle>
                                <button
                                    type="button"
                                    onClick={() => {
                                        update('systemPrompt', settings?.systemPrompt ?? form.systemPrompt);
                                        update('temperature', settings?.temperature ?? form.temperature);
                                        update('maxTokens', settings?.maxTokens ?? form.maxTokens);
                                    }}
                                    className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                    <ResetIcon size={12} />
                                    Reset to saved
                                </button>
                            </div>
                            <CardDescription>
                                System prompt and sampling parameters sent to the LLM on every request.
                                Changes take effect immediately after saving.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">

                            {/* System Prompt */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <FieldLabel>System Prompt</FieldLabel>
                                    <span className="text-xs text-[var(--text-muted)]">
                                        {form.systemPrompt.length} chars
                                    </span>
                                </div>
                                <textarea
                                    value={form.systemPrompt}
                                    onChange={e => update('systemPrompt', e.target.value)}
                                    rows={14}
                                    spellCheck={false}
                                    className="w-full rounded-[var(--radius-md)] px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y transition-all text-sm font-mono leading-relaxed"
                                    placeholder="You are Aurelius…"
                                />
                                <FieldHint>
                                    Injected as the first <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-[11px]">system</code> message on every chat request.
                                </FieldHint>
                            </div>

                            {/* Temperature + Max Tokens side by side */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">

                                {/* Temperature */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <FieldLabel>
                                            <span className="flex items-center gap-1.5">
                                                <Thermometer size={14} className="text-[var(--sensitive)]" />
                                                Temperature
                                            </span>
                                        </FieldLabel>
                                        <span className="text-sm font-semibold tabular-nums text-[var(--accent)]">
                                            {form.temperature.toFixed(1)}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.1"
                                        value={form.temperature}
                                        onChange={e => update('temperature', parseFloat(e.target.value))}
                                        className="w-full h-2 rounded-full appearance-none cursor-pointer"
                                        style={{
                                            background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${(form.temperature / 2) * 100}%, var(--surface) ${(form.temperature / 2) * 100}%, var(--surface) 100%)`,
                                        }}
                                    />
                                    <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                                        <span>0.0 — Precise</span>
                                        <span>1.0 — Balanced</span>
                                        <span>2.0 — Creative</span>
                                    </div>
                                    <FieldHint>
                                        Controls randomness. Lower = more focused, Higher = more creative.
                                        Recommended: <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-[11px]">0.6</code> for coding,{' '}
                                        <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-[11px]">0.8</code> for chat.
                                    </FieldHint>
                                </div>

                                {/* Max Tokens */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <FieldLabel>
                                            <span className="flex items-center gap-1.5">
                                                <Hash size={14} className="text-[var(--safe)]" />
                                                Max Tokens
                                            </span>
                                        </FieldLabel>
                                        <Badge variant="safe" className="text-[10px]">
                                            ~{Math.round(form.maxTokens * 0.75)} words
                                        </Badge>
                                    </div>
                                    <Input
                                        type="number"
                                        min={64}
                                        max={32768}
                                        step={256}
                                        value={form.maxTokens}
                                        onChange={e => {
                                            const v = parseInt(e.target.value, 10);
                                            if (!isNaN(v)) update('maxTokens', v);
                                        }}
                                    />
                                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                                        {[512, 1024, 2048, 4096, 8192].map(n => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => update('maxTokens', n)}
                                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                                    form.maxTokens === n
                                                        ? 'bg-[var(--safe-glow)] border-[var(--safe)]/60 text-[var(--safe)]'
                                                        : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--safe)]/40 hover:text-[var(--safe)]'
                                                }`}
                                            >
                                                {n >= 1024 ? `${n / 1024}k` : n}
                                            </button>
                                        ))}
                                    </div>
                                    <FieldHint>
                                        Maximum tokens the model can generate per response.
                                        Higher values allow longer replies but use more memory.
                                    </FieldHint>
                                </div>

                            </div>

                        </CardContent>
                    </Card>
                </section>

                {/* ── Connection Test ──────────────────────────── */}
                <section className="mb-24">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wifi size={18} className="text-[var(--accent)]" />
                                Connection Test
                            </CardTitle>
                            <CardDescription>
                                Verify that the currently active and <strong>saved</strong> provider is reachable.
                                Save your changes first, then run the test.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">

                                <Button
                                    variant="outline"
                                    onClick={testConnection}
                                    disabled={isTesting || hasChanges}
                                    className="gap-2 min-w-[160px] shrink-0"
                                >
                                    {isTesting ? (
                                        <><Loader2 size={15} className="animate-spin" />Testing…</>
                                    ) : (
                                        <><Wifi size={15} />Test Connection</>
                                    )}
                                </Button>

                                {/* Nudge to save first */}
                                {hasChanges && !isTesting && (
                                    <div className="flex items-center gap-2 text-sm text-[var(--sensitive)]">
                                        <Info size={14} className="shrink-0" />
                                        Save your changes before testing.
                                    </div>
                                )}

                                {/* Test result */}
                                {testResult && !hasChanges && (
                                    <div className={cn(
                                        'flex items-start gap-3 px-4 py-3 rounded-[var(--radius-md)] border flex-1 min-w-0',
                                        testResult.success
                                            ? 'bg-[var(--safe-glow)] border-[var(--safe)]/30'
                                            : 'bg-[var(--dangerous-glow)] border-[var(--dangerous)]/30',
                                    )}>
                                        {testResult.success
                                            ? <Check size={16} className="text-[var(--safe)] mt-0.5 shrink-0" />
                                            : <X     size={16} className="text-[var(--dangerous)] mt-0.5 shrink-0" />
                                        }
                                        <div className="min-w-0">
                                            <p className={cn(
                                                'text-sm font-medium',
                                                testResult.success ? 'text-[var(--safe)]' : 'text-[var(--dangerous)]',
                                            )}>
                                                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                                            </p>
                                            <p className="text-xs text-[var(--text-secondary)] mt-0.5 break-words">
                                                {testResult.message}
                                            </p>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* ── Startup (Desktop only) ───────────────────── */}
                {isTauri && (
                    <section className="mb-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <MonitorPlay size={18} className="text-[var(--accent)]" />
                                    Startup
                                </CardTitle>
                                <CardDescription>
                                    Control whether Aurelius launches automatically when you log in to Windows.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between gap-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
                                    {/* Label + description */}
                                    <div className="flex items-center gap-4 min-w-0">
                                        <div className={cn(
                                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] transition-colors',
                                            autostartEnabled
                                                ? 'bg-[var(--accent-muted)]'
                                                : 'bg-[var(--surface-hover)]',
                                        )}>
                                            <Power size={18} className={autostartEnabled ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-[var(--text-primary)]">
                                                Launch at login
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                                {autostartLoading
                                                    ? 'Checking current status…'
                                                    : autostartEnabled
                                                        ? 'Aurelius starts automatically when Windows boots.'
                                                        : 'Aurelius will not start automatically on login.'}
                                            </p>
                                            {autostartError && (
                                                <p className="text-xs text-[var(--dangerous)] mt-1">{autostartError}</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Toggle */}
                                    <button
                                        type="button"
                                        role="switch"
                                        aria-checked={autostartEnabled}
                                        onClick={handleAutostartToggle}
                                        disabled={autostartLoading || autostartSaving}
                                        className={cn(
                                            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
                                            autostartEnabled
                                                ? 'bg-[var(--accent)]'
                                                : 'bg-[var(--surface-hover)] border border-[var(--border)]',
                                        )}
                                    >
                                        <span className={cn(
                                            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                                            autostartEnabled ? 'translate-x-5' : 'translate-x-0',
                                        )} />
                                    </button>
                                </div>

                                <p className="mt-3 text-xs text-[var(--text-muted)]">
                                    This setting writes to the Windows Registry at{' '}
                                    <code className="text-[var(--accent)] bg-[var(--surface)] px-1.5 py-0.5 rounded text-[10px]">
                                        HKCU\Software\Microsoft\Windows\CurrentVersion\Run
                                    </code>
                                    {' '}— the same mechanism used by apps like Discord and Spotify.
                                </p>
                            </CardContent>
                        </Card>
                    </section>
                )}

            </Container>

            {/* ── Floating Save Bar ────────────────────────────── */}
            {hasChanges && (
                <div className="fixed bottom-6 left-64 right-0 px-6 pointer-events-none z-50 lg:left-[calc(16rem+200px)]">
                    <div className="max-w-xl mx-auto pointer-events-auto">
                        <div className="glass-strong rounded-[var(--radius-xl)] px-5 py-3 flex items-center justify-between shadow-2xl border border-[var(--accent)]/20">
                            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                                Unsaved changes
                            </div>
                            <div className="flex items-center gap-3">
                                <Button variant="ghost" size="sm" onClick={handleDiscard}>
                                    Discard
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="gap-2"
                                >
                                    {isSaving
                                        ? <><Loader2 size={13} className="animate-spin" />Saving…</>
                                        : <><Save size={13} />Save Changes</>
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
