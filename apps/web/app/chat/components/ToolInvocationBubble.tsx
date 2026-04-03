'use client';

import { motion } from 'framer-motion';
import { cn, formatToolOutput, isFailedToolOutput } from '@/lib/utils';
import type { DynamicToolUIPart } from 'ai';
import {
    AlertTriangle,
    Zap,
    Check,
    X,
    Terminal,
    ChevronRight,
    AlertCircle,
    XCircle,
    Loader2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolMeta {
    displayName: string;
    description: string;
    permission: string;
}

interface ToolInvocationBubbleProps {
    part: DynamicToolUIPart | { type: string; toolCallId: string; state: string; input?: unknown; output?: unknown; errorText?: string; [k: string]: unknown };
    toolName: string;
    meta?: ToolMeta;
    onApprove: (toolCallId: string, toolName: string) => void;
    onReject: (toolCallId: string, toolName: string) => void;
}

// ── Level styling ─────────────────────────────────────────────────────────────

const LEVEL_CONFIG = {
    SAFE: {
        border:   'border-[var(--safe)]/40',
        bg:       'bg-[var(--safe-glow)]',
        iconBg:   'bg-[var(--safe)]/20',
        icon:     <Check size={16} className="text-[var(--safe)]" />,
        label:    'SAFE',
        labelCls: 'text-[var(--safe)]',
        btnCls:   'bg-[var(--safe)] hover:bg-[var(--safe)]/90',
    },
    SENSITIVE: {
        border:   'border-[var(--sensitive)]/40',
        bg:       'bg-[var(--sensitive-glow)]',
        iconBg:   'bg-[var(--sensitive)]/20',
        icon:     <Zap size={16} className="text-[var(--sensitive)]" />,
        label:    'SENSITIVE',
        labelCls: 'text-[var(--sensitive)]',
        btnCls:   'bg-[var(--sensitive)] hover:bg-[var(--sensitive)]/90',
    },
    DANGEROUS: {
        border:   'border-[var(--dangerous)]/40',
        bg:       'bg-[var(--dangerous-glow)]',
        iconBg:   'bg-[var(--dangerous)]/20',
        icon:     <AlertTriangle size={16} className="text-[var(--dangerous)]" />,
        label:    'DANGEROUS',
        labelCls: 'text-[var(--dangerous)]',
        btnCls:   'bg-[var(--dangerous)] hover:bg-[var(--dangerous)]/90',
    },
} as const;

export function formatToolName(name: string): string {
    return name
        .replace(/^mcp_[^_]+_/, '') // strip MCP server prefix
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Main component ────────────────────────────────────────────────────────────

export function ToolInvocationBubble({
    part,
    toolName,
    meta,
    onApprove,
    onReject,
}: ToolInvocationBubbleProps) {
    const displayName = meta?.displayName ?? formatToolName(toolName);
    const description = meta?.description ?? '';
    const permission  = (meta?.permission ?? 'SENSITIVE') as keyof typeof LEVEL_CONFIG;
    const cfg         = LEVEL_CONFIG[permission] ?? LEVEL_CONFIG.SENSITIVE;
    const approval =
        'approval' in part
        && typeof part.approval === 'object'
        && part.approval !== null
            ? (part.approval as { approved?: boolean })
            : null;

    // ── Streaming / loading ───────────────────────────────────────────────
    if (part.state === 'input-streaming') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--surface)] border border-[var(--border)]"
            >
                <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                <span className="text-xs text-[var(--text-muted)]">
                    Preparing <span className="font-medium">{displayName}</span>…
                </span>
            </motion.div>
        );
    }

    // ── SAFE tool executing server-side (input-available but no confirm needed) ──
    if (part.state === 'input-available' && permission === 'SAFE') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--safe-glow)] border border-[var(--safe)]/30"
            >
                <Loader2 size={14} className="animate-spin text-[var(--safe)]" />
                <span className="text-xs text-[var(--text-muted)]">
                    Running <span className="font-medium text-[var(--safe)]">{displayName}</span>…
                </span>
            </motion.div>
        );
    }

    // ── Approved / awaiting server execution ───────────────────────────
    if (part.state === 'approval-responded' && approval?.approved !== false) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl border',
                    cfg.bg,
                    cfg.border,
                )}
            >
                <Loader2 size={14} className={cn('animate-spin', cfg.labelCls)} />
                <span className="text-xs text-[var(--text-muted)]">
                    Approved <span className="font-medium">{displayName}</span>. Running…
                </span>
            </motion.div>
        );
    }

    // ── Output Error ──────────────────────────────────────────────────────
    if (part.state === 'output-error') {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30 max-w-full sm:max-w-[520px]"
            >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--dangerous)]/20 mt-0.5">
                    <AlertCircle size={11} className="text-[var(--dangerous)]" />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-[var(--dangerous)] font-medium">
                        {displayName} failed
                    </span>
                    <span className="text-xs text-[var(--text-muted)] break-all">
                        {part.errorText}
                    </span>
                </div>
            </motion.div>
        );
    }

    // ── Output Denied ─────────────────────────────────────────────────────
    if (
        part.state === 'output-denied'
        || (part.state === 'approval-responded' && approval?.approved === false)
    ) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
            >
                <div className="flex items-start gap-2.5 px-3.5 py-2 rounded-2xl bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30 max-w-full sm:max-w-[480px]">
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--dangerous)]/20 mt-0.5">
                        <XCircle size={11} className="text-[var(--dangerous)]" />
                    </div>
                    <span className="text-xs text-[var(--dangerous)] font-medium">
                        Rejected <span className="font-semibold">{displayName}</span>
                    </span>
                </div>
            </motion.div>
        );
    }

    // ── Output Available (completed) ──────────────────────────────────────
    if (part.state === 'output-available') {
        const failed = isFailedToolOutput(part.output);
        const result = formatToolOutput(part.output);

        if (failed) {
            return (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-2xl bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30 max-w-full sm:max-w-[520px]"
                >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--dangerous)]/20 mt-0.5">
                        <AlertCircle size={11} className="text-[var(--dangerous)]" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs text-[var(--dangerous)] font-medium">
                            {displayName} failed
                        </span>
                        <span className="text-xs text-[var(--text-muted)] break-all whitespace-pre-wrap">
                            {result}
                        </span>
                    </div>
                </motion.div>
            );
        }

        return (
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="flex justify-start"
            >
                <div
                    className="flex items-start gap-2 sm:gap-2.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl max-w-full sm:max-w-[480px] min-w-0 bg-[var(--safe-glow)] border border-[var(--safe)]/30"
                >
                    <div
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5 bg-[var(--safe)]/20"
                    >
                        <Check size={11} className="text-[var(--safe)]" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-[var(--safe)]">
                            Used <span className="font-semibold">{displayName}</span>
                        </span>
                        {result && result.length < 300 && (
                            <span className="text-xs text-[var(--text-muted)] break-all whitespace-pre-wrap">
                                {result}
                            </span>
                        )}
                    </div>
                </div>
            </motion.div>
        );
    }

    // ── Approval Requested (pending confirm) ─────────────────────────────
    const args = (part.input ?? {}) as Record<string, unknown>;
    const hasArgs = Object.keys(args).length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="flex justify-start"
        >
            <div
                className={cn(
                    'max-w-full sm:max-w-[520px] w-full rounded-2xl border p-3 sm:p-4 space-y-2 sm:space-y-3',
                    cfg.bg,
                    cfg.border,
                )}
            >
                {/* Header row */}
                <div className="flex items-center gap-2 sm:gap-3">
                    <div
                        className={cn(
                            'flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full',
                            cfg.iconBg,
                        )}
                    >
                        {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                            <p className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]">
                                {displayName}
                            </p>
                            <span
                                className={cn(
                                    'text-[9px] sm:text-[10px] font-bold uppercase tracking-widest px-1 sm:px-1.5 py-0.5 rounded-full border',
                                    cfg.labelCls,
                                    cfg.border,
                                )}
                            >
                                {cfg.label}
                            </span>
                        </div>
                        {description && (
                            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                {description}
                            </p>
                        )}
                    </div>
                </div>

                {/* Arguments preview */}
                {hasArgs && (
                    <div className="rounded-[var(--radius-md)] overflow-hidden border border-[var(--border)]">
                        <div className="flex items-center gap-2 bg-[var(--surface)] px-3 py-1.5 border-b border-[var(--border)]">
                            <Terminal size={11} className="text-[var(--text-muted)]" />
                            <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                                Arguments
                            </span>
                        </div>
                        <div className="bg-[#0f0f0f] px-3 py-2.5">
                            {Object.entries(args).map(([key, val]) => (
                                <div key={key} className="flex items-start gap-2 font-mono text-xs">
                                    <span className="text-[var(--accent)] shrink-0">{key}</span>
                                    <ChevronRight size={10} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                                    <span className="text-[var(--text-primary)] break-all">
                                        {typeof val === 'string' ? `"${val}"` : JSON.stringify(val)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-2 pt-1">
                    <button
                        onClick={() => onReject(part.toolCallId, toolName)}
                        className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-[var(--radius-md)] text-xs sm:text-sm font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--dangerous)]/60 hover:text-[var(--dangerous)] transition-all"
                    >
                        <X size={13} />
                        Reject
                    </button>
                    <button
                        onClick={() => onApprove(part.toolCallId, toolName)}
                        className={cn(
                            'flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-[var(--radius-md)] text-xs sm:text-sm font-medium text-white transition-all',
                            cfg.btnCls,
                        )}
                    >
                        <Check size={13} />
                        Approve
                    </button>
                    <p className="ml-auto text-[10px] text-[var(--text-muted)] hidden sm:block">
                        Waiting for your decision…
                    </p>
                </div>
            </div>
        </motion.div>
    );
}
