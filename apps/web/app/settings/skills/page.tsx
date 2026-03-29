'use client';

import { useState, useCallback, useEffect } from 'react';
import { useSkills } from '@/hooks/useSkills';
import type { ParsedSkill } from '@/hooks/useSkills';

// ── Local frontmatter parser (mirrors shared-schema/skill.schema.ts) ─────────
function parseSkillContent(content: string): ParsedSkill | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return null;

    const frontmatterText = match[1];
    const body = match[2].trim();
    const frontmatter: Record<string, string> = {};

    for (const line of frontmatterText.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        if (key) frontmatter[key] = value;
    }

    const name = frontmatter['name'];
    const displayName = frontmatter['displayName'] || frontmatter['display_name'];
    if (!name || !displayName) return null;

    const temperatureRaw = frontmatter['temperature'];
    const temperature = temperatureRaw !== undefined ? parseFloat(temperatureRaw) : undefined;

    return {
        name,
        displayName,
        icon: frontmatter['icon'] || '🎯',
        description: frontmatter['description'] || '',
        body,
        temperature: temperature !== undefined && !isNaN(temperature)
            ? Math.min(2, Math.max(0, temperature))
            : undefined,
    };
}
import { Container } from '@/components/layout';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Button, Badge,
} from '@/components/ui';
import {
    Sparkles,
    Plus,
    Pencil,
    Trash2,
    Check,
    X,
    Loader2,
    ChevronLeft,
    Zap,
    BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// Types
// ============================================================

type View = 'list' | 'editor';

// ============================================================
// Empty state
// ============================================================

function EmptyState({ onAdd, onGenerate }: { onAdd: () => void; onGenerate: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--accent)]/10 mb-6">
                <Sparkles size={36} className="text-[var(--accent)]" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Custom Skills Yet</h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-md text-center">
                Skills are behavioral overlays that change how Aurelius responds.
                Write one manually or let the AI generate one from a description.
            </p>
            <div className="flex gap-3">
                <Button onClick={onGenerate} className="gap-2">
                    <Sparkles size={16} />
                    Generate with AI
                </Button>
                <Button variant="outline" onClick={onAdd} className="gap-2">
                    <Plus size={16} />
                    Write Manually
                </Button>
            </div>
        </div>
    );
}

// ============================================================
// Skill card
// ============================================================

