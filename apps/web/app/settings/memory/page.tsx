'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useMemories } from '@/hooks/useMemories';
import type { MemoryEntry, MemorySearchResult } from '@/hooks/useMemories';
import { Container } from '@/components/layout';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Button, Input,
} from '@/components/ui';
import {
    Brain,
    Search,
    Trash2,
    RefreshCw,
    Loader2,
    Sparkles,
    Clock,
    Info,
    Star,
    CheckSquare,
    StickyNote,
    User,
    X,
    Plus,
    Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// Helpers
// ============================================================

function relativeTime(ts: number): string {
    const diff = Date.now() - ts;
    const minutes = Math.floor(diff / 60_000);
    const hours   = Math.floor(diff / 3_600_000);
    const days    = Math.floor(diff / 86_400_000);
    if (minutes < 1)  return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours   < 24) return `${hours}h ago`;
    if (days    < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString();
}

function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

// ============================================================
// Type config
// ============================================================

const TYPE_CONFIG = {
    fact:         { label: 'Fact',       Icon: User,        color: 'text-[var(--accent)]',             bg: 'bg-[var(--accent-muted)]'    },
    preference:   { label: 'Preference', Icon: Star,        color: 'text-[var(--safe)]',               bg: 'bg-[var(--safe-glow)]'       },
    task:         { label: 'Task',       Icon: CheckSquare, color: 'text-[var(--sensitive)]',          bg: 'bg-[var(--sensitive-glow)]'  },
    note:         { label: 'Note',       Icon: StickyNote,  color: 'text-[var(--text-muted)]',         bg: 'bg-[var(--surface)]'         },
    conversation: { label: 'Context',    Icon: Brain,       color: 'text-[var(--text-secondary)]',     bg: 'bg-[var(--surface)]'         },
} as const;

const LIFECYCLE_CONFIG = {
    long_term:  { label: 'Long-term',  color: 'text-[var(--safe)]',        bg: 'bg-[var(--safe-glow)]'      },
    short_term: { label: 'Short-term', color: 'text-[var(--text-muted)]',  bg: 'bg-[var(--surface)]'        },
    ephemeral:  { label: 'Ephemeral',  color: 'text-[var(--sensitive)]',   bg: 'bg-[var(--sensitive-glow)]' },
    archived:   { label: 'Archived',   color: 'text-[var(--text-muted)]',  bg: 'bg-[var(--surface)]'        },
} as const;

// ============================================================
// Memory Card
// ============================================================

function MemoryCard({
    entry,
    similarity,
    onDelete,
    isDeleting,
}: {
    entry: MemoryEntry;
    similarity?: number;
    onDelete: (id: string) => void;
    isDeleting: boolean;
}) {
    const typeConf      = TYPE_CONFIG[entry.type]           ?? TYPE_CONFIG.note;
    const lifecycleConf = LIFECYCLE_CONFIG[entry.lifecycle] ?? LIFECYCLE_CONFIG.short_term;
    const TypeIcon      = typeConf.Icon;
    const isAutoExtracted = entry.metadata?.source === 'auto_extracted';

    return (
        <div className={cn(
            'group relative flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-200',
            'hover:border-[var(--accent)]/30 hover:bg-[var(--surface-hover)]',
            isDeleting && 'opacity-40 pointer-events-none',
        )}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Type badge */}
                    <span className={cn(
                        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                        typeConf.bg, typeConf.color,
                    )}>
                        <TypeIcon size={11} />
                        {typeConf.label}
                    </span>

                    {/* Lifecycle badge */}
                    <span className={cn(
                        'rounded-full px-2.5 py-1 text-[11px] font-medium',
                        lifecycleConf.bg, lifecycleConf.color,
                    )}>
                        {lifecycleConf.label}
                    </span>

                    {/* Source badge */}
                    {isAutoExtracted ? (
                        <span className="flex items-center gap-1 rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                            <Sparkles size={10} />
                            Auto
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 rounded-full bg-[var(--surface)] border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)]">
                            Manual
                        </span>
                    )}

                    {/* Similarity score (search results only) */}
                    {similarity !== undefined && (
                        <span className="rounded-full bg-[var(--accent-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent)]">
                            {Math.round(similarity * 100)}% match
                        </span>
                    )}
                </div>

                {/* Delete button */}
                <button
                    onClick={() => onDelete(entry.id)}
                    disabled={isDeleting}
                    className="shrink-0 opacity-0 group-hover:opacity-100 rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--dangerous)]/10 hover:text-[var(--dangerous)] transition-all"
                    aria-label="Delete memory"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Content */}
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                {entry.content}
            </p>

            {/* Footer */}
            <div className="flex items-center gap-4 text-[11px] text-[var(--text-muted)]">
                <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {formatDate(entry.createdAt)}
                </span>
                {entry.accessCount > 0 && (
                    <span className="flex items-center gap-1">
                        <Zap size={10} />
                        Recalled {entry.accessCount}&times;
                    </span>
                )}
                {entry.lastAccessedAt && (
                    <span>Last used {relativeTime(entry.lastAccessedAt)}</span>
                )}
            </div>
        </div>
    );
}

