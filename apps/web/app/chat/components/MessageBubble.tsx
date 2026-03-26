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
                                        h1: ({ children }) => (
                                            <h1 className="text-xl font-bold mt-5 mb-2 first:mt-0">{children}</h1>
                                        ),
                                        h2: ({ children }) => (
                                            <h2 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h2>
                                        ),
                                        h3: ({ children }) => (
                                            <h3 className="text-base font-semibold mt-3 mb-2 first:mt-0">{children}</h3>
                                        ),
                                        h4: ({ children }) => (
                                            <h4 className="text-sm font-bold mt-3 mb-1 first:mt-0">{children}</h4>
                                        ),
                                        h5: ({ children }) => (
                                            <h5 className="text-sm font-semibold mt-2 mb-1 first:mt-0">{children}</h5>
                                        ),
                                        h6: ({ children }) => (
                                            <h6 className="text-sm font-medium text-[var(--text-muted)] mt-2 mb-1 first:mt-0">{children}</h6>
                                        ),
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
                                        table: ({ children }) => (
                                            <div className="my-4 overflow-x-auto rounded-lg border border-[var(--border)]">
                                                <table className="w-full text-left text-sm border-collapse">
                                                    {children}
                                                </table>
                                            </div>
                                        ),
                                        thead: ({ children }) => (
                                            <thead className="bg-[var(--surface)] text-[var(--text-primary)] border-b border-[var(--border)]">
                                                {children}
                                            </thead>
                                        ),
                                        tbody: ({ children }) => (
                                            <tbody className="divide-y divide-[var(--border)] bg-transparent text-[var(--text-secondary)]">
                                                {children}
                                            </tbody>
                                        ),
                                        tr: ({ children }) => (
                                            <tr className="transition-colors hover:bg-[var(--surface)]/50">
                                                {children}
                                            </tr>
                                        ),
                                        th: ({ children }) => (
                                            <th className="px-4 py-2 font-semibold border-r border-[var(--border)] last:border-r-0">
                                                {children}
                                            </th>
                                        ),
                                        td: ({ children }) => (
                                            <td className="px-4 py-2 border-r border-[var(--border)] last:border-r-0">
                                                {children}
                                            </td>
                                        ),
                                        hr: () => (
                                            <hr className="my-4 border-[var(--border)]" />
                                        ),
                                        blockquote: ({ children }) => (
                                            <blockquote className="border-l-4 border-[var(--accent)] pl-4 py-1 my-3 text-[var(--text-muted)] italic bg-[var(--surface)]/30 rounded-r-lg">
                                                {children}
                                            </blockquote>
                                        ),
                                        a: ({ href, children }) => (
                                            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-800 hover:underline break-words">
                                                {children}
                                            </a>
                                        ),
                                        li: ({ children }) => (
                                            <li className="leading-relaxed">{children}</li>
                                        ),
                                        em: ({ children }) => (
                                            <em className="italic opacity-90">{children}</em>
                                        ),
                                        del: ({ children }) => (
                                            <del className="line-through opacity-70">{children}</del>
                                        ),
                                        img: ({ src, alt }) => (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={src} alt={alt} className="max-w-full h-auto rounded-lg my-3 border border-[var(--border)] shadow-sm" loading="lazy" />
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
