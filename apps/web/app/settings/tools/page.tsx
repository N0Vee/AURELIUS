'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSettings, type Settings } from '@/hooks/useSettings';
import { Container } from '@/components/layout';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Button, Input, Badge,
} from '@/components/ui';
import {
    Search,
    Check,
    X,
    Loader2,
    Eye,
    EyeOff,
    Save,
    RotateCcw,
    Lock,
    Image as ImageIcon,
    FolderOpen,
    HardDrive,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

export default function ToolsSettingsPage() {
    const {
        settings,
        isLoading,
        isSaving,
        error,
        saveError,
        saveSettings,
        clearSaveError,
    } = useSettings();

    const [draft, setDraft] = useState<Settings | null>(null);
    const [tavilyApiKeyInput, setTavilyApiKeyInput] = useState('');
    const [showTavilyApiKey, setShowTavilyApiKey]   = useState(false);
    const [saveStatus, setSaveStatus]               = useState<'idle' | 'success' | 'error'>('idle');
    const [toolsSection, setToolsSection]           = useState<'search' | 'capture' | 'files' | 'apps'>('search');

    const form = useMemo(() => draft ?? settings, [draft, settings]);

    const update = useCallback(
        <K extends keyof Settings>(key: K, value: Settings[K]) => {
            setDraft(prev => {
                const base = prev ?? settings;
                if (!base) return prev;
                return { ...base, [key]: value };
            });
            clearSaveError();
            setSaveStatus('idle');
        },
        [settings, clearSaveError],
    );

    useEffect(() => {
        const ids = ['tools-search', 'tools-capture', 'tools-files', 'tools-apps'] as const;
        const sections: Array<'search' | 'capture' | 'files' | 'apps'> = ['search', 'capture', 'files', 'apps'];

        const onScroll = () => {
            let active: 'search' | 'capture' | 'files' | 'apps' = 'search';
            for (let i = 0; i < ids.length; i++) {
                const el = document.getElementById(ids[i]);
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (rect.top <= 180) active = sections[i];
            }
            setToolsSection(active);
        };

        const container = document.querySelector('[data-settings-scroll]');
        const target = container || window;
        target.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
        return () => target.removeEventListener('scroll', onScroll);
    }, []);

    const hasChanges = useMemo(() => {
        if (!settings) return false;
        if (tavilyApiKeyInput.trim()) return true;
        if (!draft) return false;
        const keys: (keyof Settings)[] = [
            'screenshotSavePath', 'defaultFileRoot', 'allowedWriteRoot',
            'allowedReadRoots', 'appSearchRoots',
        ];
        for (const k of keys) {
            if (JSON.stringify(draft[k]) !== JSON.stringify(settings[k])) return true;
        }
        return false;
    }, [draft, settings, tavilyApiKeyInput]);

    const handleSave = async () => {
        const current = draft ?? settings;
        if (!current) return;

        const payload: Partial<Settings> = { ...current };
        payload.tavilyApiKey = tavilyApiKeyInput.trim() || '***';
        // Preserve the existing openrouter key
        payload.openrouterApiKey = '***';

        const ok = await saveSettings(payload);
        if (ok) {
            setSaveStatus('success');
            setTavilyApiKeyInput('');
            setDraft(null);
            setTimeout(() => setSaveStatus('idle'), 3000);
        } else {
            setSaveStatus('error');
        }
    };

    const handleDiscard = () => {
        setDraft(null);
        setTavilyApiKeyInput('');
        setSaveStatus('idle');
        clearSaveError();
    };

    if (isLoading || !form) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <p className="text-sm text-[var(--text-muted)]">{error}</p>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto py-8" data-settings-scroll>
            <Container>

                {/* Page Header */}
                <div className="mb-8">
                    <p className="text-sm text-[var(--text-muted)]">Settings / Tools &amp; Integrations</p>
                    <div className="flex items-center justify-between mt-1">
                        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Tools &amp; Integrations</h1>

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

                    {saveError && (
                        <div className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30">
                            <X size={14} className="text-[var(--dangerous)] shrink-0" />
                            <p className="text-sm text-[var(--dangerous)]">{saveError}</p>
                        </div>
                    )}
                </div>

                {/* Tools Content */}
                <div className="grid grid-cols-1 xl:grid-cols-[200px_minmax(0,1fr)] gap-6">
                    <aside className="xl:sticky xl:top-24 h-fit">
                        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-2">
                            {[
                                { id: 'tools-search',  key: 'search'  as const, label: 'Search',  icon: Search },
                                { id: 'tools-capture', key: 'capture' as const, label: 'Capture', icon: ImageIcon },
                                { id: 'tools-files',   key: 'files'   as const, label: 'Files',   icon: FolderOpen },
                                { id: 'tools-apps',    key: 'apps'    as const, label: 'Apps',    icon: HardDrive },
                            ].map(item => {
                                const Icon = item.icon;
                                const active = toolsSection === item.key;
                                return (
                                    <a
                                        key={item.id}
                                        href={`#${item.id}`}
                                        onClick={() => setToolsSection(item.key)}
                                        className={cn(
                                            'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-sm font-medium transition-all',
                                            active
                                                ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                                                : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
                                        )}
                                    >
                                        <Icon size={16} />
                                        {item.label}
                                    </a>
                                );
                            })}
                        </div>
                    </aside>

                    <div className="space-y-5 min-w-0">
                        {/* Search */}
                        <div id="tools-search" className="scroll-mt-28 rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface)]">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--sensitive)]/15">
                                    <Search size={18} className="text-[var(--sensitive)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">Search</p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Web search provider configuration used by <code className="text-[var(--accent)] bg-[var(--surface-elevated)] px-1 rounded">web_search</code>.
                                    </p>
                                </div>
                                {settings?.tavilyApiKeySet
                                    ? <Badge variant="safe">Ready</Badge>
                                    : <Badge variant="sensitive">Needs Key</Badge>
                                }
                            </div>

                            <div className="px-5 py-4 space-y-3 border-t border-[var(--border)] bg-[var(--bg)]">
                                <div className="space-y-2">
                                    <FieldLabel>Tavily API Key</FieldLabel>
                                    <div className="relative">
                                        <Input
                                            type={showTavilyApiKey ? 'text' : 'password'}
                                            value={tavilyApiKeyInput}
                                            onChange={e => {
                                                setTavilyApiKeyInput(e.target.value);
                                                clearSaveError();
                                                setSaveStatus('idle');
                                            }}
                                            placeholder={
                                                settings?.tavilyApiKeySet
                                                    ? 'Key is saved — type here to replace it'
                                                    : 'tvly-…'
                                            }
                                            className="pr-10"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowTavilyApiKey(v => !v)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                            aria-label={showTavilyApiKey ? 'Hide API key' : 'Show API key'}
                                        >
                                            {showTavilyApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>

                                    {settings?.tavilyApiKeySet ? (
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--safe)]">
                                            <Check size={12} />
                                            API key is saved on the server
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                            <Lock size={12} />
                                            No API key stored yet — get one at{' '}
                                            <a
                                                href="https://app.tavily.com"
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[var(--accent)] hover:underline"
                                            >
                                                app.tavily.com
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Screenshot Storage */}
                        <div id="tools-capture" className="scroll-mt-28 rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface)]">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--safe)]/15">
                                    <ImageIcon size={18} className="text-[var(--safe)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">Screenshot Storage</p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Default folder used by <code className="text-[var(--accent)] bg-[var(--surface-elevated)] px-1 rounded">take_screenshot</code>.
                                    </p>
                                </div>
                                <Badge variant="safe">Configurable</Badge>
                            </div>

                            <div className="px-5 py-4 space-y-2 border-t border-[var(--border)] bg-[var(--bg)]">
                                <FieldLabel>Save Folder</FieldLabel>
                                <Input
                                    value={form.screenshotSavePath}
                                    onChange={e => update('screenshotSavePath', e.target.value)}
                                    placeholder="C:\Users\UsEr\Pictures\Aurelius"
                                />
                                <FieldHint>
                                    Screenshots will be saved here by default. Example:{' '}
                                    <code className="text-[var(--accent)] bg-[var(--surface-elevated)] px-1 rounded">
                                        C:\Users\UsEr\Pictures\Aurelius
                                    </code>
                                </FieldHint>
                            </div>
                        </div>

                        {/* File System Boundaries */}
                        <div id="tools-files" className="scroll-mt-28 rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface)]">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/15">
                                    <FolderOpen size={18} className="text-[var(--accent)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">File System Boundaries</p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Configure the default starting folder plus the allowed read and write boundaries for file tools.
                                    </p>
                                </div>
                                <Badge variant="safe">Scoped Access</Badge>
                            </div>

                            <div className="px-5 py-4 border-t border-[var(--border)] bg-[var(--bg)] space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                                    <div className="space-y-2">
                                        <FieldLabel>Default File Root</FieldLabel>
                                        <Input
                                            value={form.defaultFileRoot}
                                            onChange={e => update('defaultFileRoot', e.target.value)}
                                            placeholder="C:\Users\UsEr\Documents"
                                        />
                                        <FieldHint>
                                            Used as the default starting folder when a file tool needs a base location.
                                        </FieldHint>
                                    </div>

                                    <div className="space-y-2">
                                        <FieldLabel>Allowed Write Root</FieldLabel>
                                        <Input
                                            value={form.allowedWriteRoot}
                                            onChange={e => update('allowedWriteRoot', e.target.value)}
                                            placeholder="C:\Users\UsEr\Documents\Aurelius"
                                        />
                                        <FieldHint>
                                            File creation and overwrite operations are limited to this folder.
                                        </FieldHint>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <FieldLabel>Allowed Read Roots</FieldLabel>
                                    <textarea
                                        value={form.allowedReadRoots.join('\n')}
                                        onChange={e => update(
                                            'allowedReadRoots',
                                            e.target.value
                                                .split('\n')
                                                .map(v => v.trim())
                                                .filter(Boolean),
                                        )}
                                        rows={6}
                                        spellCheck={false}
                                        className="w-full rounded-[var(--radius-md)] px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y transition-all text-sm font-mono leading-relaxed"
                                        placeholder={`C:\\Users\\UsEr\\Desktop\nC:\\Users\\UsEr\\Documents\nC:\\Users\\UsEr\\Downloads\nC:\\Users\\UsEr\\Pictures`}
                                    />
                                    <FieldHint>
                                        Put one folder per line. File browsing and reading tools can only access paths inside these roots.
                                    </FieldHint>
                                </div>
                            </div>
                        </div>

                        {/* Application Discovery */}
                        <div id="tools-apps" className="scroll-mt-28 rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                            <div className="flex items-center gap-3 px-5 py-4 bg-[var(--surface)]">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--sensitive)]/15">
                                    <HardDrive size={18} className="text-[var(--sensitive)]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[var(--text-primary)]">Application Discovery</p>
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Folders scanned by <code className="text-[var(--accent)] bg-[var(--surface-elevated)] px-1 rounded">find_application</code> when resolving installed executables.
                                    </p>
                                </div>
                                <Badge variant="sensitive">Launcher Search</Badge>
                            </div>

                            <div className="px-5 py-4 space-y-2 border-t border-[var(--border)] bg-[var(--bg)]">
                                <FieldLabel>Search Roots</FieldLabel>
                                <textarea
                                    value={form.appSearchRoots.join('\n')}
                                    onChange={e => update(
                                        'appSearchRoots',
                                        e.target.value
                                            .split('\n')
                                            .map(v => v.trim())
                                            .filter(Boolean),
                                    )}
                                    rows={5}
                                    spellCheck={false}
                                    className="w-full rounded-[var(--radius-md)] px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y transition-all text-sm font-mono leading-relaxed"
                                    placeholder={`C:\\Program Files\nC:\\Program Files (x86)\nC:\\Users\\UsEr\\AppData\\Local`}
                                />
                                <FieldHint>
                                    Put one folder per line. Include any custom launcher or game install directories you want Aurelius to search.
                                </FieldHint>
                            </div>
                        </div>
                    </div>
                </div>

            </Container>

            {/* Floating Save Bar */}
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
