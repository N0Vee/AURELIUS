'use client';

import { useState, useCallback, useMemo } from 'react';
import { useAutomations, type CustomAutomation, type AutomationDraft, type AutomationStep, type AutomationParameter } from '@/hooks/useAutomations';
import { Container } from '@/components/layout';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Button, Input, Badge,
} from '@/components/ui';
import {
    Workflow,
    Plus,
    Trash2,
    GripVertical,
    ChevronDown,
    ChevronUp,

    Save,
    ArrowLeft,
    Loader2,
    AlertTriangle,
    Check,
    X,
    Zap,
    Settings,
    Code,
    Globe,
    FolderOpen,
    HardDrive,
    Image as ImageIcon,
    Search,
    Copy,
    Terminal,
    Monitor,
    MousePointer,
    FileText,
    Clock,
    Calendar,
    Clipboard,
    Eye,
    PenLine,
    ToggleLeft,
    Info,
    ArrowDown,
    ChevronRight,
    Sparkles,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// Available Tools Catalog
// ============================================================

interface ToolCatalogEntry {
    name: string;
    displayName: string;
    category: string;
    icon: LucideIcon;
    description: string;
    parameters: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean';
        description: string;
        required: boolean;
    }>;
}

const TOOL_CATALOG: ToolCatalogEntry[] = [
    // ── Safe ──
    { name: 'get_time', displayName: 'Get Time', category: 'Info', icon: Clock, description: 'Get current time (Bangkok)', parameters: [] },
    { name: 'get_date', displayName: 'Get Date', category: 'Info', icon: Calendar, description: 'Get current date (Bangkok)', parameters: [] },
    { name: 'get_clipboard', displayName: 'Read Clipboard', category: 'Info', icon: Clipboard, description: 'Read clipboard text', parameters: [] },
    { name: 'get_active_window', displayName: 'Active Window', category: 'Info', icon: Monitor, description: 'Get focused window info', parameters: [] },
    { name: 'list_directory', displayName: 'List Directory', category: 'Files', icon: FolderOpen, description: 'List files in a directory', parameters: [{ name: 'path', type: 'string', description: 'Directory path', required: true }] },
    { name: 'find_files', displayName: 'Find Files', category: 'Files', icon: Search, description: 'Search for files by name', parameters: [{ name: 'rootPath', type: 'string', description: 'Root directory', required: true }, { name: 'query', type: 'string', description: 'Filename query', required: true }] },
    { name: 'find_application', displayName: 'Find App', category: 'Apps', icon: HardDrive, description: 'Find installed application', parameters: [{ name: 'name', type: 'string', description: 'Application name', required: true }] },
    { name: 'find_process', displayName: 'Find Process', category: 'Apps', icon: Settings, description: 'Find running processes', parameters: [{ name: 'name', type: 'string', description: 'Process name', required: true }] },
    { name: 'web_search', displayName: 'Web Search', category: 'Web', icon: Globe, description: 'Search the web via Tavily', parameters: [{ name: 'query', type: 'string', description: 'Search query', required: true }] },
    { name: 'web_extract', displayName: 'Web Extract', category: 'Web', icon: FileText, description: 'Extract content from URLs', parameters: [{ name: 'urls', type: 'string', description: 'Comma-separated URLs', required: true }] },
    { name: 'web_crawl', displayName: 'Web Crawl', category: 'Web', icon: Globe, description: 'Deep crawl a website', parameters: [{ name: 'url', type: 'string', description: 'URL to crawl', required: true }] },
    { name: 'wait', displayName: 'Wait', category: 'Info', icon: Clock, description: 'Pause for N milliseconds (max 15 000). Use between steps when a page needs time to load.', parameters: [{ name: 'ms', type: 'number', description: 'Milliseconds to wait (default 1500, max 15000)', required: false }] },
    { name: 'copy_to_clipboard', displayName: 'Copy to Clipboard', category: 'Info', icon: Copy, description: 'Copy text to clipboard', parameters: [{ name: 'text', type: 'string', description: 'Text to copy', required: true }] },
    // ── Sensitive ──
    { name: 'open_url', displayName: 'Open URL', category: 'Web', icon: Globe, description: 'Open URL in browser', parameters: [{ name: 'url', type: 'string', description: 'URL to open', required: true }] },
    { name: 'open_file', displayName: 'Open File', category: 'Files', icon: FileText, description: 'Open file with default app', parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }] },
    { name: 'read_file', displayName: 'Read File', category: 'Files', icon: Eye, description: 'Read text file contents', parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }] },
    { name: 'take_screenshot', displayName: 'Screenshot', category: 'Capture', icon: ImageIcon, description: 'Capture screen', parameters: [] },
    // ── Dangerous ──
    { name: 'open_app', displayName: 'Open App', category: 'Apps', icon: HardDrive, description: 'Launch an application', parameters: [{ name: 'app', type: 'string', description: 'App name or path', required: true }] },
    { name: 'write_file', displayName: 'Write File', category: 'Files', icon: PenLine, description: 'Create or overwrite a file', parameters: [{ name: 'path', type: 'string', description: 'File path', required: true }, { name: 'content', type: 'string', description: 'File content', required: true }] },
    { name: 'run_command', displayName: 'Run Command', category: 'System', icon: Terminal, description: 'Execute shell command', parameters: [{ name: 'command', type: 'string', description: 'Shell command', required: true }] },
    { name: 'kill_process', displayName: 'Kill Process', category: 'Apps', icon: X, description: 'Terminate a process', parameters: [{ name: 'name', type: 'string', description: 'Process name', required: false }, { name: 'pid', type: 'number', description: 'Process ID', required: false }] },
    // ── Browser ──
    { name: 'browser_get_url', displayName: 'Browser: Get URL', category: 'Browser', icon: Globe, description: 'Get active tab URL', parameters: [] },
    { name: 'browser_get_tabs', displayName: 'Browser: Get Tabs', category: 'Browser', icon: Monitor, description: 'List all open tabs', parameters: [] },
    { name: 'browser_get_content', displayName: 'Browser: Get Content', category: 'Browser', icon: FileText, description: 'Extract page text', parameters: [] },
    { name: 'browser_navigate', displayName: 'Browser: Navigate', category: 'Browser', icon: Globe, description: 'Navigate to URL', parameters: [{ name: 'url', type: 'string', description: 'URL to navigate to', required: true }] },
    { name: 'browser_new_tab', displayName: 'Browser: New Tab', category: 'Browser', icon: Plus, description: 'Open new browser tab', parameters: [{ name: 'url', type: 'string', description: 'Optional URL', required: false }] },
    { name: 'browser_click', displayName: 'Browser: Click', category: 'Browser', icon: MousePointer, description: 'Click an element', parameters: [{ name: 'selector', type: 'string', description: 'CSS selector or text', required: true }] },
    { name: 'browser_hover_and_click', displayName: 'Browser: Hover & Click', category: 'Browser', icon: MousePointer, description: 'Hover parent row first (reveals hidden buttons), then click target. Use for YouTube Music / SPAs.', parameters: [{ name: 'row_selector', type: 'string', description: 'CSS selector for parent row to hover (e.g. ytmusic-responsive-list-item-renderer)', required: false }, { name: 'selector', type: 'string', description: 'CSS selector for element to click (e.g. #play-button)', required: true }, { name: 'delay_ms', type: 'number', description: 'Wait ms between hover and click (default 400)', required: false }] },
    { name: 'browser_type', displayName: 'Browser: Type', category: 'Browser', icon: PenLine, description: 'Type into input field', parameters: [{ name: 'selector', type: 'string', description: 'Input selector', required: true }, { name: 'text', type: 'string', description: 'Text to type', required: true }] },
    { name: 'browser_screenshot', displayName: 'Browser: Screenshot', category: 'Browser', icon: ImageIcon, description: 'Screenshot current tab', parameters: [] },
    { name: 'browser_find_elements', displayName: 'Browser: Find Elements', category: 'Browser', icon: Search, description: 'Find interactive elements', parameters: [{ name: 'filter', type: 'string', description: 'Filter keyword', required: false }] },
    { name: 'browser_execute_js', displayName: 'Browser: Run JS', category: 'Browser', icon: Code, description: 'Execute JavaScript', parameters: [{ name: 'code', type: 'string', description: 'JavaScript code', required: true }] },
];

