'use client';

import { cn } from '@/lib/utils';
import type { Message } from '@/hooks/useChat';
import { User, Bot, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
    message: Message;
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function MessageBubble({ message }: MessageBubbleProps) {
    const isUser = message.role === 'user';
    const isThinking = message.isStreaming && !message.content;
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(message.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
                duration: 0.3,
                ease: [0.4, 0, 0.2, 1]
            }}
            className={cn(
                'flex gap-3 w-full group',
                isUser ? 'flex-row-reverse' : 'flex-row'
            )}
        >
            {/* Avatar */}
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 500, damping: 30 }}
                className={cn(
                    'flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full',
                    isUser
                        ? 'bg-[var(--accent)]'
                        : 'bg-[var(--surface)] border border-[var(--border)]'
                )}
            >
                {isUser ? (
                    <User size={18} className="text-white" />
                ) : (
                    <Bot size={18} className="text-[var(--accent)]" />
                )}
            </motion.div>

            {/* Message Content */}
            <div className="flex flex-col max-w-[75%]">
                <motion.div
                    initial={{ opacity: 0, x: isUser ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                    className={cn(
                        'rounded-2xl px-4 py-3',
                        isUser
                            ? 'bg-[var(--accent)] text-white rounded-tr-sm'
                            : 'glass rounded-tl-sm'
                    )}
                >
                    {isThinking ? (
                        <TypingIndicator />
                    ) : (
                        <div className={cn(
                            'prose prose-invert prose-sm max-w-none',
                            isUser && 'prose-p:text-white prose-strong:text-white'
                        )}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    code: ({ className, children, ...props }) => {
                                        const match = /language-(\w+)/.exec(className || '');
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
                                                    <div className="bg-[var(--surface)] px-4 py-2 text-xs text-[var(--text-muted)] border-b border-[var(--border)]">
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
                                                        background: '#1a1a1a',
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
                        </div>
                    )}
                </motion.div>

                {/* Timestamp & Actions */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className={cn(
                        'flex items-center gap-2 mt-1.5 px-1',
                        isUser ? 'flex-row-reverse' : 'flex-row'
                    )}
                >
                    <span className="text-xs text-[var(--text-muted)]">
                        {formatTime(message.timestamp)}
                    </span>
                    {!isUser && message.content && (
                        <button
                            onClick={handleCopy}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[var(--surface)] rounded"
                            title="Copy message"
                        >
                            {copied ? (
                                <Check size={14} className="text-[var(--safe)]" />
                            ) : (
                                <Copy size={14} className="text-[var(--text-muted)]" />
                            )}
                        </button>
                    )}
                </motion.div>
            </div>
        </motion.div>
    );
}

function TypingIndicator() {
    return (
        <div className="flex items-center gap-3 py-2">
            <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                    <motion.span
                        key={i}
                        className="h-2 w-2 rounded-full bg-[var(--accent)]"
                        animate={{
                            y: [0, -8, 0],
                            opacity: [0.5, 1, 0.5]
                        }}
                        transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            delay: i * 0.15,
                            ease: 'easeInOut'
                        }}
                    />
                ))}
            </div>
            <motion.span
                className="text-sm text-[var(--text-secondary)]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.5, repeat: Infinity }}
            >
                AURELIUS is thinking...
            </motion.span>
        </div>
    );
}
