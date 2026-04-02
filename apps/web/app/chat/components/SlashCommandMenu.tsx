'use client';

import { useEffect, useRef, useMemo } from 'react';
import {
    Trash2,
    PlusCircle,
    Mic,
    Info,
    type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Command definition ────────────────────────────────────────────────────────

export interface SlashCommand {
    command: string;
    label: string;
    description: string;
    icon: LucideIcon;
    action: () => void;
}

interface SlashCommandMenuProps {
    filter: string;
    commands: SlashCommand[];
    onSelect: (cmd: SlashCommand) => void;
    /** Ref forwarded so the parent can drive arrow-key navigation */
    selectedIndex: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SlashCommandMenu({
    filter,
    commands,
    onSelect,
    selectedIndex,
}: SlashCommandMenuProps) {
    const listRef = useRef<HTMLDivElement>(null);

    const filtered = useMemo(() => {
        if (!filter) return commands;
        const lower = filter.toLowerCase();
        return commands.filter(
            (c) =>
                c.command.toLowerCase().includes(lower) ||
                c.label.toLowerCase().includes(lower),
        );
    }, [filter, commands]);

    // Scroll selected item into view
    useEffect(() => {
        const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    if (filtered.length === 0) return null;

    return (
        <div
            ref={listRef}
            className="absolute bottom-full left-0 right-0 mb-2 z-50 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl backdrop-blur-xl"
        >
            <div className="p-1.5">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    Commands
                </div>
                {filtered.map((cmd, i) => {
                    const Icon = cmd.icon;
                    const isSelected = i === selectedIndex;
                    return (
                        <button
                            key={cmd.command}
                            onClick={() => onSelect(cmd)}
                            onMouseDown={(e) => e.preventDefault()} // prevent textarea blur
                            className={cn(
                                'flex items-center gap-3 w-full px-2.5 py-2 rounded-lg text-left transition-colors',
                                isSelected
                                    ? 'bg-[var(--accent)]/15 text-[var(--text-primary)]'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]',
                            )}
                        >
                            <div
                                className={cn(
                                    'flex h-7 w-7 items-center justify-center rounded-md',
                                    isSelected
                                        ? 'bg-[var(--accent)]/20 text-[var(--accent)]'
                                        : 'bg-[var(--bg)]/50 text-[var(--text-muted)]',
                                )}
                            >
                                <Icon size={14} />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-medium">
                                    /{cmd.command}
                                </span>
                                <span className="text-[11px] text-[var(--text-muted)] truncate">
                                    {cmd.description}
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Default commands factory ──────────────────────────────────────────────────

export function buildDefaultCommands(actions: {
    clearMessages: () => void;
    createSession: () => void;
    toggleVoice: () => void;
    showModel: () => void;
}): SlashCommand[] {
    return [
        {
            command: 'clear',
            label: 'Clear chat',
            description: 'Clear all messages in the current session',
            icon: Trash2,
            action: actions.clearMessages,
        },
        {
            command: 'new',
            label: 'New session',
            description: 'Start a fresh conversation',
            icon: PlusCircle,
            action: actions.createSession,
        },
        {
            command: 'voice',
            label: 'Toggle voice',
            description: 'Switch between chat and voice mode',
            icon: Mic,
            action: actions.toggleVoice,
        },
        {
            command: 'model',
            label: 'Model info',
            description: 'Show the currently active model',
            icon: Info,
            action: actions.showModel,
        },
    ];
}
