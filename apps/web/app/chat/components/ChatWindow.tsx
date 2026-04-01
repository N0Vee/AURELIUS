'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import type { UIMessage } from 'ai';
import { ToolInvocationBubble, formatToolName, type ToolMeta } from './ToolInvocationBubble';
import {
    MessageSquare,
    User,
    Copy,
    Check,
    AlertCircle,
    RefreshCw,
    ChevronDown,
    X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Image from 'next/image';
import { cn, isToolPart } from '@/lib/utils';
import { getToolName } from 'ai';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatWindowProps {
    messages: UIMessage[];
    status: 'submitted' | 'streaming' | 'ready' | 'error';
    error?: Error;
    onApprove: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void;
    onReject: (toolCallId: string, toolName: string) => void;
    onRetry?: () => void;
}

// ── API helpers ───────────────────────────────────────────────────────────────

const API_BASES = ['http://127.0.0.1:4243', 'http://localhost:4243'];

let metadataCache: Record<string, ToolMeta> | null = null;

async function fetchToolMetadata(): Promise<Record<string, ToolMeta>> {
    if (metadataCache) return metadataCache;
    for (const base of API_BASES) {
        try {
            const res = await fetch(`${base}/v2/chat/tools/metadata`);
            if (res.ok) {
                metadataCache = await res.json();
                return metadataCache!;
            }
        } catch {
            /* try next */
        }
    }
    return {};
}

// ── Markdown component overrides ──────────────────────────────────────────────

const markdownComponents: Record<string, React.ComponentType<Record<string, unknown>>> = {
    code: ({ className, children, ...props }: Record<string, unknown>) => {
        const match = /language-(\w+)/.exec((className as string) || '');
        const language = match ? match[1] : '';
        const isInline = !className && !String(children).includes('\n');

        if (isInline) {
            return (
                <code
                    className="bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--accent)] text-sm font-mono"
                    {...props}
                >
                    {children as React.ReactNode}
                </code>
            );
        }

        return (
            <div className="my-3 overflow-hidden rounded-lg border border-[var(--border)]">
                {language && (
                    <div className="bg-[var(--surface)] px-3 py-1.5 sm:px-4 sm:py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)] font-mono">
                        {language}
                    </div>
                )}
                <SyntaxHighlighter
                    style={vscDarkPlus}
                    language={language || 'text'}
                    PreTag="div"
                    customStyle={{
                        margin: 0,
                        padding: '0.625rem',
                        background: '#111111',
                        fontSize: '0.75rem',
                        borderRadius: 0,
                    }}
                >
                    {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
            </div>
        );
    },
    h1: ({ children }) => <h1 className="text-lg sm:text-xl font-bold mt-4 sm:mt-5 mb-2 first:mt-0">{children as React.ReactNode}</h1>,
    h2: ({ children }) => <h2 className="text-base sm:text-lg font-bold mt-3 sm:mt-4 mb-2 first:mt-0">{children as React.ReactNode}</h2>,
    h3: ({ children }) => <h3 className="text-base font-semibold mt-3 mb-2 first:mt-0">{children as React.ReactNode}</h3>,
    h4: ({ children }) => <h4 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children as React.ReactNode}</h4>,
    h5: ({ children }) => <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children as React.ReactNode}</h5>,
    h6: ({ children }) => <h6 className="text-sm font-medium text-[var(--text-muted)] mt-2 mb-1 first:mt-0">{children as React.ReactNode}</h6>,
    p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children as React.ReactNode}</p>,
    ul: ({ children }) => <ul className="list-disc list-inside space-y-1 text-sm my-2">{children as React.ReactNode}</ul>,
    ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 text-sm my-2">{children as React.ReactNode}</ol>,
    strong: ({ children }) => <strong className="font-semibold">{children as React.ReactNode}</strong>,
    table: ({ children }) => (
        <div className="my-2 sm:my-4 overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">{children as React.ReactNode}</table>
        </div>
    ),
    thead: ({ children }) => (
        <thead className="bg-[var(--surface)] text-[var(--text-primary)] border-b border-[var(--border)]">{children as React.ReactNode}</thead>
    ),
    tbody: ({ children }) => (
        <tbody className="divide-y divide-[var(--border)] bg-transparent text-[var(--text-secondary)]">{children as React.ReactNode}</tbody>
    ),
    tr: ({ children }) => <tr className="transition-colors hover:bg-[var(--surface)]/50">{children as React.ReactNode}</tr>,
    th: ({ children }) => (
        <th className="px-2 py-1.5 sm:px-4 sm:py-2 font-semibold border-r border-[var(--border)] last:border-r-0">{children as React.ReactNode}</th>
    ),
    td: ({ children }) => (
        <td className="px-2 py-1.5 sm:px-4 sm:py-2 border-r border-[var(--border)] last:border-r-0">{children as React.ReactNode}</td>
    ),
    hr: () => <hr className="my-4 border-[var(--border)]" />,
    blockquote: ({ children }) => (
        <blockquote className="border-l-4 border-[var(--accent)] pl-4 py-1 my-3 text-[var(--text-muted)] italic bg-[var(--surface)]/30 rounded-r-lg">
            {children as React.ReactNode}
        </blockquote>
    ),
    a: ({ href, children }) => (
        <a href={href as string} target="_blank" rel="noopener noreferrer" className="text-blue-800 hover:underline break-words">
            {children as React.ReactNode}
        </a>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children as React.ReactNode}</li>,
    em: ({ children }) => <em className="italic opacity-90">{children as React.ReactNode}</em>,
    del: ({ children }) => <del className="line-through opacity-70">{children as React.ReactNode}</del>,
    img: ({ src, alt }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src as string} alt={alt as string} className="max-w-full h-auto rounded-lg my-3 border border-[var(--border)] shadow-sm" loading="lazy" />
    ),
};