const TOOL_CATEGORIES = [...new Set(TOOL_CATALOG.map(t => t.category))];

function getToolEntry(name: string): ToolCatalogEntry | undefined {
    return TOOL_CATALOG.find(t => t.name === name);
}

// ============================================================
// Helpers
// ============================================================

function generateId(): string {
    return crypto.randomUUID().slice(0, 8);
}

function toSnakeCase(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const EMOJI_OPTIONS = ['⚡', '🔄', '🔍', '📋', '🚀', '🛠️', '📊', '🌐', '📁', '💡', '🎯', '✨', '🔧', '📝', '🗂️', '⏰'];

const CONDITION_OPTIONS: Array<{ value: AutomationStep['condition']; label: string; description: string }> = [
    { value: 'always', label: 'Always', description: 'Run regardless of previous step' },
    { value: 'previous_success', label: 'If Previous Succeeded', description: 'Only run if the previous step succeeded' },
    { value: 'previous_failure', label: 'If Previous Failed', description: 'Only run if the previous step failed' },
];

function createEmptyDraft(): AutomationDraft {
    return {
        name: '',
        displayName: '',
        description: '',
        icon: '⚡',
        parameters: [],
        steps: [],
        enabled: true,
    };
}

function createEmptyStep(): AutomationStep {
    return {
        id: generateId(),
        toolName: '',
        label: '',
        args: {},
        condition: 'always',
    };
}

function createEmptyParameter(): AutomationParameter {
    return {
        name: '',
        type: 'string',
        description: '',
        required: true,
    };
}

// ============================================================
// Sub-components
// ============================================================

function EmptyState({ onAdd }: { onAdd: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent)]/10 mb-6">
                <Workflow size={36} className="text-[var(--accent)]" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Automations Yet</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md text-center">
                Create custom automations by chaining tools together step by step.
                Each automation becomes a new tool the AI can call.
            </p>
            <Button onClick={onAdd} className="gap-2">
                <Plus size={16} />
                Create Your First Automation
            </Button>
        </div>
    );
}

// ── Tool Picker Modal ────────────────────────────────────────

