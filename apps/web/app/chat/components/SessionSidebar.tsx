'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MessageSquare, Trash2, Pencil, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatSession } from '@/lib/db';

// ============================================================
// Helpers
// ============================================================

function formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60_000);
    const hours   = Math.floor(diff / 3_600_000);
    const days    = Math.floor(diff / 86_400_000);

    if (minutes < 1)  return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours   < 24) return `${hours}h ago`;
    if (days    < 7)  return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ============================================================
// Types
// ============================================================

interface SessionSidebarProps {
    sessions:        ChatSession[];
    activeSessionId: string | null;
    onSelect:        (id: string) => void;
    onCreate:        () => Promise<string> | void;
    onDelete:        (id: string) => Promise<void>;
    onRename:        (id: string, title: string) => Promise<void>;
    className?:      string;
}

// ============================================================
// SessionRow
// ============================================================

interface SessionRowProps {
    session:  ChatSession;
    isActive: boolean;
    onSelect: () => void;
    onDelete: () => Promise<void>;
    onRename: (title: string) => Promise<void>;
}

function SessionRow({ session, isActive, onSelect, onDelete, onRename }: SessionRowProps) {
    const [isEditing,   setIsEditing]   = useState(false);
    const [editValue,   setEditValue]   = useState(session.title);
    const [isHovered,   setIsHovered]   = useState(false);
    const [isDeleting,  setIsDeleting]  = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Keep edit value in sync if title changes externally (e.g. auto-title)
    useEffect(() => {
        if (!isEditing) setEditValue(session.title);
    }, [session.title, isEditing]);

    // Focus input when editing starts
    useEffect(() => {
        if (isEditing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [isEditing]);

    const startEdit = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setEditValue(session.title);
        setIsEditing(true);
    }, [session.title]);

    const commitEdit = useCallback(async () => {
        const trimmed = editValue.trim();
        if (trimmed && trimmed !== session.title) {
            await onRename(trimmed);
        }
        setIsEditing(false);
    }, [editValue, session.title, onRename]);

    const cancelEdit = useCallback(() => {
        setEditValue(session.title);
        setIsEditing(false);
    }, [session.title]);

    const handleKeyDown = useCallback(
        async (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter')  { e.preventDefault(); await commitEdit(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        },
        [commitEdit, cancelEdit],
    );

    const handleDelete = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation();
            setIsDeleting(true);
            try {
                await onDelete();
            } finally {
                setIsDeleting(false);
            }
        },
        [onDelete],
    );

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8, transition: { duration: 0.15 } }}
            transition={{ duration: 0.18 }}
            className={cn(
                'group relative flex items-start gap-2 rounded-[var(--radius-md)] px-3 py-2.5 cursor-pointer transition-colors',
                isActive
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]',
            )}
            onClick={() => !isEditing && onSelect()}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Icon */}
            <MessageSquare
                size={14}
                className={cn(
                    'mt-0.5 shrink-0',
                    isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]',
                )}
            />

            {/* Title / Edit input */}
            <div className="flex-1 min-w-0">
                {isEditing ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                            ref={inputRef}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={commitEdit}
                            className="w-full min-w-0 bg-[var(--surface)] border border-[var(--accent)] rounded px-1.5 py-0.5 text-xs text-[var(--text-primary)] outline-none"
                            maxLength={80}
                        />
                        <button
                            onMouseDown={(e) => { e.preventDefault(); void commitEdit(); }}
                            className="shrink-0 text-[var(--safe)] hover:opacity-80"
                        >
                            <Check size={12} />
                        </button>
                        <button
                            onMouseDown={(e) => { e.preventDefault(); cancelEdit(); }}
                            className="shrink-0 text-[var(--text-muted)] hover:opacity-80"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <>
                        <p className="text-xs font-medium leading-snug truncate">
                            {session.title}
                        </p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                            {formatRelativeTime(session.updatedAt)}
                        </p>
                    </>
                )}
            </div>

            {/* Action buttons (visible on hover for non-editing rows) */}
            {!isEditing && (isHovered || isActive) && (
                <div
                    className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={startEdit}
                        title="Rename"
                        className="p-1 rounded hover:bg-[var(--surface-hover,var(--surface))] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <Pencil size={11} />
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={isDeleting}
                        title="Delete"
                        className="p-1 rounded hover:bg-[var(--dangerous-glow,#ff000020)] text-[var(--text-muted)] hover:text-[var(--dangerous)] transition-colors disabled:opacity-50"
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
            )}
        </motion.div>
    );
}

// ============================================================
// SessionSidebar
// ============================================================

export function SessionSidebar({
    sessions,
    activeSessionId,
    onSelect,
    onCreate,
    onDelete,
    onRename,
    className,
}: SessionSidebarProps) {
    const [isCreating, setIsCreating] = useState(false);

    const handleCreate = useCallback(async () => {
        setIsCreating(true);
        try {
            await onCreate();
        } finally {
            setIsCreating(false);
        }
    }, [onCreate]);

    return (
        <aside
            className={cn(
                'flex flex-col w-52 shrink-0 border-r border-[var(--border)] bg-[var(--background)] h-full overflow-hidden',
                className,
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Chats
                </span>
                <button
                    onClick={handleCreate}
                    disabled={isCreating}
                    title="New Chat"
                    className={cn(
                        'flex items-center justify-center w-6 h-6 rounded-[var(--radius-sm)] transition-colors',
                        'bg-[var(--accent-muted)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Session list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center px-2">
                        <MessageSquare size={24} className="text-[var(--text-muted)] mb-2" />
                        <p className="text-xs text-[var(--text-muted)]">No conversations yet</p>
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {sessions.map((session) => (
                            <SessionRow
                                key={session.id}
                                session={session}
                                isActive={session.id === activeSessionId}
                                onSelect={() => onSelect(session.id)}
                                onDelete={() => onDelete(session.id)}
                                onRename={(title) => onRename(session.id, title)}
                            />
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-[var(--border)]">
                <p className="text-[10px] text-[var(--text-muted)] text-center">
                    {sessions.length} {sessions.length === 1 ? 'conversation' : 'conversations'}
                </p>
            </div>
        </aside>
    );
}