// ── Small sub-components ──────────────────────────────────────────────────────

function ThinkingIndicator() {
    return (
        <div className="flex items-center gap-2.5 py-1.5 px-2">
            <motion.div
                className="h-2 w-2 rounded-full bg-[var(--accent)]"
                animate={{ opacity: [0.4, 1, 0.4], scale: [0.8, 1.1, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-sm font-medium text-[var(--text-muted)] animate-pulse">
                Thinking...
            </span>
        </div>
    );
}

function StreamingCursor() {
    return (
        <motion.span
            className="inline-block w-[2px] h-[14px] ml-0.5 rounded-full align-middle bg-[var(--accent)]"
            animate={{ opacity: [1, 1, 0, 0, 1] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear', times: [0, 0.45, 0.5, 0.95, 1] }}
        />
    );
}

function ReasoningBlock({ text, isStreaming }: { text: string; isStreaming: boolean }) {
    const [open, setOpen] = useState(false);

    // Don't render anything for completed (non-streaming) reasoning —
    // it will be folded into the process strip by AssistantMessage.
    if (!isStreaming) return null;

    return (
        <div className="flex items-center gap-1.5 px-1 py-0.5">
            <motion.div
                className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]"
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <span className="text-[11px] text-[var(--text-muted)] animate-pulse">Reasoning…</span>
        </div>
    );
}

/** Compact strip showing completed reasoning + tool activity, collapsible */
function ProcessStrip({
    reasoningTexts,
    toolSummaries,
}: {
    reasoningTexts: string[];
    toolSummaries: { name: string; state: string; output?: string; errorText?: string }[];
}) {
    const [open, setOpen] = useState(false);

    if (reasoningTexts.length === 0 && toolSummaries.length === 0) return null;

    const completedTools = toolSummaries.filter(
        (t) => t.state === 'output-available' || t.state === 'output-error' || t.state === 'output-denied',
    );
    const hasReasoning = reasoningTexts.length > 0;
    const totalSteps = completedTools.length;

    // Build summary label
    let label = '';
    if (hasReasoning && totalSteps > 0) {
        label = `Thought & used ${totalSteps} tool${totalSteps > 1 ? 's' : ''}`;
    } else if (hasReasoning) {
        label = 'Thought process';
    } else {
        label = `Used ${totalSteps} tool${totalSteps > 1 ? 's' : ''}`;
    }

    return (
        <div className="flex flex-col">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors py-0.5 px-1 -mx-1 rounded-md hover:bg-[var(--surface)]/50 w-fit"
            >
                <ChevronDown
                    size={10}
                    className={cn('transition-transform duration-200 shrink-0', open && 'rotate-180')}
                />
                <span>{label}</span>

                {/* Inline tool chips (collapsed preview) */}
                {!open && completedTools.length > 0 && (
                    <span className="flex items-center gap-1 ml-1">
                        {completedTools.map((t, i) => (
                            <span
                                key={i}
                                className={cn(
                                    'inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium',
                                    t.state === 'output-error' || t.state === 'output-denied'
                                        ? 'bg-[var(--dangerous)]/10 text-[var(--dangerous)]'
                                        : 'bg-[var(--safe)]/10 text-[var(--safe)]',
                                )}
                            >
                                {t.state === 'output-error' ? (
                                    <AlertCircle size={8} />
                                ) : t.state === 'output-denied' ? (
                                    <X size={8} />
                                ) : (
                                    <Check size={8} />
                                )}
                                {t.name}
                            </span>
                        ))}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="mt-1.5 ml-1 pl-2.5 border-l border-[var(--border)] flex flex-col gap-1.5">
                            {/* Completed tools detail */}
                            {completedTools.map((t, i) => {
                                const isErr = t.state === 'output-error';
                                const isDenied = t.state === 'output-denied';
                                const isBad = isErr || isDenied;
                                const result = t.output && t.output.length < 200 ? t.output : null;
                                return (
                                    <div
                                        key={i}
                                        className={cn(
                                            'flex items-start gap-1.5 text-[11px] py-0.5',
                                        )}
                                    >
                                        {isErr ? (
                                            <AlertCircle size={10} className="text-[var(--dangerous)] shrink-0 mt-px" />
                                        ) : isDenied ? (
                                            <X size={10} className="text-[var(--dangerous)] shrink-0 mt-px" />
                                        ) : (
                                            <Check size={10} className="text-[var(--safe)] shrink-0 mt-px" />
                                        )}
                                        <span className={cn('font-medium', isBad ? 'text-[var(--dangerous)]' : 'text-[var(--safe)]')}>
                                            {isDenied ? `Rejected ${t.name}` : t.name}
                                        </span>
                                        {result && !isBad && (
                                            <span className="text-[var(--text-muted)] truncate max-w-[200px]">{result}</span>
                                        )}
                                        {isErr && t.errorText && (
                                            <span className="text-[var(--text-muted)] truncate max-w-[200px]">{t.errorText}</span>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Reasoning text */}
                            {hasReasoning && (
                                <div className="text-[11px] text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto mt-0.5">
                                    {reasoningTexts.join('\n\n')}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function AuAvatar({ isThinking }: { isThinking: boolean }) {
    return (
        <div className="relative shrink-0 self-start">
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 30 }}
                className="relative h-7 w-7 sm:h-9 sm:w-9 overflow-hidden rounded-full bg-black/60 border border-[var(--border)] shadow-[0_0_10px_var(--accent-glow)]"
            >
                <Image
                    src="/images/aurelius-icon.png"
                    alt="Aurelius"
                    fill
                    className="object-contain p-0.5"
                    sizes="36px"
                />
            </motion.div>
            <AnimatePresence>
                {isThinking && (
                    <motion.span
                        key="avatar-ring"
                        className="absolute inset-0 rounded-full border border-[var(--accent)]/40"
                        initial={{ scale: 1, opacity: 0 }}
                        animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}

function UserAvatar() {
    return (
        <div className="relative shrink-0 self-start">
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 30 }}
                className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-[var(--accent)]"
            >
                <User size={14} className="text-white sm:hidden" />
                <User size={17} className="text-white hidden sm:block" />
            </motion.div>
        </div>
    );
}

// ── User bubble ───────────────────────────────────────────────────────────────

function UserBubble({ message }: { message: UIMessage }) {
    const text = (message.parts ?? [])
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('\n');

    const images = (message.parts ?? [])
        .filter((p): p is { type: 'file'; url: string; mediaType: string } =>
            p.type === 'file' && (p as { mediaType?: string }).mediaType?.startsWith('image/') === true,
        )
        .map((p) => p.url);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="flex gap-2 sm:gap-3 w-full flex-row-reverse group"
        >
            <UserAvatar />
            <div className="flex flex-col max-w-[85%] sm:max-w-[75%]">
                <motion.div
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08, duration: 0.22 }}
                    className="rounded-2xl px-3 py-2 sm:px-4 sm:py-3 bg-[var(--accent)] text-white rounded-tr-sm"
                >
                    <div className="prose prose-invert prose-sm max-w-none prose-p:text-white prose-strong:text-white">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {text}
                        </ReactMarkdown>
                    </div>
                    {images.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                            {images.map((url, i) => (
                                <img
                                    key={i}
                                    src={url}
                                    alt={`Attached ${i + 1}`}
                                    className="max-w-full max-h-48 rounded-lg border border-white/20 object-contain cursor-pointer hover:brightness-110 transition"
                                    onClick={() => window.open(url, '_blank')}
                                />
                            ))}
                        </div>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}

// ── Assistant message ─────────────────────────────────────────────────────────

function AssistantMessage({
    message,
    isLast,
    isActive,
    toolMeta,
    onApprove,
    onReject,
    onRetry,
}: {
    message: UIMessage;
    isLast: boolean;
    isActive: boolean;
    toolMeta: Record<string, ToolMeta>;
    onApprove: (toolCallId: string, toolName: string, args: Record<string, unknown>) => void;
    onReject: (toolCallId: string, toolName: string) => void;
    onRetry?: () => void;
}) {
    const [copied, setCopied] = useState(false);

    const hasText = (message.parts ?? []).some((p) => p.type === 'text' && p.text);
    const hasToolParts = (message.parts ?? []).some((p) => isToolPart(p));
    const isThinking = isLast && isActive && !hasText && !hasToolParts;

    const allText = useMemo(
        () =>
            (message.parts ?? [])
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n\n'),
        [message.parts],
    );

    const handleCopy = async () => {
        await navigator.clipboard.writeText(allText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Detect error-like text (matches v1 heuristic)
    const isError =
        !isActive &&
        allText.length > 0 &&
        !allText.startsWith('#') &&
        (allText.includes('interrupted') ||
            allText.includes('went wrong') ||
            allText.includes('unavailable') ||
            allText.includes('rate limit') ||
            allText.includes('invalid or expired') ||
            allText.includes('API key') ||
            allText.includes('Insufficient') ||
            allText.includes('credits') ||
            allText.includes('Model not found') ||
            allText.includes('backend unavailable') ||
            allText.includes('Connection was'));

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className="flex gap-2 sm:gap-3 w-full flex-row group"
        >
            <AuAvatar isThinking={isThinking} />

            <div className="flex flex-col gap-2 max-w-[85%] sm:max-w-[75%]">
                {isThinking ? (
                    /* ── Thinking state ──────────────────────────────── */
                    <motion.div
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.08, duration: 0.22 }}
                        className={cn(
                            'glass rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-3',
                            'border border-[var(--accent)]/20 shadow-[0_0_28px_-4px_var(--accent-glow)]',
                        )}
                    >
                        <ThinkingIndicator />
                    </motion.div>
                ) : (
                    /* ── Parts ───────────────────────────────────────── */
                    (() => {
                        const parts = message.parts ?? [];

                        // Collect completed reasoning & tool summaries for the ProcessStrip
                        const reasoningTexts: string[] = [];
                        const toolSummaries: { name: string; state: string; output?: string; errorText?: string }[] = [];
                        // Track which parts are "process" parts (will be folded into strip)
                        const processIdxs = new Set<number>();

                        parts.forEach((part, idx) => {
                            if (part.type === 'reasoning' && part.state !== 'streaming') {
                                reasoningTexts.push(part.text);
                                processIdxs.add(idx);
                            }
                            if (isToolPart(part)) {
                                const st = part.state as string;
                                if (st === 'output-available' || st === 'output-error' || st === 'output-denied') {
                                    const tn = getToolName(part);
                                    const meta = toolMeta[tn];
                                    const displayName = meta?.displayName ?? formatToolName(tn);
                                    const output = typeof part.output === 'string'
                                        ? part.output
                                        : part.output != null ? JSON.stringify(part.output) : '';
                                    toolSummaries.push({ name: displayName, state: st, output, errorText: (part as any).errorText });
                                    processIdxs.add(idx);
                                }
                            }
                            if (part.type === 'step-start') {
                                processIdxs.add(idx);
                            }
                        });

                        const hasProcessStrip = reasoningTexts.length > 0 || toolSummaries.length > 0;

                        return (
                            <>
                                {/* Collapsed process strip for completed reasoning + tool activity */}
                                {hasProcessStrip && (
                                    <ProcessStrip reasoningTexts={reasoningTexts} toolSummaries={toolSummaries} />
                                )}

                                {/* Render remaining parts: text, streaming reasoning, pending tools */}
                                {parts.map((part, idx) => {
                                    if (processIdxs.has(idx)) return null;

                                    // Text part
                                    if (part.type === 'text') {
                                        if (!part.text) return null;
                                        const isStreaming = part.state === 'streaming';

                                        return (
                                            <motion.div
                                                key={`text-${idx}`}
                                                initial={{ opacity: 0, x: -16 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.08, duration: 0.22 }}
                                                className={cn(
                                                    'glass rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-3 transition-shadow duration-500',
                                                    isError &&
                                                        'border border-[var(--dangerous)]/25 shadow-[0_0_24px_-4px_var(--dangerous-glow)]',
                                                )}
                                            >
                                                {isError ? (
                                                    <div className="flex flex-col gap-3 py-1">
                                                        <div className="flex items-start gap-2.5">
                                                            <AlertCircle
                                                                size={15}
                                                                className="text-[var(--dangerous)] shrink-0 mt-0.5"
                                                            />
                                                            <p className="text-sm text-[var(--dangerous)] leading-relaxed">
                                                                {part.text}
                                                            </p>
                                                        </div>
                                                        {onRetry && (
                                                            <button
                                                                onClick={onRetry}
                                                                className={cn(
                                                                    'self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
                                                                    'bg-[var(--surface)] border border-[var(--dangerous)]/30',
                                                                    'text-[var(--dangerous)] hover:bg-[var(--dangerous)]/10',
                                                                    'transition-all duration-150',
                                                                )}
                                                            >
                                                                <RefreshCw size={12} />
                                                                Try again
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="prose prose-invert prose-sm max-w-none">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={markdownComponents}
                                                        >
                                                            {part.text}
                                                        </ReactMarkdown>
                                                        {isStreaming && <StreamingCursor />}
                                                    </div>
                                                )}
                                            </motion.div>
                                        );
                                    }

                                    // Streaming reasoning (active thinking)
                                    if (part.type === 'reasoning') {
                                        return (
                                            <ReasoningBlock
                                                key={`reasoning-${idx}`}
                                                text={part.text}
                                                isStreaming={part.state === 'streaming'}
                                            />
                                        );
                                    }

                                    // Pending tool invocation (needs confirm)
                                    if (isToolPart(part)) {
                                        const toolName = getToolName(part);
                                        return (
                                            <ToolInvocationBubble
                                                key={part.toolCallId}
                                                part={part}
                                                toolName={toolName}
                                                meta={toolMeta[toolName]}
                                                onApprove={onApprove}
                                                onReject={onReject}
                                            />
                                        );
                                    }

                                    return null;
                                })}
                            </>
                        );
                    })()
                )}

                {/* ── Copy button ────────────────────────────────────────── */}
                {allText && !isThinking && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.28 }}
                        className="flex items-center gap-2 px-1"
                    >
                        <button
                            onClick={handleCopy}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[var(--surface)]"
                            title="Copy message"
                        >
                            {copied ? (
                                <Check size={13} className="text-[var(--safe)]" />
                            ) : (
                                <Copy size={13} className="text-[var(--text-muted)]" />
                            )}
                        </button>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="glass-strong rounded-full p-4 sm:p-6 mb-4 sm:mb-6">
                <MessageSquare size={28} className="text-[var(--accent)] sm:hidden" />
                <MessageSquare size={40} className="text-[var(--accent)] hidden sm:block" />
            </div>
            <h2 className="text-lg sm:text-2xl font-semibold text-[var(--text-primary)] mb-2">
                Start a Conversation
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] max-w-md mb-4 sm:mb-6 px-2 sm:px-0">
                Aurelius is ready to assist. Ask questions, get help with code, or control your system.
            </p>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center max-w-full sm:max-w-lg px-2 sm:px-0">
                {['What time is it?', 'Help me with code', 'Open Notepad'].map((suggestion) => (
                    <button
                        key={suggestion}
                        className="glass-strong px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all"
                    >
                        {suggestion}
                    </button>
                ))}
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ChatWindow({
    messages,
    status,
    error,
    onApprove,
    onReject,
    onRetry,
}: ChatWindowProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [toolMeta, setToolMeta] = useState<Record<string, ToolMeta>>({});

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Fetch tool metadata once
    useEffect(() => {
        fetchToolMetadata().then(setToolMeta).catch(() => {});
    }, []);

    const isActive = status === 'submitted' || status === 'streaming';

    return (
        <div className="h-full overflow-y-auto p-3 sm:p-6 bg-transparent">
            {messages.length === 0 ? (
                <EmptyState />
            ) : (
                <div className="max-w-full sm:max-w-4xl mx-auto space-y-3 sm:space-y-4 pb-4">
                    {messages.map((message, idx) => {
                        if (message.role === 'user') {
                            return <UserBubble key={message.id} message={message} />;
                        }

                        if (message.role === 'assistant') {
                            return (
                                <AssistantMessage
                                    key={message.id}
                                    message={message}
                                    isLast={idx === messages.length - 1}
                                    isActive={isActive}
                                    toolMeta={toolMeta}
                                    onApprove={onApprove}
                                    onReject={onReject}
                                    onRetry={onRetry}
                                />
                            );
                        }

                        return null;
                    })}

                    {/* Global error banner */}
                    {status === 'error' && error && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30"
                        >
                            <AlertCircle size={16} className="text-[var(--dangerous)] shrink-0 mt-0.5" />
                            <div className="flex flex-col gap-1.5">
                                <p className="text-sm text-[var(--dangerous)] font-medium">
                                    Something went wrong
                                </p>
                                <p className="text-xs text-[var(--text-muted)]">
                                    {error.message}
                                </p>
                                {onRetry && (
                                    <button
                                        onClick={onRetry}
                                        className={cn(
                                            'self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium mt-1',
                                            'bg-[var(--surface)] border border-[var(--dangerous)]/30',
                                            'text-[var(--dangerous)] hover:bg-[var(--dangerous)]/10',
                                            'transition-all duration-150',
                                        )}
                                    >
                                        <RefreshCw size={12} />
                                        Try again
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            )}
        </div>
    );
}
