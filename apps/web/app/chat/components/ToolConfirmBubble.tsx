'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ToolConfirmMessage, ToolAutoMessage } from '@/hooks/useChat';
import {
    AlertTriangle,
    Zap,
    Check,
    X,
    Terminal,
    ChevronRight,
    CheckCircle,
    XCircle,
} from 'lucide-react';

// ============================================================
// Tool Confirm Bubble
// ============================================================

interface ToolConfirmBubbleProps {
    message: ToolConfirmMessage;
    onApprove: () => void;
    onReject: () => void;
}

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
};

export function ToolConfirmBubble({ message, onApprove, onReject }: ToolConfirmBubbleProps) {
    const cfg    = LEVEL_CONFIG[message.permissionLevel];
    const isPending  = message.status === 'pending';
    const isApproved = message.status === 'approved';

    const hasArgs = Object.keys(message.args).length > 0;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="flex justify-start"
        >
            <div className={cn(
                'max-w-[520px] w-full rounded-2xl border p-4 space-y-3',
                cfg.bg,
                cfg.border,
            )}>

                {/* Header row */}
                <div className="flex items-center gap-3">
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', cfg.iconBg)}>
                        {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                                {message.displayName}
                            </p>
                            <span className={cn('text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border', cfg.labelCls, cfg.border)}>
                                {cfg.label}
                            </span>
                        </div>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                            {message.description}
                        </p>
                    </div>

                    {/* Status badge when resolved */}
                    {!isPending && (
                        <div className={cn(
                            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
                            isApproved
                                ? 'bg-[var(--safe-glow)] text-[var(--safe)]'
                                : 'bg-[var(--dangerous-glow)] text-[var(--dangerous)]',
                        )}>
                            {isApproved
                                ? <><CheckCircle size={12} /> Approved</>
                                : <><XCircle size={12} /> Rejected</>
                            }
                        </div>
                    )}
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
                            {Object.entries(message.args).map(([key, val]) => (
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

                {/* Action buttons — only when pending */}
                {isPending && (
                    <div className="flex items-center gap-2 pt-1">
                        <button
                            onClick={onReject}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--dangerous)]/60 hover:text-[var(--dangerous)] transition-all"
                        >
                            <X size={14} />
                            Reject
                        </button>
                        <button
                            onClick={onApprove}
                            className={cn(
                                'flex items-center gap-1.5 px-4 py-2 rounded-[var(--radius-md)] text-sm font-medium text-white transition-all',
                                cfg.btnCls,
                            )}
                        >
                            <Check size={14} />
                            Approve
                        </button>
                        <p className="ml-auto text-[10px] text-[var(--text-muted)]">
                            Waiting for your decision…
                        </p>
                    </div>
                )}

            </div>
        </motion.div>
    );
}

// ============================================================
// Tool Auto Bubble (SAFE tool ran automatically)
// ============================================================

interface ToolAutoBubbleProps {
    message: ToolAutoMessage;
}

export function ToolAutoBubble({ message }: ToolAutoBubbleProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex justify-start"
        >
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-[var(--safe-glow)] border border-[var(--safe)]/30 max-w-[420px]">
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--safe)]/20">
                    <Check size={11} className="text-[var(--safe)]" />
                </div>
                <span className="text-xs text-[var(--safe)] font-medium">
                    Used <span className="font-semibold">{message.displayName}</span>
                </span>
                <span className="text-xs text-[var(--text-muted)] truncate max-w-[200px]">
                    → {message.result}
                </span>
            </div>
        </motion.div>
    );
}