function ToolPickerModal({
    open,
    onSelect,
    onClose,
}: {
    open: boolean;
    onSelect: (tool: ToolCatalogEntry) => void;
    onClose: () => void;
}) {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState<string | null>(null);
    const [prevOpen, setPrevOpen] = useState(false);

    if (open && !prevOpen) {
        setSearch('');
        setActiveCategory(null);
    }
    if (open !== prevOpen) {
        setPrevOpen(open);
    }

    const filtered = useMemo(() => {
        let list = TOOL_CATALOG;
        if (activeCategory) list = list.filter(t => t.category === activeCategory);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(t =>
                t.displayName.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.description.toLowerCase().includes(q)
            );
        }
        return list;
    }, [search, activeCategory]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative w-full max-w-2xl max-h-[80vh] glass-strong rounded-[var(--radius-xl)] border border-[var(--border)] shadow-2xl flex flex-col overflow-hidden mx-4">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--border)]">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Choose a Tool</h3>
                    <Input
                        placeholder="Search tools..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        autoFocus
                    />
                    {/* Category pills */}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                        <button
                            onClick={() => setActiveCategory(null)}
                            className={cn(
                                'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                                !activeCategory
                                    ? 'bg-[var(--accent)] text-white'
                                    : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                            )}
                        >
                            All
                        </button>
                        {TOOL_CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                                className={cn(
                                    'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                                    activeCategory === cat
                                        ? 'bg-[var(--accent)] text-white'
                                        : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                                )}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tool list */}
                <div className="overflow-y-auto flex-1 p-3">
                    {filtered.length === 0 && (
                        <p className="text-center text-sm text-[var(--text-muted)] py-8">No tools found</p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {filtered.map(tool => {
                            const Icon = tool.icon;
                            return (
                                <button
                                    key={tool.name}
                                    onClick={() => { onSelect(tool); onClose(); }}
                                    className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 text-left transition-all hover:border-[var(--accent)]/50 hover:bg-[var(--surface-hover)] group"
                                >
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)]/10 group-hover:bg-[var(--accent)]/20 transition-colors">
                                        <Icon size={15} className="text-[var(--accent)]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-[var(--text-primary)] truncate">{tool.displayName}</p>
                                        <p className="text-xs text-[var(--text-muted)] line-clamp-1">{tool.description}</p>
                                    </div>
                                    <Badge variant="default" className="text-[10px] shrink-0 mt-0.5">{tool.category}</Badge>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-[var(--border)] flex justify-end">
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </div>
    );
}

// ── Step Card ────────────────────────────────────────────────

function StepCard({
    step,
    index,
    totalSteps,
    automationParams,
    previousStepIds,
    onUpdate,
    onRemove,
    onMoveUp,
    onMoveDown,
    onPickTool,
}: {
    step: AutomationStep;
    index: number;
    totalSteps: number;
    automationParams: AutomationParameter[];
    previousStepIds: string[];
    onUpdate: (updated: AutomationStep) => void;
    onRemove: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onPickTool: () => void;
}) {
    const [expanded, setExpanded] = useState(true);
    const toolEntry = step.toolName ? getToolEntry(step.toolName) : null;
    const Icon = toolEntry?.icon ?? Zap;

    // Build list of available template variables
    const templateVars = useMemo(() => {
        const vars: Array<{ token: string; label: string }> = [];
        for (const p of automationParams) {
            if (p.name) vars.push({ token: `{{input.${p.name}}}`, label: `Input: ${p.name}` });
        }
        for (const sid of previousStepIds) {
            vars.push({ token: `{{steps.${sid}.result}}`, label: `Step ${sid} result` });
        }
        return vars;
    }, [automationParams, previousStepIds]);

    return (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg)] overflow-hidden group/step">
            {/* Step Header */}
            <div className="flex items-center gap-2 px-4 py-3 bg-[var(--surface)]">
                <div className="flex items-center gap-1 text-[var(--text-muted)] cursor-grab">
                    <GripVertical size={14} />
                </div>

                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">
                    {index + 1}
                </div>

                {toolEntry ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Icon size={15} className="text-[var(--accent)] shrink-0" />
                        <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                            {step.label || toolEntry.displayName}
                        </span>
                        <Badge variant="default" className="text-[10px] shrink-0">{toolEntry.category}</Badge>
                    </div>
                ) : (
                    <button
                        onClick={onPickTool}
                        className="flex items-center gap-2 flex-1 text-sm text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                    >
                        <Plus size={14} />
                        Select a tool…
                    </button>
                )}

                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={onMoveUp}
                        disabled={index === 0}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                        title="Move up"
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        onClick={onMoveDown}
                        disabled={index === totalSteps - 1}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30 transition-colors"
                        title="Move down"
                    >
                        <ChevronDown size={14} />
                    </button>
                    <button
                        onClick={() => setExpanded(v => !v)}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <button
                        onClick={onRemove}
                        className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--dangerous)] transition-colors"
                        title="Remove step"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Step Body */}
            {expanded && (
                <div className="px-4 py-4 space-y-4 border-t border-[var(--border)]">
                    {/* Tool selector (if none chosen) */}
                    {!step.toolName && (
                        <Button variant="outline" size="sm" onClick={onPickTool} className="gap-2 w-full">
                            <Plus size={14} /> Choose Tool
                        </Button>
                    )}

                    {/* If tool is chosen show its config */}
                    {toolEntry && (
                        <>
                            {/* Step label */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[var(--text-secondary)]">Step Label</label>
                                <Input
                                    value={step.label}
                                    onChange={e => onUpdate({ ...step, label: e.target.value })}
                                    placeholder={toolEntry.displayName}
                                    className="h-8 text-sm"
                                />
                            </div>

                            {/* Condition */}
                            {index > 0 && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[var(--text-secondary)]">Run Condition</label>
                                    <div className="flex gap-2">
                                        {CONDITION_OPTIONS.map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => onUpdate({ ...step, condition: opt.value })}
                                                className={cn(
                                                    'flex-1 rounded-[var(--radius-md)] px-3 py-2 text-xs font-medium border transition-all text-center',
                                                    step.condition === opt.value
                                                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                                                )}
                                                title={opt.description}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Tool parameters */}
                            {toolEntry.parameters.length > 0 && (
                                <div className="space-y-3">
                                    <label className="text-xs font-medium text-[var(--text-secondary)]">Arguments</label>
                                    {toolEntry.parameters.map(param => (
                                        <div key={param.name} className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-[var(--accent)]">{param.name}</span>
                                                {param.required && <span className="text-[10px] text-[var(--dangerous)]">required</span>}
                                                <span className="text-[10px] text-[var(--text-muted)]">{param.type}</span>
                                            </div>
                                            <Input
                                                value={step.args[param.name] ?? ''}
                                                onChange={e => onUpdate({
                                                    ...step,
                                                    args: { ...step.args, [param.name]: e.target.value },
                                                })}
                                                placeholder={param.description}
                                                className="h-8 text-sm font-mono"
                                            />
                                            <p className="text-[10px] text-[var(--text-muted)]">{param.description}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Template variable helper */}
                            {templateVars.length > 0 && (
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-[var(--text-muted)] flex items-center gap-1.5">
                                        <Sparkles size={11} />
                                        Available Variables
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {templateVars.map(v => (
                                            <button
                                                key={v.token}
                                                onClick={() => {
                                                    navigator.clipboard.writeText(v.token);
                                                }}
                                                className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-[10px] font-mono text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors cursor-copy"
                                                title={`Click to copy: ${v.token}`}
                                            >
                                                {v.token}
                                                <Copy size={9} />
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-[var(--text-muted)]">
                                        Click to copy, then paste into argument fields above to reference inputs or previous step results.
                                    </p>
                                </div>
                            )}

                            {/* Change tool */}
                            <div className="pt-1">
                                <button
                                    onClick={onPickTool}
                                    className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors flex items-center gap-1"
                                >
                                    <Settings size={11} /> Change tool
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Parameter Row ────────────────────────────────────────────

function ParameterRow({
    param,
    onUpdate,
    onRemove,
}: {
    param: AutomationParameter;
    onUpdate: (updated: AutomationParameter) => void;
    onRemove: () => void;
}) {
    return (
        <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">Name</label>
                    <Input
                        value={param.name}
                        onChange={e => onUpdate({ ...param, name: toSnakeCase(e.target.value) })}
                        placeholder="param_name"
                        className="h-8 text-sm font-mono"
                    />
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">Type</label>
                    <select
                        value={param.type}
                        onChange={e => onUpdate({ ...param, type: e.target.value as 'string' | 'number' | 'boolean' })}
                        className="flex h-8 w-full rounded-[var(--radius-md)] px-2 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-medium text-[var(--text-muted)]">Description</label>
                    <Input
                        value={param.description}
                        onChange={e => onUpdate({ ...param, description: e.target.value })}
                        placeholder="What this parameter is for"
                        className="h-8 text-sm"
                    />
                </div>
            </div>
            <div className="flex flex-col items-center gap-2 pt-5">
                <button
                    onClick={() => onUpdate({ ...param, required: !param.required })}
                    className={cn(
                        'text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all',
                        param.required
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-muted)]'
                    )}
                >
                    {param.required ? 'Required' : 'Optional'}
                </button>
                <button
                    onClick={onRemove}
                    className="text-[var(--text-muted)] hover:text-[var(--dangerous)] transition-colors"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        </div>
    );
}

// ── Automation Card (list view) ──────────────────────────────

function AutomationCard({
    automation,
    onEdit,
    onDelete,
    onToggle,
}: {
    automation: CustomAutomation;
    onEdit: () => void;
    onDelete: () => void;
    onToggle: () => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg)] overflow-hidden transition-all hover:border-[var(--accent)]/30 group">
            <div className="flex items-center gap-4 px-5 py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent)]/10 text-xl">
                    {automation.icon || '⚡'}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {automation.displayName}
                        </p>
                        <Badge variant={automation.enabled ? 'safe' : 'default'} className="text-[10px]">
                            {automation.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] line-clamp-1 mt-0.5">
                        {automation.description || 'No description'}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-[var(--text-muted)] font-mono">
                            {automation.name}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                            {automation.steps.length} step{automation.steps.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">
                            {automation.parameters.length} param{automation.parameters.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={onToggle}
                        className={cn(
                            'p-2 rounded-[var(--radius-md)] transition-all',
                            automation.enabled
                                ? 'text-[var(--safe)] hover:bg-[var(--safe)]/10'
                                : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)]'
                        )}
                        title={automation.enabled ? 'Disable' : 'Enable'}
                    >
                        <ToggleLeft size={18} />
                    </button>
                    <Button variant="ghost" size="sm" onClick={onEdit} className="gap-1.5">
                        <Settings size={14} />
                        Edit
                    </Button>
                    {confirmDelete ? (
                        <div className="flex items-center gap-1">
                            <Button variant="destructive" size="sm" onClick={() => { onDelete(); setConfirmDelete(false); }}>
                                Delete
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                                <X size={14} />
                            </Button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setConfirmDelete(true)}
                            className="p-2 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--dangerous)] hover:bg-[var(--dangerous)]/10 transition-all"
                        >
                            <Trash2 size={15} />
                        </button>
                    )}
                </div>
            </div>

            {/* Step preview */}
            <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
                {automation.steps.map((step, i) => {
                    const entry = getToolEntry(step.toolName);
                    const StepIcon = entry?.icon ?? Zap;
                    return (
                        <span key={step.id} className="flex items-center gap-1">
                            {i > 0 && <ChevronRight size={10} className="text-[var(--text-muted)]" />}
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface)] border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                                <StepIcon size={10} />
                                {step.label || entry?.displayName || step.toolName}
                            </span>
                        </span>
                    );
                })}
                {automation.steps.length === 0 && (
                    <span className="text-[10px] text-[var(--text-muted)] italic">No steps defined</span>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Main Builder View
// ============================================================

function AutomationBuilder({
    initial,
    existingId,
    onSave,
    onCancel,
    isSaving,
}: {
    initial: AutomationDraft;
    existingId?: string;
    onSave: (draft: AutomationDraft) => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
}) {
    const [draft, setDraft] = useState<AutomationDraft>(initial);
    const [toolPickerOpen, setToolPickerOpen] = useState(false);
    const [pickingStepIndex, setPickingStepIndex] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'basic' | 'params' | 'steps'>('basic');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const updateField = useCallback(<K extends keyof AutomationDraft>(key: K, value: AutomationDraft[K]) => {
        setDraft(prev => ({ ...prev, [key]: value }));
        setValidationErrors([]);
    }, []);

    // Auto-generate snake_case name from displayName
    const [prevDisplayName, setPrevDisplayName] = useState(draft.displayName);
    if (!existingId && draft.displayName !== prevDisplayName) {
        setPrevDisplayName(draft.displayName);
        const generated = 'custom_' + toSnakeCase(draft.displayName);
        if (draft.name !== generated) {
            setDraft(prev => ({ ...prev, name: generated }));
        }
    }

    // ── Step management ──
    const addStep = useCallback(() => {
        setDraft(prev => ({ ...prev, steps: [...prev.steps, createEmptyStep()] }));
        setActiveTab('steps');
    }, []);

    const updateStep = useCallback((index: number, updated: AutomationStep) => {
        setDraft(prev => {
            const steps = [...prev.steps];
            steps[index] = updated;
            return { ...prev, steps };
        });
    }, []);

    const removeStep = useCallback((index: number) => {
        setDraft(prev => ({
            ...prev,
            steps: prev.steps.filter((_, i) => i !== index),
        }));
    }, []);

    const moveStep = useCallback((from: number, direction: 'up' | 'down') => {
        setDraft(prev => {
            const steps = [...prev.steps];
            const to = direction === 'up' ? from - 1 : from + 1;
            if (to < 0 || to >= steps.length) return prev;
            [steps[from], steps[to]] = [steps[to], steps[from]];
            return { ...prev, steps };
        });
    }, []);

    const openToolPicker = useCallback((stepIndex: number) => {
        setPickingStepIndex(stepIndex);
        setToolPickerOpen(true);
    }, []);

    const handleToolSelected = useCallback((tool: ToolCatalogEntry) => {
        if (pickingStepIndex === null) return;
        setDraft(prev => {
            const steps = [...prev.steps];
            const existing = steps[pickingStepIndex];
            steps[pickingStepIndex] = {
                ...existing,
                toolName: tool.name,
                label: existing.label || tool.displayName,
                args: {},
            };
            return { ...prev, steps };
        });
        setPickingStepIndex(null);
    }, [pickingStepIndex]);

    // ── Parameter management ──
    const addParam = useCallback(() => {
        setDraft(prev => ({
            ...prev,
            parameters: [...prev.parameters, createEmptyParameter()],
        }));
        setActiveTab('params');
    }, []);

    const updateParam = useCallback((index: number, updated: AutomationParameter) => {
        setDraft(prev => {
            const parameters = [...prev.parameters];
            parameters[index] = updated;
            return { ...prev, parameters };
        });
    }, []);

    const removeParam = useCallback((index: number) => {
        setDraft(prev => ({
            ...prev,
            parameters: prev.parameters.filter((_, i) => i !== index),
        }));
    }, []);

    // ── Validation & Save ──
    const validate = useCallback((): string[] => {
        const errors: string[] = [];
        if (!draft.displayName.trim()) errors.push('Display name is required');
        if (!draft.name.trim()) errors.push('Tool name is required');
        if (draft.steps.length === 0) errors.push('At least one step is required');
        for (let i = 0; i < draft.steps.length; i++) {
            if (!draft.steps[i].toolName) errors.push(`Step ${i + 1} has no tool selected`);
        }
        for (let i = 0; i < draft.parameters.length; i++) {
            if (!draft.parameters[i].name.trim()) errors.push(`Parameter ${i + 1} has no name`);
        }
        // Check for duplicate param names
        const paramNames = draft.parameters.map(p => p.name).filter(Boolean);
        if (new Set(paramNames).size !== paramNames.length) errors.push('Parameter names must be unique');
        return errors;
    }, [draft]);

    const handleSave = useCallback(async () => {
        const errors = validate();
        if (errors.length > 0) {
            setValidationErrors(errors);
            return;
        }
        await onSave(draft);
    }, [draft, validate, onSave]);

    const stepCount = draft.steps.length;
    const paramCount = draft.parameters.length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={onCancel} title="Back to list">
                    <ArrowLeft size={18} />
                </Button>
                <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        {existingId ? 'Edit Automation' : 'New Automation'}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">
                        {existingId ? 'Modify your custom tool chain' : 'Build a step-by-step tool chain the AI can call'}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
                    <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-2">
                        {isSaving
                            ? <><Loader2 size={14} className="animate-spin" />Saving…</>
                            : <><Save size={14} />Save Automation</>
                        }
                    </Button>
                </div>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
                <div className="rounded-[var(--radius-md)] border border-[var(--dangerous)]/30 bg-[var(--dangerous)]/5 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-[var(--dangerous)] mb-2">
                        <AlertTriangle size={15} />
                        Please fix the following issues:
                    </div>
                    <ul className="space-y-1">
                        {validationErrors.map((err, i) => (
                            <li key={i} className="text-xs text-[var(--text-secondary)] flex items-center gap-2">
                                <span className="h-1 w-1 rounded-full bg-[var(--dangerous)] shrink-0" />
                                {err}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Tab Navigation */}
            <div className="flex gap-1 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-1">
                {([
                    { key: 'basic' as const, label: 'Basic Info', icon: Info },
                    { key: 'params' as const, label: `Parameters (${paramCount})`, icon: Code },
                    { key: 'steps' as const, label: `Steps (${stepCount})`, icon: Workflow },
                ]).map(tab => {
                    const TabIcon = tab.icon;
                    const active = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'flex-1 flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium transition-all',
                                active
                                    ? 'bg-[var(--accent)] text-white shadow-sm'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                            )}
                        >
                            <TabIcon size={15} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* ── Tab: Basic Info ── */}
            {activeTab === 'basic' && (
                <Card>
                    <CardContent>
                        <div className="space-y-5 pt-1">
                            {/* Icon + Display Name row */}
                            <div className="flex gap-4 items-start">
                                <div className="space-y-1.5 shrink-0">
                                    <label className="text-xs font-medium text-[var(--text-secondary)]">Icon</label>
                                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                                        {EMOJI_OPTIONS.map(emoji => (
                                            <button
                                                key={emoji}
                                                onClick={() => updateField('icon', emoji)}
                                                className={cn(
                                                    'h-8 w-8 rounded-[var(--radius-sm)] text-base flex items-center justify-center transition-all border',
                                                    draft.icon === emoji
                                                        ? 'border-[var(--accent)] bg-[var(--accent)]/15 scale-110'
                                                        : 'border-transparent hover:bg-[var(--surface-hover)]'
                                                )}
                                            >
                                                {emoji}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-[var(--text-secondary)]">Display Name *</label>
                                        <Input
                                            value={draft.displayName}
                                            onChange={e => updateField('displayName', e.target.value)}
                                            placeholder="Research & Summarize"
                                        />
                                        <p className="text-[10px] text-[var(--text-muted)]">Human-friendly name shown in tool lists</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-[var(--text-secondary)]">Tool Name</label>
                                        <Input
                                            value={draft.name}
                                            onChange={e => updateField('name', toSnakeCase(e.target.value))}
                                            placeholder="custom_research_and_summarize"
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-[10px] text-[var(--text-muted)]">
                                            Snake_case identifier the LLM calls. Auto-generated from display name.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-[var(--text-secondary)]">Description *</label>
                                <textarea
                                    value={draft.description}
                                    onChange={e => updateField('description', e.target.value)}
                                    rows={3}
                                    className="w-full rounded-[var(--radius-md)] px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-y transition-all text-sm leading-relaxed"
                                    placeholder="Describe what this automation does. The AI reads this to decide when to use the tool.&#10;Example: Search the web for a topic, extract the top result, then save a summary to a file."
                                />
                                <p className="text-[10px] text-[var(--text-muted)]">
                                    The LLM reads this to understand when and how to use the automation. Be descriptive.
                                </p>
                            </div>

                            {/* Enable toggle */}
                            <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
                                <div>
                                    <p className="text-sm font-medium text-[var(--text-primary)]">Enabled</p>
                                    <p className="text-xs text-[var(--text-muted)]">When disabled, the AI won&apos;t see or call this tool</p>
                                </div>
                                <button
                                    onClick={() => updateField('enabled', !draft.enabled)}
                                    className={cn(
                                        'relative h-6 w-11 rounded-full transition-colors',
                                        draft.enabled ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                                    )}
                                >
                                    <span className={cn(
                                        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                        draft.enabled ? 'left-[22px]' : 'left-0.5'
                                    )} />
                                </button>
                            </div>

                            {/* Preview */}
                            <div className="rounded-[var(--radius-md)] border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-4">
                                <p className="text-xs font-semibold text-[var(--accent)] mb-2 flex items-center gap-1.5">
                                    <Eye size={12} /> LLM Tool Preview
                                </p>
                                <div className="font-mono text-xs text-[var(--text-secondary)] space-y-1 break-all">
                                    <p><span className="text-[var(--text-muted)]">name:</span> {draft.name || '—'}</p>
                                    <p><span className="text-[var(--text-muted)]">desc:</span> {draft.description || '—'}</p>
                                    <p><span className="text-[var(--text-muted)]">params:</span> {draft.parameters.map(p => p.name).filter(Boolean).join(', ') || 'none'}</p>
                                    <p><span className="text-[var(--text-muted)]">steps:</span> {draft.steps.map(s => s.toolName || '?').join(' → ') || 'none'}</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Tab: Parameters ── */}
            {activeTab === 'params' && (
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Code size={16} className="text-[var(--accent)]" />
                                    Input Parameters
                                </CardTitle>
                                <CardDescription>
                                    Define what the AI needs to provide when calling this automation.
                                    Use <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-xs">{'{{input.param_name}}'}</code> in step args to reference them.
                                </CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={addParam} className="gap-1.5 shrink-0">
                                <Plus size={14} /> Add Parameter
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {draft.parameters.length === 0 ? (
                            <div className="flex flex-col items-center py-10 text-center">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] mb-3">
                                    <Code size={20} className="text-[var(--text-muted)]" />
                                </div>
                                <p className="text-sm text-[var(--text-secondary)] mb-1">No parameters defined</p>
                                <p className="text-xs text-[var(--text-muted)] max-w-sm">
                                    Parameters let the AI pass dynamic values into your automation.
                                    You can also use hardcoded values in step args if no parameters are needed.
                                </p>
                                <Button variant="outline" size="sm" onClick={addParam} className="gap-1.5 mt-4">
                                    <Plus size={14} /> Add Parameter
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {draft.parameters.map((param, i) => (
                                    <ParameterRow
                                        key={i}
                                        param={param}
                                        onUpdate={updated => updateParam(i, updated)}
                                        onRemove={() => removeParam(i)}
                                    />
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Tab: Steps ── */}
            {activeTab === 'steps' && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2 text-base">
                                        <Workflow size={16} className="text-[var(--accent)]" />
                                        Automation Steps
                                    </CardTitle>
                                    <CardDescription>
                                        Each step calls a tool in sequence. Results from previous steps can be referenced
                                        using <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded text-xs">{'{{steps.<id>.result}}'}</code>.
                                    </CardDescription>
                                </div>
                                <Button variant="outline" size="sm" onClick={addStep} className="gap-1.5 shrink-0">
                                    <Plus size={14} /> Add Step
                                </Button>
                            </div>
                        </CardHeader>
                    </Card>

                    {draft.steps.length === 0 ? (
                        <div className="flex flex-col items-center py-14 text-center rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border)]">
                            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface)] mb-4">
                                <Workflow size={24} className="text-[var(--text-muted)]" />
                            </div>
                            <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">No steps yet</p>
                            <p className="text-xs text-[var(--text-muted)] max-w-sm mb-4">
                                Add steps to define what this automation does.
                                Steps run top-to-bottom and each can use results from previous steps.
                            </p>
                            <Button variant="outline" size="sm" onClick={addStep} className="gap-1.5">
                                <Plus size={14} /> Add First Step
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {draft.steps.map((step, i) => (
                                <div key={step.id}>
                                    <StepCard
                                        step={step}
                                        index={i}
                                        totalSteps={draft.steps.length}
                                        automationParams={draft.parameters}
                                        previousStepIds={draft.steps.slice(0, i).map(s => s.id)}
                                        onUpdate={updated => updateStep(i, updated)}
                                        onRemove={() => removeStep(i)}
                                        onMoveUp={() => moveStep(i, 'up')}
                                        onMoveDown={() => moveStep(i, 'down')}
                                        onPickTool={() => openToolPicker(i)}
                                    />
                                    {/* Connector line between steps */}
                                    {i < draft.steps.length - 1 && (
                                        <div className="flex justify-center py-1">
                                            <ArrowDown size={16} className="text-[var(--accent)]/40" />
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Add more button */}
                            <button
                                onClick={addStep}
                                className="w-full rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border)] py-4 text-sm text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-all flex items-center justify-center gap-2"
                            >
                                <Plus size={15} /> Add Another Step
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Tool Picker Modal */}
            <ToolPickerModal
                open={toolPickerOpen}
                onSelect={handleToolSelected}
                onClose={() => { setToolPickerOpen(false); setPickingStepIndex(null); }}
            />
        </div>
    );
}

// ============================================================
// Page
// ============================================================

export default function AutomationsPage() {
    const {
        automations,
        isLoading,
        error,
        createAutomation,
        updateAutomation,
        deleteAutomation,
    } = useAutomations();

    type ViewMode = 'list' | 'create' | 'edit';
    const [view, setView] = useState<ViewMode>('list');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const editingAutomation = useMemo(
        () => editingId ? automations.find(a => a.id === editingId) ?? null : null,
        [editingId, automations]
    );

    const handleCreate = useCallback(() => {
        setEditingId(null);
        setView('create');
        setSaveMessage(null);
    }, []);

    const handleEdit = useCallback((id: string) => {
        setEditingId(id);
        setView('edit');
        setSaveMessage(null);
    }, []);

    const handleSaveNew = useCallback(async (draft: AutomationDraft) => {
        setIsSaving(true);
        setSaveMessage(null);
        try {
            const result = await createAutomation(draft);
            if (result) {
                setSaveMessage({ type: 'success', text: `"${draft.displayName}" created successfully!` });
                setView('list');
            } else {
                setSaveMessage({ type: 'error', text: 'Failed to create automation' });
            }
        } catch (err) {
            setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setIsSaving(false);
        }
    }, [createAutomation]);

    const handleSaveExisting = useCallback(async (draft: AutomationDraft) => {
        if (!editingId) return;
        setIsSaving(true);
        setSaveMessage(null);
        try {
            const ok = await updateAutomation(editingId, draft);
            if (ok) {
                setSaveMessage({ type: 'success', text: `"${draft.displayName}" updated!` });
                setView('list');
            } else {
                setSaveMessage({ type: 'error', text: 'Failed to update automation' });
            }
        } catch (err) {
            setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unknown error' });
        } finally {
            setIsSaving(false);
        }
    }, [editingId, updateAutomation]);

    const handleDelete = useCallback(async (id: string) => {
        const ok = await deleteAutomation(id);
        if (ok) {
            setSaveMessage({ type: 'success', text: 'Automation deleted' });
            setTimeout(() => setSaveMessage(null), 3000);
        }
    }, [deleteAutomation]);

    const handleToggle = useCallback(async (automation: CustomAutomation) => {
        await updateAutomation(automation.id, { enabled: !automation.enabled });
    }, [updateAutomation]);

    const handleCancel = useCallback(() => {
        setView('list');
        setEditingId(null);
        setSaveMessage(null);
    }, []);

    // ── Loading ──
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                    <p className="text-sm text-[var(--text-muted)]">Loading automations…</p>
                </div>
            </div>
        );
    }

    // ── Error ──
    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Card className="max-w-md text-center">
                    <CardContent className="py-12 px-8">
                        <AlertTriangle size={48} className="text-[var(--dangerous)] mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
                            Cannot Load Automations
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

    return (
        <div className="h-full overflow-y-auto py-8">
            <Container>
                {/* ── Save message toast ── */}
                {saveMessage && (
                    <div className={cn(
                        'mb-6 rounded-[var(--radius-md)] border px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2',
                        saveMessage.type === 'success'
                            ? 'border-[var(--safe)]/30 bg-[var(--safe)]/5'
                            : 'border-[var(--dangerous)]/30 bg-[var(--dangerous)]/5'
                    )}>
                        {saveMessage.type === 'success'
                            ? <Check size={16} className="text-[var(--safe)] shrink-0" />
                            : <AlertTriangle size={16} className="text-[var(--dangerous)] shrink-0" />
                        }
                        <p className={cn(
                            'text-sm flex-1',
                            saveMessage.type === 'success' ? 'text-[var(--safe)]' : 'text-[var(--dangerous)]'
                        )}>
                            {saveMessage.text}
                        </p>
                        <button onClick={() => setSaveMessage(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* ── List View ── */}
                {view === 'list' && (
                    <>
                        {/* Page header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--accent)]/10">
                                    <Workflow size={24} className="text-[var(--accent)]" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Automations</h1>
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        Create custom tool chains that the AI can call as a single action
                                    </p>
                                </div>
                            </div>
                            {automations.length > 0 && (
                                <Button onClick={handleCreate} className="gap-2">
                                    <Plus size={16} />
                                    New Automation
                                </Button>
                            )}
                        </div>

                        {/* Info banner */}
                        <div className="rounded-[var(--radius-lg)] border border-[var(--accent)]/20 bg-[var(--accent)]/5 px-5 py-4 mb-6 flex items-start gap-3">
                            <Sparkles size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
                            <div className="text-xs text-[var(--text-secondary)] space-y-1">
                                <p className="font-medium text-sm text-[var(--accent)]">How it works</p>
                                <p>
                                    1. <strong>Define parameters</strong> — inputs the AI provides (e.g. a search query, a file path).
                                </p>
                                <p>
                                    2. <strong>Add steps</strong> — pick tools and wire their arguments using{' '}
                                    <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded">{'{{input.param}}'}</code>{' '}
                                    or <code className="text-[var(--accent)] bg-[var(--surface)] px-1 rounded">{'{{steps.id.result}}'}</code>.
                                </p>
                                <p>
                                    3. <strong>Save</strong> — the automation registers as a new tool. The AI sees it and can call it automatically.
                                </p>
                            </div>
                        </div>

                        {automations.length === 0 ? (
                            <EmptyState onAdd={handleCreate} />
                        ) : (
                            <div className="space-y-3">
                                {automations.map(a => (
                                    <AutomationCard
                                        key={a.id}
                                        automation={a}
                                        onEdit={() => handleEdit(a.id)}
                                        onDelete={() => handleDelete(a.id)}
                                        onToggle={() => handleToggle(a)}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Stats footer */}
                        {automations.length > 0 && (
                            <div className="mt-8 flex items-center justify-center gap-6 text-xs text-[var(--text-muted)]">
                                <span>{automations.length} automation{automations.length !== 1 ? 's' : ''}</span>
                                <span>{automations.filter(a => a.enabled).length} active</span>
                                <span>{automations.reduce((sum, a) => sum + a.steps.length, 0)} total steps</span>
                            </div>
                        )}
                    </>
                )}

                {/* ── Create View ── */}
                {view === 'create' && (
                    <AutomationBuilder
                        initial={createEmptyDraft()}
                        onSave={handleSaveNew}
                        onCancel={handleCancel}
                        isSaving={isSaving}
                    />
                )}

                {/* ── Edit View ── */}
                {view === 'edit' && editingAutomation && (
                    <AutomationBuilder
                        initial={{
                            name: editingAutomation.name,
                            displayName: editingAutomation.displayName,
                            description: editingAutomation.description,
                            icon: editingAutomation.icon,
                            parameters: editingAutomation.parameters,
                            steps: editingAutomation.steps,
                            enabled: editingAutomation.enabled,
                        }}
                        existingId={editingAutomation.id}
                        onSave={handleSaveExisting}
                        onCancel={handleCancel}
                        isSaving={isSaving}
                    />
                )}

            </Container>
        </div>
    );
}
