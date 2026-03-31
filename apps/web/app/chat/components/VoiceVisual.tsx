'use client';

import { useVoice } from '@/components/VoiceProvider';
import { Mic, MicOff, Languages, Check, X, AlertTriangle, Zap, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface VoiceVisualProps {
    language: 'th' | 'en';
    onLanguageChange: (lang: 'th' | 'en') => void;
}

export function VoiceVisual({ language, onLanguageChange }: VoiceVisualProps) {
    const {
        isConnected, isRecording, isSpeaking, isStreaming,
        messages, pendingToolConfirm,
        toggleRecording,
    } = useVoice();

    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isStreaming]);

    const toggleLanguage = () => {
        onLanguageChange(language === 'th' ? 'en' : 'th');
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)]">
                <p className="text-sm font-medium text-[var(--text-secondary)]">Voice Mode</p>
                <div className="flex items-center gap-2">
                    {!isConnected && (
                        <span className="text-xs text-[var(--dangerous)]">Disconnected</span>
                    )}
                    {isStreaming && (
                        <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                    )}
                    <button
                        onClick={toggleLanguage}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--surface)] hover:bg-[var(--surface-active)] text-xs text-[var(--text-secondary)]"
                    >
                        <Languages size={12} />
                        {language === 'th' ? 'TH' : 'EN'}
                    </button>
                </div>
            </div>

            {/* Messages area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <p className="text-[var(--text-muted)] text-sm">
                            Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-mono text-xs">F8</kbd> or tap the mic to start
                        </p>
                    </div>
                )}

                {messages.map((msg) => {
                    if (msg.role === 'user') {
                        return (
                            <div key={msg.id} className="flex justify-end">
                                <div className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 bg-[var(--accent)] text-white text-sm">
                                    {msg.content}
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'assistant') {
                        return (
                            <div key={msg.id} className="flex justify-start">
                                <div className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 bg-[var(--surface)] text-[var(--text-primary)] text-sm">
                                    {msg.content || (isStreaming && msg === messages[messages.length - 1]) ? (
                                        <>
                                            {msg.content}
                                            {isStreaming && msg === messages[messages.length - 1] && !msg.content && (
                                                <span className="inline-flex gap-1 ml-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '0ms' }} />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '150ms' }} />
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-bounce" style={{ animationDelay: '300ms' }} />
                                                </span>
                                            )}
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'tool_auto') {
                        return (
                            <div key={msg.id} className="flex justify-start">
                                <div className="max-w-[90%] rounded-lg px-3 py-2 border bg-[var(--safe-glow)] border-[var(--safe)]/30">
                                    <div className="flex items-center gap-2 text-xs">
                                        <Check size={12} className="text-[var(--safe)]" />
                                        <span className="text-[var(--text-secondary)]">{msg.displayName || msg.toolName}</span>
                                    </div>
                                    {msg.content && (
                                        <p className="text-xs text-[var(--text-muted)] mt-1 truncate max-w-[250px]">{msg.content}</p>
                                    )}
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'tool_confirm') {
                        const levelConfig = {
                            SAFE: { border: 'border-[var(--safe)]/30', bg: 'bg-[var(--safe-glow)]', color: 'text-[var(--safe)]', icon: Check },
                            SENSITIVE: { border: 'border-[var(--sensitive)]/30', bg: 'bg-[var(--sensitive-glow)]', color: 'text-[var(--sensitive)]', icon: Zap },
                            DANGEROUS: { border: 'border-[var(--dangerous)]/30', bg: 'bg-[var(--dangerous-glow)]', color: 'text-[var(--dangerous)]', icon: AlertTriangle },
                        };
                        const cfg = levelConfig[msg.permissionLevel || 'DANGEROUS'];
                        const Icon = cfg.icon;

                        return (
                            <div key={msg.id} className="flex justify-start">
                                <div className={cn("max-w-[90%] rounded-lg px-3 py-2 border", cfg.bg, cfg.border)}>
                                    <div className="flex items-center gap-2">
                                        <Icon size={14} className={cfg.color} />
                                        <span className="text-sm font-medium text-[var(--text-primary)]">{msg.displayName || msg.toolName}</span>
                                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", cfg.color, cfg.bg)}>
                                            {msg.permissionLevel}
                                        </span>
                                    </div>
                                    <p className="text-xs text-[var(--text-secondary)] mt-1">{msg.content}</p>

                                    {msg.status === 'pending' && (
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={() => {
                                                    // VoiceProvider.confirmTool is called via sendTranscription
                                                    // But we also need a click fallback
                                                    const event = new CustomEvent('voice-tool-confirm', { detail: { approved: false } });
                                                    window.dispatchEvent(event);
                                                }}
                                                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--surface)] hover:bg-red-500/20 text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                                            >
                                                <X size={12} /> Reject
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const event = new CustomEvent('voice-tool-confirm', { detail: { approved: true } });
                                                    window.dispatchEvent(event);
                                                }}
                                                className={cn(
                                                    "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors",
                                                    msg.permissionLevel === 'DANGEROUS'
                                                        ? 'bg-[var(--dangerous)]/20 hover:bg-[var(--dangerous)]/30 text-[var(--dangerous)]'
                                                        : msg.permissionLevel === 'SENSITIVE'
                                                            ? 'bg-[var(--sensitive)]/20 hover:bg-[var(--sensitive)]/30 text-[var(--sensitive)]'
                                                            : 'bg-[var(--safe)]/20 hover:bg-[var(--safe)]/30 text-[var(--safe)]'
                                                )}
                                            >
                                                <Check size={12} /> Approve
                                            </button>
                                            <span className="text-[10px] text-[var(--text-muted)] self-center ml-1">or say yes/no</span>
                                        </div>
                                    )}

                                    {msg.status === 'approved' && (
                                        <p className="text-xs text-[var(--safe)] mt-1 flex items-center gap-1"><Check size={10} /> Approved</p>
                                    )}
                                    {msg.status === 'rejected' && (
                                        <p className="text-xs text-[var(--dangerous)] mt-1 flex items-center gap-1"><X size={10} /> Rejected</p>
                                    )}
                                </div>
                            </div>
                        );
                    }

                    return null;
                })}

                {/* Streaming indicator */}
                {isStreaming && messages.length > 0 && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content && (
                    <div className="flex justify-start">
                        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                            <Loader2 size={10} className="animate-spin" /> thinking...
                        </div>
                    </div>
                )}

                {/* Pending tool confirm voice hint */}
                {pendingToolConfirm && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex justify-center"
                    >
                        <div className="px-3 py-1.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-xs text-[var(--accent)] animate-pulse">
                            Say "yes" or "no" to confirm
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Mic button */}
            <div className="flex flex-col items-center py-3 border-t border-[var(--border)]">
                <motion.button
                    onClick={toggleRecording}
                    disabled={!isConnected}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                        "relative flex items-center justify-center rounded-full transition-all duration-300",
                        !isConnected && "opacity-50 cursor-not-allowed",
                        isRecording
                            ? "w-16 h-16 bg-gradient-to-br from-red-500 to-red-600"
                            : "w-14 h-14 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-glow)]"
                    )}
                >
                    <AnimatePresence>
                        {isRecording && (
                            <>
                                <motion.div
                                    initial={{ scale: 1, opacity: 0.4 }}
                                    animate={{ scale: 2.2, opacity: 0 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                                    className="absolute inset-0 rounded-full bg-red-500"
                                />
                                <motion.div
                                    initial={{ scale: 1, opacity: 0.3 }}
                                    animate={{ scale: 1.8, opacity: 0 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                                    className="absolute inset-0 rounded-full bg-red-500"
                                />
                            </>
                        )}
                    </AnimatePresence>

                    {isRecording && isSpeaking && (
                        <motion.div
                            animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                            transition={{ duration: 0.4, repeat: Infinity }}
                            className="absolute inset-0 rounded-full border-2 border-white"
                        />
                    )}

                    <div className="text-white">
                        {isRecording
                            ? <MicOff size={22} />
                            : <Mic size={20} />
                        }
                    </div>
                </motion.button>

                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                    {isRecording ? (isSpeaking ? 'Listening...' : 'Recording...') : 'F8 to toggle'}
                </p>
            </div>
        </div>
    );
}