// ============================================================
// Stat Card
// ============================================================

function StatCard({ label, value, icon: Icon, color }: {
    label: string;
    value: number;
    icon: React.ElementType;
    color: string;
}) {
    return (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className={cn('flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider', color)}>
                <Icon size={12} />
                {label}
            </div>
            <p className="text-2xl font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
        </div>
    );
}

// ============================================================
// Page
// ============================================================

export default function MemoryPage() {
    const {
        memories,
        isLoading,
        error,
        fetchMemories,
        createMemory,
        searchMemories,
        deleteMemory,
        cleanupExpired,
    } = useMemories();

    const [searchQuery, setSearchQuery]     = useState('');
    const [searchResults, setSearchResults] = useState<MemorySearchResult[] | null>(null);
    const [isSearching, setIsSearching]     = useState(false);
    const [deletingIds, setDeletingIds]     = useState<Set<string>>(new Set());
    const [isCleaningUp, setIsCleaningUp]   = useState(false);
    const [cleanupMsg, setCleanupMsg]       = useState<string | null>(null);
    const [showAddForm, setShowAddForm]     = useState(false);
    const [newContent, setNewContent]       = useState('');
    const [newType, setNewType]             = useState<MemoryEntry['type']>('note');
    const [isAdding, setIsAdding]           = useState(false);
    const searchDebounceRef                 = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Debounced search ─────────────────────────────────────
    useEffect(() => {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

        searchDebounceRef.current = setTimeout(async () => {
            if (!searchQuery.trim()) {
                setSearchResults(null);
                return;
            }
            setIsSearching(true);
            const results = await searchMemories(searchQuery, 20);
            setSearchResults(results);
            setIsSearching(false);
        }, 400);

        return () => {
            if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        };
    }, [searchQuery, searchMemories]);

    // ── Delete handler ───────────────────────────────────────
    const handleDelete = useCallback(async (id: string) => {
        setDeletingIds(prev => new Set(prev).add(id));
        await deleteMemory(id);
        setDeletingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
        setSearchResults(prev => prev ? prev.filter(r => r.entry.id !== id) : null);
    }, [deleteMemory]);

    // ── Cleanup handler ──────────────────────────────────────
    const handleCleanup = useCallback(async () => {
        setIsCleaningUp(true);
        setCleanupMsg(null);
        const removed = await cleanupExpired();
        setCleanupMsg(removed > 0
            ? `Removed ${removed} expired memory${removed !== 1 ? 's' : ''}`
            : 'No expired memories found');
        setIsCleaningUp(false);
        setTimeout(() => setCleanupMsg(null), 3000);
    }, [cleanupExpired]);

    // ── Add handler ──────────────────────────────────────────
    const handleAdd = useCallback(async () => {
        if (!newContent.trim()) return;
        setIsAdding(true);
        await createMemory(newContent.trim(), newType, 'long_term');
        setNewContent('');
        setShowAddForm(false);
        setIsAdding(false);
    }, [newContent, newType, createMemory]);

    // ── Stats ────────────────────────────────────────────────
    const stats = {
        total:      memories.length,
        fact:       memories.filter(m => m.type === 'fact').length,
        preference: memories.filter(m => m.type === 'preference').length,
        task:       memories.filter(m => m.type === 'task').length,
        note:       memories.filter(m => m.type === 'note').length,
        long_term:  memories.filter(m => m.lifecycle === 'long_term').length,
        short_term: memories.filter(m => m.lifecycle === 'short_term').length,
    };

    const displayMemories = searchResults
        ? searchResults.map(r => ({ entry: r.entry, similarity: r.similarity }))
        : memories.map(m => ({ entry: m, similarity: undefined }));

    // ── Loading state ────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                    <p className="text-sm text-[var(--text-muted)]">Loading memories&hellip;</p>
                </div>
            </div>
        );
    }

    // ── Error state ──────────────────────────────────────────
    if (error) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Card className="max-w-md text-center">
                    <CardContent className="py-12 px-8">
                        <Info size={48} className="text-[var(--dangerous)] mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Cannot Load Memories</h2>
                        <p className="text-[var(--text-secondary)] text-sm mb-4">{error}</p>
                        <Button onClick={() => void fetchMemories()}>Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto py-8">
            <Container>

                {/* ── Header ─────────────────────────────── */}
                <div className="mb-8">
                    <p className="text-sm text-[var(--text-muted)]">Pages / Settings / Memory</p>
                    <div className="flex items-center justify-between mt-1 flex-wrap gap-3">
                        <div className="flex items-center gap-3">
                            <Brain size={28} className="text-[var(--accent)]" />
                            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Memory</h1>
                            <span className="text-sm text-[var(--text-muted)] mt-1">
                                {stats.total} {stats.total === 1 ? 'memory' : 'memories'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            {cleanupMsg && (
                                <span className="text-xs text-[var(--safe)] bg-[var(--safe-glow)] px-3 py-1.5 rounded-full">
                                    {cleanupMsg}
                                </span>
                            )}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCleanup}
                                disabled={isCleaningUp}
                                className="gap-2"
                            >
                                {isCleaningUp
                                    ? <Loader2 size={14} className="animate-spin" />
                                    : <X size={14} />}
                                Cleanup Expired
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => void fetchMemories()}
                                className="gap-2"
                            >
                                <RefreshCw size={14} />
                                Refresh
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setShowAddForm(v => !v)}
                                className="gap-2"
                            >
                                <Plus size={14} />
                                Add Memory
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ── Add Form ───────────────────────────── */}
                {showAddForm && (
                    <section className="mb-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Plus size={16} className="text-[var(--accent)]" />
                                    Add Memory Manually
                                </CardTitle>
                                <CardDescription>
                                    You can also just tell the AI &ldquo;remember this&rdquo; during a chat and it will save automatically.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-[var(--text-secondary)]">Content</label>
                                    <textarea
                                        value={newContent}
                                        onChange={e => setNewContent(e.target.value)}
                                        rows={3}
                                        placeholder="e.g. I prefer TypeScript with strict mode over plain JavaScript"
                                        className="w-full rounded-[var(--radius-md)] px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] resize-none text-sm"
                                    />
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-medium text-[var(--text-secondary)]">Type</label>
                                        <div className="flex gap-1.5">
                                            {(['fact', 'preference', 'task', 'note'] as const).map(t => {
                                                const conf = TYPE_CONFIG[t];
                                                return (
                                                    <button
                                                        key={t}
                                                        onClick={() => setNewType(t)}
                                                        className={cn(
                                                            'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                                                            newType === t
                                                                ? `${conf.bg} ${conf.color} border-transparent`
                                                                : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--accent)]/40',
                                                        )}
                                                    >
                                                        {conf.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="flex items-end gap-2 ml-auto">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => { setShowAddForm(false); setNewContent(''); }}
                                        >
                                            Cancel
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={handleAdd}
                                            disabled={isAdding || !newContent.trim()}
                                            className="gap-2"
                                        >
                                            {isAdding
                                                ? <Loader2 size={13} className="animate-spin" />
                                                : <Plus size={13} />}
                                            Save Memory
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </section>
                )}

                {/* ── Stats ──────────────────────────────── */}
                <section className="mb-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <StatCard label="Facts"       value={stats.fact}       icon={User}        color="text-[var(--accent)]"         />
                        <StatCard label="Preferences" value={stats.preference} icon={Star}        color="text-[var(--safe)]"           />
                        <StatCard label="Tasks"       value={stats.task}       icon={CheckSquare} color="text-[var(--sensitive)]"      />
                        <StatCard label="Notes"       value={stats.note}       icon={StickyNote}  color="text-[var(--text-muted)]"     />
                        <StatCard label="Long-term"   value={stats.long_term}  icon={Brain}       color="text-[var(--safe)]"           />
                        <StatCard label="Short-term"  value={stats.short_term} icon={Clock}       color="text-[var(--text-secondary)]" />
                    </div>
                </section>

                {/* ── Search ─────────────────────────────── */}
                <section className="mb-6">
                    <div className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                        <Input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search memories semantically&hellip;"
                            className="pl-10 pr-10"
                        />
                        {isSearching && (
                            <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-[var(--accent)]" />
                        )}
                        {searchQuery && !isSearching && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    {searchResults !== null && (
                        <p className="mt-2 text-xs text-[var(--text-muted)]">
                            {searchResults.length === 0
                                ? 'No matching memories found'
                                : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${searchQuery}"`}
                        </p>
                    )}
                </section>

                {/* ── Memory List ────────────────────────── */}
                <section>
                    {displayMemories.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-muted)]">
                                <Brain size={28} className="text-[var(--accent)]" />
                            </div>
                            <div className="text-center">
                                <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                                    {searchResults !== null ? 'No results found' : 'No memories yet'}
                                </h3>
                                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-sm">
                                    {searchResults !== null
                                        ? 'Try a different search query.'
                                        : 'Tell the AI to remember something during a chat and it will appear here automatically.'}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {displayMemories.map(({ entry, similarity }) => (
                                <MemoryCard
                                    key={entry.id}
                                    entry={entry}
                                    similarity={similarity}
                                    onDelete={handleDelete}
                                    isDeleting={deletingIds.has(entry.id)}
                                />
                            ))}
                        </div>
                    )}
                </section>

            </Container>
        </div>
    );
}