function SkillCard({
    skill,
    isActive,
    onEdit,
    onDelete,
    onActivate,
    onDeactivate,
}: {
    skill: { name: string; displayName: string; icon: string; description: string; isBuiltIn: boolean };
    isActive: boolean;
    onEdit: () => void;
    onDelete: () => void;
    onActivate: () => void;
    onDeactivate: () => void;
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div
            className={cn(
                'rounded-[var(--radius-lg)] border bg-[var(--surface)] p-4 transition-all',
                isActive
                    ? 'border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)]'
                    : 'border-[var(--border)] hover:border-[var(--border-hover)]',
            )}
        >
            <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--surface-raised)] text-xl">
                    {skill.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-[var(--text-primary)]">
                            {skill.displayName}
                        </span>
                        {isActive && (
                            <Badge className="bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/30 text-xs px-2 py-0.5">
                                ● Active
                            </Badge>
                        )}
                        {skill.isBuiltIn && (
                            <Badge className="bg-[var(--surface-raised)] text-[var(--text-muted)] border-[var(--border)] text-xs px-2 py-0.5">
                                Built-in
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] truncate">
                        {skill.description || 'No description'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5 font-mono">
                        {skill.name}.md
                    </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {isActive ? (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onDeactivate}
                            className="text-xs h-8"
                        >
                            Deactivate
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onActivate}
                            className="text-xs h-8"
                        >
                            <Zap size={13} className="mr-1" />
                            Activate
                        </Button>
                    )}

                    <button
                        onClick={onEdit}
                        className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-all"
                        title="Edit"
                    >
                        <Pencil size={14} />
                    </button>

                    {!skill.isBuiltIn && (
                        confirmDelete ? (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={onDelete}
                                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-all"
                                    title="Confirm delete"
                                >
                                    <Check size={14} />
                                </button>
                                <button
                                    onClick={() => setConfirmDelete(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-all"
                                    title="Cancel"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmDelete(true)}
                                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all"
                                title="Delete"
                            >
                                <Trash2 size={14} />
                            </button>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Skill editor — split pane: raw markdown + live preview
// ============================================================

const TEMPLATE = `---
name: my-skill
displayName: My Skill
icon: 🎯
description: Describe what this skill does and when to use it
temperature: 0.7
---

# My Skill

[Write your instructions here in imperative form]

## Output Style
- [How should Aurelius format its responses?]

## Rules
- [What specific rules should Aurelius follow?]
`;

function SkillEditor({
    initialContent,
    existingName,
    onSave,
    onCancel,
    isSaving,
}: {
    initialContent: string;
    existingName?: string;
    onSave: (content: string) => Promise<void>;
    onCancel: () => void;
    isSaving: boolean;
}) {
    const [content, setContent] = useState(initialContent || TEMPLATE);

    const parsed = (() => {
        try { return parseSkillContent(content); } catch { return null; }
    })();

    const handleSave = async () => {
        await onSave(content);
    };

    // Split content into frontmatter and body for preview
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    const previewBody = frontmatterMatch ? frontmatterMatch[2].trim() : content.trim();

    return (
        <div className="flex flex-col h-full">
            {/* Editor toolbar */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onCancel}
                        className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <ChevronLeft size={16} />
                        Back
                    </button>
                    <span className="text-[var(--border)]">/</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                        {existingName
                            ? `Editing: ${parsed?.displayName || existingName}`
                            : 'New Skill'}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={isSaving || !parsed}
                        className="gap-2"
                    >
                        {isSaving ? (
                            <><Loader2 size={14} className="animate-spin" /> Saving…</>
                        ) : (
                            <><Check size={14} /> Save Skill</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Validation error */}
            {content.trim() && !parsed && (
                <div className="mb-3 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
                    Missing required frontmatter fields: <code>name</code> and <code>displayName</code>
                </div>
            )}

            {/* Split pane */}
            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
                {/* Left — raw markdown */}
                <div className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                        <BookOpen size={13} className="text-[var(--text-muted)]" />
                        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                            SKILL.md
                        </span>
                    </div>
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        spellCheck={false}
                        className={cn(
                            'flex-1 resize-none bg-[var(--surface)] p-4 text-sm font-mono',
                            'text-[var(--text-primary)] outline-none',
                            'placeholder:text-[var(--text-muted)]',
                        )}
                        placeholder={TEMPLATE}
                    />
                </div>

                {/* Right — preview */}
                <div className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--border)] overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-raised)]">
                        <Sparkles size={13} className="text-[var(--text-muted)]" />
                        <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
                            Preview
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {parsed ? (
                            <div className="space-y-4">
                                {/* Metadata card */}
                                <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-4">
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className="text-2xl">{parsed.icon}</span>
                                        <div>
                                            <p className="font-semibold text-[var(--text-primary)]">
                                                {parsed.displayName}
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)] font-mono">
                                                {parsed.name}.md
                                            </p>
                                        </div>
                                    </div>
                                    {parsed.description && (
                                        <p className="text-sm text-[var(--text-secondary)] mb-3">
                                            {parsed.description}
                                        </p>
                                    )}
                                    {parsed.temperature !== undefined && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-[var(--text-muted)]">Temperature:</span>
                                            <Badge className="text-xs bg-[var(--accent)]/10 text-[var(--accent)] border-[var(--accent)]/20">
                                                {parsed.temperature}
                                            </Badge>
                                        </div>
                                    )}
                                </div>

                                {/* Body */}
                                {previewBody && (
                                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-4">
                                        <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide mb-3">
                                            Instructions
                                        </p>
                                        <pre className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap font-sans leading-relaxed">
                                            {previewBody}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center py-8">
                                <p className="text-sm text-[var(--text-muted)]">
                                    Start writing to see a preview
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Generate modal
// ============================================================

function GenerateModal({
    onGenerate,
    onClose,
}: {
    onGenerate: (description: string) => Promise<void>;
    onClose: () => void;
}) {
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!description.trim()) return;
        setLoading(true);
        setError(null);
        try {
            await onGenerate(description.trim());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Generation failed');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            void handleSubmit();
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-lg mx-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl p-6">
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
                            <Sparkles size={18} className="text-[var(--accent)]" />
                            Generate Skill with AI
                        </h2>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                            Describe the behavior you want and the AI will write the SKILL.md for you.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors mt-0.5"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="text-sm font-medium text-[var(--text-secondary)] block mb-2">
                            What should this skill do?
                        </label>
                        <textarea
                            autoFocus
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g. A skill for writing formal Thai business emails — professional tone, polite language, proper greetings..."
                            rows={4}
                            className={cn(
                                'w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)]',
                                'bg-[var(--surface-raised)] px-3 py-2.5 text-sm text-[var(--text-primary)]',
                                'placeholder:text-[var(--text-muted)] outline-none',
                                'focus:border-[var(--accent)] transition-colors',
                            )}
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1.5">
                            Tip: Be specific about tone, output format, and use case. Press ⌘↵ to generate.
                        </p>
                    </div>

                    {error && (
                        <div className="rounded-[var(--radius-md)] border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Example prompts */}
                    <div>
                        <p className="text-xs text-[var(--text-muted)] mb-2 font-medium uppercase tracking-wide">
                            Examples
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {[
                                'Senior TypeScript code reviewer',
                                'Concise bullet-point summarizer',
                                'Thai legal document analyst',
                                'Git commit message writer',
                            ].map(example => (
                                <button
                                    key={example}
                                    onClick={() => setDescription(example)}
                                    className="text-xs px-2.5 py-1 rounded-full border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] hover:bg-[var(--accent)]/5 transition-all"
                                >
                                    {example}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <Button variant="outline" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={!description.trim() || loading}
                        className="gap-2"
                    >
                        {loading ? (
                            <><Loader2 size={14} className="animate-spin" /> Generating…</>
                        ) : (
                            <><Sparkles size={14} /> Generate</>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Main page
// ============================================================

export default function SkillsPage() {
    const {
        skills,
        activeSkill,
        isLoading,
        error,
        createSkill,
        updateSkill,
        deleteSkill,
        setActiveSkill,
        generateSkill,
        refetch,
    } = useSkills();

    const [view, setView]                     = useState<View>('list');
    const [editingSkill, setEditingSkill]     = useState<{ name: string; content: string } | null>(null);
    const [isSaving, setIsSaving]             = useState(false);
    const [showGenerate, setShowGenerate]     = useState(false);
    const [saveMessage, setSaveMessage]       = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Auto-clear save message
    useEffect(() => {
        if (!saveMessage) return;
        const t = setTimeout(() => setSaveMessage(null), 3000);
        return () => clearTimeout(t);
    }, [saveMessage]);

    const handleNewSkill = useCallback(() => {
        setEditingSkill(null);
        setView('editor');
    }, []);

    const handleEditSkill = useCallback(async (name: string) => {
        // Fetch full content before opening editor
        try {
            const res = await fetch(
                `http://127.0.0.1:4243/api/skills/${name}`,
            ).catch(() => fetch(`http://localhost:4243/api/skills/${name}`));

            if (res.ok) {
                const skill = await res.json() as { name: string; content: string };
                setEditingSkill({ name: skill.name, content: skill.content });
            }
        } catch {
            // Fallback to empty template for the skill
            setEditingSkill({ name, content: '' });
        }
        setView('editor');
    }, []);

    const handleSaveSkill = useCallback(async (content: string) => {
        setIsSaving(true);
        try {
            if (editingSkill?.name) {
                const ok = await updateSkill(editingSkill.name, content);
                if (ok) {
                    setSaveMessage({ type: 'success', text: 'Skill updated successfully.' });
                    setView('list');
                } else {
                    setSaveMessage({ type: 'error', text: 'Failed to update skill.' });
                }
            } else {
                const created = await createSkill(content);
                if (created) {
                    setSaveMessage({ type: 'success', text: `Skill "${created.displayName}" created.` });
                    setView('list');
                } else {
                    setSaveMessage({ type: 'error', text: 'Failed to create skill.' });
                }
            }
        } finally {
            setIsSaving(false);
        }
    }, [editingSkill, createSkill, updateSkill]);

    const handleDeleteSkill = useCallback(async (name: string) => {
        const ok = await deleteSkill(name);
        if (ok) {
            setSaveMessage({ type: 'success', text: 'Skill deleted.' });
        }
    }, [deleteSkill]);

    const handleActivate = useCallback(async (name: string) => {
        await setActiveSkill(name);
    }, [setActiveSkill]);

    const handleDeactivate = useCallback(async () => {
        await setActiveSkill(null);
    }, [setActiveSkill]);

    const handleGenerate = useCallback(async (description: string) => {
        const content = await generateSkill(description);
        if (content) {
            setShowGenerate(false);
            // Open the editor pre-filled with generated content
            setEditingSkill(null); // new skill
            // We need to set the editor content — open editor with the generated content
            setEditingSkill({ name: '', content });
            setView('editor');
        }
    }, [generateSkill]);

    // ── Render ──────────────────────────────────────────────────

    if (view === 'editor') {
        return (
            <Container>
                <div className="mx-auto max-w-6xl px-4 py-8" style={{ height: 'calc(100vh - 4rem)' }}>
                    <SkillEditor
                        initialContent={editingSkill?.content ?? ''}
                        existingName={editingSkill?.name || undefined}
                        onSave={handleSaveSkill}
                        onCancel={() => setView('list')}
                        isSaving={isSaving}
                    />
                </div>
            </Container>
        );
    }

    return (
        <Container>
            <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
                {/* Header */}
                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Sparkles size={20} className="text-[var(--accent)]" />
                                    Skills
                                </CardTitle>
                                <CardDescription className="mt-1">
                                    Behavioral overlays that change how Aurelius responds.
                                    Inspired by{' '}
                                    <a
                                        href="https://github.com/anthropics/skills"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[var(--accent)] hover:underline"
                                    >
                                        Anthropic&apos;s SKILL.md format
                                    </a>
                                    . Only one skill can be active at a time.
                                </CardDescription>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setShowGenerate(true)}
                                    className="gap-2"
                                >
                                    <Sparkles size={14} />
                                    Generate
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleNewSkill}
                                    className="gap-2"
                                >
                                    <Plus size={14} />
                                    New Skill
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    {/* Active skill banner */}
                    {activeSkill && (
                        <CardContent className="pt-0">
                            <div className="rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                                    <span className="text-sm text-[var(--text-primary)] font-medium">
                                        Active skill: {activeSkill.icon} {activeSkill.displayName}
                                    </span>
                                </div>
                                <button
                                    onClick={handleDeactivate}
                                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1"
                                >
                                    <X size={12} />
                                    Deactivate
                                </button>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* Save message toast */}
                {saveMessage && (
                    <div
                        className={cn(
                            'rounded-[var(--radius-md)] border px-4 py-3 text-sm flex items-center gap-2',
                            saveMessage.type === 'success'
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                : 'border-red-500/30 bg-red-500/10 text-red-400',
                        )}
                    >
                        {saveMessage.type === 'success'
                            ? <Check size={14} />
                            : <X size={14} />
                        }
                        {saveMessage.text}
                    </div>
                )}

                {/* Skills list */}
                {isLoading ? (
                    <div className="flex flex-col items-center gap-4 py-20">
                        <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
                        <p className="text-sm text-[var(--text-muted)]">Loading skills…</p>
                    </div>
                ) : error ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <p className="text-sm text-red-400 mb-3">{error}</p>
                            <Button variant="outline" size="sm" onClick={refetch}>
                                Retry
                            </Button>
                        </CardContent>
                    </Card>
                ) : skills.length === 0 ? (
                    <EmptyState onAdd={handleNewSkill} onGenerate={() => setShowGenerate(true)} />
                ) : (
                    <div className="space-y-3">
                        {skills.map(skill => (
                            <SkillCard
                                key={skill.name}
                                skill={skill}
                                isActive={activeSkill?.name === skill.name}
                                onEdit={() => handleEditSkill(skill.name)}
                                onDelete={() => handleDeleteSkill(skill.name)}
                                onActivate={() => handleActivate(skill.name)}
                                onDeactivate={handleDeactivate}
                            />
                        ))}

                        {/* Footer stats */}
                        <div className="pt-2 flex items-center justify-center gap-6 text-xs text-[var(--text-muted)]">
                            <span>{skills.length} skill{skills.length !== 1 ? 's' : ''}</span>
                            <span>{skills.filter(s => s.isBuiltIn).length} built-in</span>
                            <span>{activeSkill ? '1 active' : 'none active'}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Generate modal */}
            {showGenerate && (
                <GenerateModal
                    onGenerate={handleGenerate}
                    onClose={() => setShowGenerate(false)}
                />
            )}
        </Container>
    );
}
