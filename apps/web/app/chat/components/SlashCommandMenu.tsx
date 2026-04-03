'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
    Activity,
    CheckCircle2,
    HelpCircle,
    History,
    Info,
    Mic,
    PlusCircle,
    Trash2,
    X,
    type LucideIcon,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type SlashCommandCategory = 'Session' | 'Context' | 'Utility';
export type SlashCommandResultTone = 'info' | 'success' | 'warning' | 'error';

export interface SlashCommandResult {
    command: string;
    tone: SlashCommandResultTone;
    title: string;
    detail?: string;
    items?: string[];
}

export interface SlashCommandExecution {
    result?: SlashCommandResult;
    nextInput?: string;
}

export interface SlashCommandContext {
    sessionTitle?: string;
    sessionCount: number;
    recentSessionTitles: string[];
    messageCount: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    providerLabel: string;
    modelLabel?: string;
    contextLimit?: number;
    isVoiceConnected: boolean;
    isRecording: boolean;
    voiceUnavailableReason?: string;
    clearMessages: () => void;
    createSession: (title?: string) => Promise<string>;
    toggleVoice: () => void;
}

export interface SlashCommand {
    command: string;
    label: string;
    description: string;
    category: SlashCommandCategory;
    icon: LucideIcon;
    keywords?: string[];
    execute: () => Promise<SlashCommandExecution | void> | SlashCommandExecution | void;
}

interface SlashCommandMenuProps {
    query: string;
    commands: SlashCommand[];
    onSelect: (cmd: SlashCommand) => void | Promise<void>;
    selectedIndex: number;
}

const RESULT_TONE_STYLES: Record<
    SlashCommandResultTone,
    {
        Icon: LucideIcon;
        wrapper: string;
        iconWrap: string;
        iconCls: string;
        badge: string;
        bullet: string;
    }
> = {
    info: {
        Icon: Info,
        wrapper: 'bg-[var(--glass-bg-strong)]/95 border-[var(--border)]',
        iconWrap: 'bg-[var(--accent)]/10 border border-[var(--accent)]/20',
        iconCls: 'text-[var(--accent)]',
        badge: 'border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent-secondary)]',
        bullet: 'bg-[var(--accent)]/70',
    },
    success: {
        Icon: CheckCircle2,
        wrapper: 'bg-[var(--glass-bg-strong)]/95 border-[var(--safe)]/20',
        iconWrap: 'bg-[var(--safe)]/10 border border-[var(--safe)]/20',
        iconCls: 'text-[var(--safe)]',
        badge: 'border-[var(--safe)]/25 bg-[var(--safe)]/10 text-[var(--safe)]',
        bullet: 'bg-[var(--safe)]',
    },
    warning: {
        Icon: Info,
        wrapper: 'bg-[var(--glass-bg-strong)]/95 border-[var(--sensitive)]/20',
        iconWrap: 'bg-[var(--sensitive)]/10 border border-[var(--sensitive)]/20',
        iconCls: 'text-[var(--sensitive)]',
        badge: 'border-[var(--sensitive)]/25 bg-[var(--sensitive)]/10 text-[var(--sensitive)]',
        bullet: 'bg-[var(--sensitive)]',
    },
    error: {
        Icon: X,
        wrapper: 'bg-[var(--glass-bg-strong)]/95 border-[var(--dangerous)]/20',
        iconWrap: 'bg-[var(--dangerous)]/10 border border-[var(--dangerous)]/20',
        iconCls: 'text-[var(--dangerous)]',
        badge: 'border-[var(--dangerous)]/25 bg-[var(--dangerous)]/10 text-[var(--dangerous)]',
        bullet: 'bg-[var(--dangerous)]',
    },
};

export function filterSlashCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
    const lower = filter.trim().toLowerCase();

    if (!lower) {
        return commands;
    }

    return commands.filter((cmd) => {
        const haystack = [
            cmd.command,
            cmd.label,
            cmd.description,
            cmd.category,
            ...(cmd.keywords ?? []),
        ];

        return haystack.some((value) => value.toLowerCase().includes(lower));
    });
}

