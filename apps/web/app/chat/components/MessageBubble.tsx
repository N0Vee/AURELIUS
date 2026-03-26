'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/hooks/useChat';
import { User, Copy, Check, AlertCircle, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
    message: ChatMessage;
    onRetry?: () => void;
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ─── Waveform bar amplitudes (symmetric, centre-peaked) ───────────────────────
const WAVE_AMPS = [0.3, 0.55, 0.8, 1, 0.8, 0.55, 0.3];

// ─── Error state ──────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
    return (
        <div className="flex flex-col gap-3 py-1">
            <div className="flex items-start gap-2.5">
                <AlertCircle
                    size={15}
                    className="text-[var(--dangerous)] shrink-0 mt-0.5"
                />
                <p className="text-sm text-[var(--dangerous)] leading-relaxed">
                    {message}
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
    );
}

function ThinkingIndicator() {
    return (
        <div className="flex items-center gap-3.5 py-1.5 px-0.5">

            {/* ── Pulsing orb ───────────────────────────────────── */}
            <div className="relative flex shrink-0 items-center justify-center h-8 w-8">
                {/* Outermost ripple */}
                <motion.span
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
                    animate={{ scale: [1, 2.1], opacity: [0.25, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                />
                {/* Mid ripple */}
                <motion.span
                    className="absolute inset-[4px] rounded-full"
                    style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
                    animate={{ scale: [1, 1.7], opacity: [0.35, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut', delay: 0.38 }}
                />
                {/* Inner ring */}
                <motion.span
                    className="absolute inset-[7px] rounded-full border border-[var(--accent)]/50"
                    animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                />
                {/* Core dot */}
                <motion.span
                    className="relative block h-2.5 w-2.5 rounded-full bg-[var(--accent)]"
                    animate={{ scale: [1, 0.78, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ boxShadow: '0 0 10px 2px var(--accent-glow)' }}
                />
            </div>

            {/* ── Waveform bars ─────────────────────────────────── */}
            <div
                className="flex items-center gap-[3px]"
                style={{ height: 22 }}
                aria-hidden="true"
            >
                {WAVE_AMPS.map((amp, i) => (
                    <motion.span
                        key={i}
                        className="block w-[3px] rounded-full bg-[var(--accent)]"
                        animate={{ scaleY: [amp * 0.25, amp, amp * 0.25] }}
                        transition={{
                            duration: 0.72,
                            repeat: Infinity,
                            delay: i * 0.075,
                            ease: 'easeInOut',
                        }}
                        style={{
                            height: '100%',
                            transformOrigin: '50% 50%',
                            opacity: 0.45 + amp * 0.55,
                        }}
                    />
                ))}
            </div>

            {/* ── Animated label ────────────────────────────────── */}
            <div className="flex items-end gap-[2px]">
                <motion.span
                    className="text-sm font-medium tracking-wide"
                    style={{ color: 'var(--text-secondary)' }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                >
                    Thinking
                </motion.span>

                {/* Trailing animated dots */}
                <div className="flex items-end gap-[2px] pb-[2px]">
                    {[0, 1, 2].map(i => (
                        <motion.span
                            key={i}
                            className="block h-[3px] w-[3px] rounded-full"
                            style={{ background: 'var(--accent)' }}
                            animate={{ opacity: [0, 1, 0], y: [0, -2, 0] }}
                            transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                delay: i * 0.22,
                                ease: 'easeInOut',
                            }}
                        />
                    ))}
                </div>
            </div>

        </div>
    );
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
    const isUser      = message.role === 'user';
    const isThinking  = message.isStreaming && !message.content;
    const isStreaming  = message.isStreaming && !!message.content;
    const isError     = !message.isStreaming && !isUser && message.content.length > 0
                        && !message.content.startsWith('#')
                        && (
                            message.content.includes('interrupted') ||
                            message.content.includes('went wrong') ||
                            message.content.includes('unavailable') ||
                            message.content.includes('rate limit') ||
                            message.content.includes('invalid or expired') ||
                            message.content.includes('API key')
                        );
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
                'flex gap-3 w-full group',
                isUser ? 'flex-row-reverse' : 'flex-row',
            )}
        >
            {/* ── Avatar ─────────────────────────────────────────── */}
            <div className="relative shrink-0 self-start">
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.08, type: 'spring', stiffness: 500, damping: 30 }}
                    className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-full',
                        isUser
                            ? 'bg-[var(--accent)]'
                            : 'bg-[var(--surface)] border border-[var(--border)]',
                    )}
                >
                    {isUser ? (
                        <User size={17} className="text-white" />
                    ) : (
                        /* AURELIUS monogram */
                        <span
                            className="text-[11px] font-bold tracking-tight select-none"
                            style={{ color: 'var(--accent)' }}
                        >
                            AU
                        </span>
                    )}
                </motion.div>

                {/* Pulse ring on avatar while thinking */}
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

            {/* ── Bubble ─────────────────────────────────────────── */}
            <div className="flex flex-col max-w-[75%]">
                <motion.div
                    initial={{ opacity: 0, x: isUser ? 16 : -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08, duration: 0.22 }}
                    className={cn(
                        'rounded-2xl px-4 py-3 transition-shadow duration-500',
                        isUser
                            ? 'bg-[var(--accent)] text-white rounded-tr-sm'
                            : isError
                                ? [
                                    'glass rounded-tl-sm',
                                    'border border-[var(--dangerous)]/25',
                                    'shadow-[0_0_24px_-4px_var(--dangerous-glow)]',
                                  ].join(' ')
                                : isThinking
                                    ? [
                                        'glass rounded-tl-sm',
                                        'border border-[var(--accent)]/20',
                                        'shadow-[0_0_28px_-4px_var(--accent-glow)]',
                                      ].join(' ')
                                    : 'glass rounded-tl-sm',
                    )}
                >
                    <AnimatePresence mode="wait">
                        {isThinking ? (
                            /* ── Thinking state ─────────────────────────── */
                            <motion.div
                                key="thinking"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ThinkingIndicator />
                            </motion.div>
                        ) : isError ? (
                            /* ── Error state ────────────────────────────── */
                            <motion.div
                                key="error"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                            >
                                <ErrorState message={message.content} onRetry={onRetry} />
                            </motion.div>
                        ) : (
                            /* ── Content state ──────────────────────────── */
                            <motion.div
                                key="content"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.2 }}
                                className={cn(
                                    'prose prose-invert prose-sm max-w-none',
                                    isUser && 'prose-p:text-white prose-strong:text-white',
                                )}
                            >
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        code: ({ className, children, ...props }) => {
                                            const match    = /language-(\w+)/.exec(className || '');
                                            const language = match ? match[1] : '';
                                            const isInline = !className && !String(children).includes('\n');

                                            if (isInline) {
                                                return (
                                                    <code
                                                        className="bg-[var(--surface)] px-1.5 py-0.5 rounded text-[var(--accent)] text-sm font-mono"
                                                        {...props}
                                                    >
                                                        {children}
                                                    </code>
                                                );
                                            }

                                            return (
                                                <div className="my-3 overflow-hidden rounded-lg border border-[var(--border)]">
                                                    {language && (
                                                        <div className="bg-[var(--surface)] px-4 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)] font-mono">
                                                            {language}
                                                        </div>
                                                    )}
                                                    <SyntaxHighlighter
                                                        style={vscDarkPlus}
                                                        language={language || 'text'}
                                                        PreTag="div"
                                                        customStyle={{
                                                            margin: 0,
                                                            padding: '1rem',
                                                            background: '#111111',
                                                            fontSize: '0.875rem',
                                                            borderRadius: 0,
                                                        }}
                                                    >
                                                        {String(children).replace(/\n$/, '')}
                                                    </SyntaxHighlighter>
                                                </div>
                                            );
                                        },
                                        p: ({ children }) => (
                                            <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>
                                        ),
                                        ul: ({ children }) => (
                                            <ul className="list-disc list-inside space-y-1 text-sm my-2">{children}</ul>
                                        ),
                                        ol: ({ children }) => (
                                            <ol className="list-decimal list-inside space-y-1 text-sm my-2">{children}</ol>
                                        ),
                                        strong: ({ children }) => (
                                            <strong className="font-semibold">{children}</strong>
                                        ),
                                    }}
                                >
                                    {message.content}
                                </ReactMarkdown>

                                {/* Streaming cursor */}
                                {isStreaming && (
                                    <motion.span
                                        className="inline-block w-[2px] h-[14px] ml-0.5 rounded-full align-middle bg-[var(--accent)]"
                                        animate={{ opacity: [1, 1, 0, 0, 1] }}
                                        transition={{ duration: 0.8, repeat: Infinity, ease: 'linear', times: [0, 0.45, 0.5, 0.95, 1] }}
                                    />
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* ── Timestamp & copy ───────────────────────────── */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.28 }}
                    className={cn(
                        'flex items-center gap-2 mt-1.5 px-1',
                        isUser ? 'flex-row-reverse' : 'flex-row',
                    )}
                >
                    <span className="text-xs text-[var(--text-muted)]">
                        {formatTime(message.timestamp)}
                    </span>

                    {!isUser && message.content && (
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
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}