export function SlashCommandMenu({
    query,
    commands,
    onSelect,
    selectedIndex,
}: SlashCommandMenuProps) {
    const listRef = useRef<HTMLDivElement>(null);

    const groupedCommands = useMemo(() => {
        const sections: Array<{
            category: SlashCommandCategory;
            items: Array<{ command: SlashCommand; index: number }>;
        }> = [];

        commands.forEach((command, index) => {
            const lastSection = sections[sections.length - 1];

            if (!lastSection || lastSection.category !== command.category) {
                sections.push({
                    category: command.category,
                    items: [{ command, index }],
                });
                return;
            }

            lastSection.items.push({ command, index });
        });

        return sections;
    }, [commands]);

    useEffect(() => {
        const el = listRef.current?.querySelector<HTMLElement>(`[data-command-index="${selectedIndex}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, commands.length]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="overflow-hidden rounded-2xl border border-white/8 bg-[var(--glass-bg-strong)]/95 shadow-2xl backdrop-blur-xl"
        >
            <div className="flex items-center justify-between gap-3 border-b border-white/8 px-3 py-2.5">
                <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-secondary)]">
                        Slash Commands
                    </p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                        {query ? `Results for /${query}` : 'Quick actions for the current chat'}
                    </p>
                </div>
                <div className="hidden shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-muted)] sm:flex">
                    <span>Enter run</span>
                    <span className="opacity-40">•</span>
                    <span>Esc close</span>
                </div>
            </div>

            {commands.length === 0 ? (
                <div className="px-4 py-5">
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                        No command found
                    </p>
                    <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">
                        Try `/help`, `/new`, or a shorter search term.
                    </p>
                </div>
            ) : (
                <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
                    {groupedCommands.map((section) => (
                        <div key={section.category} className="mb-2 last:mb-0">
                            <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-muted)]">
                                {section.category}
                            </div>

                            <div className="space-y-1">
                                {section.items.map(({ command, index }) => {
                                    const Icon = command.icon;
                                    const isSelected = index === selectedIndex;

                                    return (
                                        <button
                                            key={command.command}
                                            type="button"
                                            data-command-index={index}
                                            onClick={() => onSelect(command)}
                                            onMouseDown={(e) => e.preventDefault()}
                                            className={cn(
                                                'flex w-full items-start gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-all duration-150',
                                                isSelected
                                                    ? 'border-[var(--accent)]/30 bg-[var(--accent)]/12 text-[var(--text-primary)]'
                                                    : 'border-transparent bg-white/[0.02] text-[var(--text-secondary)] hover:border-white/8 hover:bg-white/[0.05]',
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border',
                                                    isSelected
                                                        ? 'border-[var(--accent)]/25 bg-[var(--accent)]/15 text-[var(--accent)]'
                                                        : 'border-white/8 bg-black/20 text-[var(--text-muted)]',
                                                )}
                                            >
                                                <Icon size={17} />
                                            </div>

                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                                                        {command.label}
                                                    </span>
                                                    <span className="rounded-full border border-white/8 bg-black/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-muted)]">
                                                        /{command.command}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                                                    {command.description}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}

export function SlashCommandResultCard({
    result,
    onDismiss,
}: {
    result: SlashCommandResult;
    onDismiss: () => void;
}) {
    const tone = RESULT_TONE_STYLES[result.tone];
    const ToneIcon = tone.Icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn('rounded-2xl border shadow-2xl backdrop-blur-xl', tone.wrapper)}
        >
            <div className="flex items-start gap-3 p-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl', tone.iconWrap)}>
                    <ToneIcon size={18} className={tone.iconCls} />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]', tone.badge)}>
                            /{result.command}
                        </span>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {result.title}
                        </p>
                    </div>

                    {result.detail && (
                        <p className="mt-1 text-xs leading-6 text-[var(--text-secondary)]">
                            {result.detail}
                        </p>
                    )}

                    {result.items && result.items.length > 0 && (
                        <ul className="mt-2.5 space-y-1.5">
                            {result.items.map((item) => (
                                <li key={item} className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                                    <span className={cn('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', tone.bullet)} />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <button
                    type="button"
                    onClick={onDismiss}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-white/6 hover:text-[var(--text-primary)]"
                    aria-label="Dismiss slash command result"
                    title="Dismiss"
                >
                    <X size={14} />
                </button>
            </div>
        </motion.div>
    );
}

export function buildDefaultCommands(context: SlashCommandContext): SlashCommand[] {
    const sessionTitle = context.sessionTitle?.trim() || 'Current session';
    const providerLabel = context.providerLabel || 'unknown';
    const modelLabel = context.modelLabel || 'Not configured';
    const sessionCountLabel = `${context.sessionCount} session${context.sessionCount === 1 ? '' : 's'}`;
    const messageCountLabel = `${context.messageCount} message${context.messageCount === 1 ? '' : 's'}`;
    const totalTokensLabel = `${context.totalTokens.toLocaleString()} total tokens`;

    return [
        {
            command: 'new',
            label: 'New session',
            description: 'Start a fresh conversation thread',
            category: 'Session',
            icon: PlusCircle,
            keywords: ['chat', 'conversation', 'thread'],
            execute: async () => {
                await context.createSession();

                return {
                    result: {
                        command: 'new',
                        tone: 'success',
                        title: 'Started a fresh session',
                        detail: `Created a new conversation. You now have ${context.sessionCount + 1} sessions.`,
                    },
                };
            },
        },
        {
            command: 'clear',
            label: 'Clear messages',
            description: 'Remove all messages from the current session',
            category: 'Session',
            icon: Trash2,
            keywords: ['reset', 'erase', 'wipe'],
            execute: () => {
                if (context.messageCount === 0) {
                    return {
                        result: {
                            command: 'clear',
                            tone: 'info',
                            title: 'Nothing to clear',
                            detail: `${sessionTitle} does not have any messages yet.`,
                        },
                    };
                }

                context.clearMessages();

                return {
                    result: {
                        command: 'clear',
                        tone: 'success',
                        title: 'Chat cleared',
                        detail: `Removed ${messageCountLabel} from ${sessionTitle}.`,
                    },
                };
            },
        },
        {
            command: 'sessions',
            label: 'Session overview',
            description: 'See recent sessions and the active thread',
            category: 'Session',
            icon: History,
            keywords: ['history', 'recent', 'threads'],
            execute: () => ({
                result: {
                    command: 'sessions',
                    tone: 'info',
                    title: 'Session overview',
                    detail: `You currently have ${sessionCountLabel}.`,
                    items: [
                        `Active: ${sessionTitle}`,
                        ...context.recentSessionTitles.slice(0, 3).map((title, index) => `${index + 1}. ${title}`),
                    ],
                },
            }),
        },
        {
            command: 'status',
            label: 'Current status',
            description: 'Show the active session and token usage',
            category: 'Context',
            icon: Activity,
            keywords: ['usage', 'tokens', 'context'],
            execute: () => ({
                result: {
                    command: 'status',
                    tone: 'info',
                    title: 'Current chat status',
                    detail: `${sessionTitle} is active.`,
                    items: [
                        messageCountLabel,
                        totalTokensLabel,
                        `Prompt tokens: ${context.promptTokens.toLocaleString()}`,
                        `Completion tokens: ${context.completionTokens.toLocaleString()}`,
                    ],
                },
            }),
        },
        {
            command: 'model',
            label: 'Model info',
            description: 'Show the currently active provider and model',
            category: 'Context',
            icon: Info,
            keywords: ['provider', 'llm'],
            execute: () => ({
                result: {
                    command: 'model',
                    tone: 'info',
                    title: 'Active model',
                    detail: `${providerLabel}: ${modelLabel}`,
                    items: context.contextLimit
                        ? [`Context window: ${context.contextLimit.toLocaleString()} tokens`]
                        : undefined,
                },
            }),
        },
        {
            command: 'voice',
            label: context.isRecording ? 'Stop recording' : 'Start recording',
            description: 'Toggle voice recording for this chat',
            category: 'Utility',
            icon: Mic,
            keywords: ['record', 'audio', 'microphone'],
            execute: () => {
                if (!context.isVoiceConnected) {
                    return {
                        result: {
                            command: 'voice',
                            tone: 'error',
                            title: 'Voice is unavailable',
                            detail: context.voiceUnavailableReason || 'Audio runtime is not connected.',
                        },
                    };
                }

                context.toggleVoice();

                return {
                    result: {
                        command: 'voice',
                        tone: 'success',
                        title: context.isRecording ? 'Recording stopped' : 'Recording started',
                        detail: context.isRecording
                            ? 'Voice capture has been paused.'
                            : 'Listening for your next spoken request.',
                    },
                };
            },
        },
        {
            command: 'help',
            label: 'Slash command help',
            description: 'Review the available quick actions',
            category: 'Utility',
            icon: HelpCircle,
            keywords: ['commands', 'shortcuts', 'guide'],
            execute: () => ({
                result: {
                    command: 'help',
                    tone: 'info',
                    title: 'Available slash commands',
                    detail: 'Use slash commands for quick chat and session actions without leaving the composer.',
                    items: [
                        '/new — start a fresh conversation',
                        '/clear — remove messages from the current session',
                        '/sessions — inspect recent chat threads',
                        '/status — check the active session and token usage',
                        '/model — show the current provider and model',
                        '/voice — toggle recording when audio is available',
                    ],
                },
            }),
        },
    ];
}
