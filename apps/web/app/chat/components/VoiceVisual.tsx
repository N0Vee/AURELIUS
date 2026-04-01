'use client';

import { useVoice } from '@/components/VoiceProvider';
import { Mic, MicOff, Languages, Check, X, AlertTriangle, Zap, Loader2, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface VoiceVisualProps {
    language: 'th' | 'en';
    onLanguageChange: (lang: 'th' | 'en') => void;
    messages: any[];
    isStreaming: boolean;
    onSend: (text: string) => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    pendingConfirmId: string | null;
}

// ── Permission level config ───────────────────────────────────────────────────

const LEVEL_STYLES = {
    SAFE: { border: 'border-[var(--safe)]/30', bg: 'bg-[var(--safe-glow)]', color: 'text-[var(--safe)]', btnBg: 'bg-[var(--safe)]/20 hover:bg-[var(--safe)]/30', Icon: Check },
    SENSITIVE: { border: 'border-[var(--sensitive)]/30', bg: 'bg-[var(--sensitive-glow)]', color: 'text-[var(--sensitive)]', btnBg: 'bg-[var(--sensitive)]/20 hover:bg-[var(--sensitive)]/30', Icon: Zap },
    DANGEROUS: { border: 'border-[var(--dangerous)]/30', bg: 'bg-[var(--dangerous-glow)]', color: 'text-[var(--dangerous)]', btnBg: 'bg-[var(--dangerous)]/20 hover:bg-[var(--dangerous)]/30', Icon: AlertTriangle },
};

// ── Subcomponents ─────────────────────────────────────────────────────────────

function ToolConfirmBubble({ msg, onApprove, onReject }: { msg: any; onApprove: () => void; onReject: () => void }) {
    const cfg = (LEVEL_STYLES as any)[msg.permissionLevel || 'DANGEROUS'] || LEVEL_STYLES.DANGEROUS;
    const { Icon } = cfg;

    return (
        <div className="flex justify-start">
            <div className={cn("max-w-[90%] rounded-lg px-3 py-2.5 border", cfg.bg, cfg.border)}>
                <div className="flex items-center gap-2">
                    <Icon size={14} className={cfg.color} />
                    <span className="text-sm font-medium text-[var(--text-primary)]">{msg.displayName || msg.toolName}</span>
                </div>
                <div className="mt-1.5">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", cfg.color, cfg.bg)}>
                        {msg.permissionLevel}
                    </span>
                </div>
                {msg.content && <p className="text-xs text-[var(--text-secondary)] mt-2">{msg.content}</p>}

                {msg.status === 'pending' && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-[var(--border)]">
                        <button onClick={onReject} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--surface)] hover:bg-red-500/20 text-xs text-[var(--text-secondary)] hover:text-red-400 transition-colors">
                            <X size={12} /> Reject
                        </button>
                        <button onClick={onApprove} className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors", cfg.btnBg, cfg.color)}>
                            <Check size={12} /> Approve
                        </button>
                        <span className="text-[10px] text-[var(--text-muted)] self-center ml-1">or say yes/no</span>
                    </div>
                )}

                {msg.status === 'approved' && (
                    <p className="text-xs text-[var(--safe)] mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-1">
                        <Check size={10} /> Approved
                    </p>
                )}
                {msg.status === 'rejected' && (
                    <p className="text-xs text-[var(--dangerous)] mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-1">
                        <X size={10} /> Rejected
                    </p>
                )}
            </div>
        </div>
    );
}

function MessageBubble({ msg, isStreaming, isLast, onApprove, onReject }: { msg: any; isStreaming: boolean; isLast: boolean; onApprove: (id: string) => void; onReject: (id: string) => void }) {
    if (msg.role === 'user') {
        return (
            <div className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md px-3 py-2 bg-[var(--accent)] text-white text-sm">{msg.content}</div>
            </div>
        );
    }

    if (msg.role === 'assistant') {
        return (
            <div className="flex justify-start">
                <div className="max-w-[80%] rounded-2xl rounded-bl-md px-3 py-2 bg-[var(--surface)] text-[var(--text-primary)] text-sm">
                    {msg.content || (isStreaming && isLast) ? (
                        <>
                            {msg.content}
                            {isStreaming && isLast && !msg.content && (
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
            <div className="flex justify-start">
                <div className="max-w-[90%] rounded-lg px-3 py-2 border bg-[var(--safe-glow)] border-[var(--safe)]/30">
                    <div className="flex items-center gap-2 text-xs">
                        <Check size={12} className="text-[var(--safe)]" />
                        <span className="text-[var(--text-secondary)]">{msg.displayName || msg.toolName}</span>
                    </div>
                    {msg.content && <p className="text-xs text-[var(--text-muted)] mt-1 truncate max-w-[250px]">{msg.content}</p>}
                </div>
            </div>
        );
    }

    if (msg.role === 'tool_confirm') {
        return <ToolConfirmBubble msg={msg} onApprove={() => onApprove(msg.pendingId)} onReject={() => onReject(msg.pendingId)} />;
    }

    return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export function VoiceVisual({ language, onLanguageChange, messages, isStreaming, onSend, onApprove, onReject, pendingConfirmId }: VoiceVisualProps) {
    const { isConnected, isRecording, isSpeaking, toggleRecording, onTranscription, onToolConfirm } = useVoice();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [textInput, setTextInput] = useState('');

    // Register transcription callback
    useEffect(() => {
        onTranscription((text: string) => onSend(text));
    }, [onTranscription, onSend]);

    // Register tool confirm callback
    useEffect(() => {
        onToolConfirm((approved: boolean) => {
            if (!pendingConfirmId) return;
            if (approved) onApprove(pendingConfirmId);
            else onReject(pendingConfirmId);
        });
    }, [onToolConfirm, pendingConfirmId, onApprove, onReject]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages, isStreaming]);

    const handleTextSend = () => {
        if (!textInput.trim() || isStreaming) return;
        onSend(textInput.trim());
        setTextInput('');
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-end px-4 py-2 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                    {!isConnected && <span className="text-xs text-[var(--dangerous)]">Disconnected</span>}
                    {isStreaming && <Loader2 size={14} className="animate-spin text-[var(--accent)]" />}
                    <button
                        onClick={() => onLanguageChange(language === 'th' ? 'en' : 'th')}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--surface)] hover:bg-[var(--surface-active)] text-xs text-[var(--text-secondary)]"
                    >
                        <Languages size={12} />{language === 'th' ? 'TH' : 'EN'}
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <p className="text-[var(--text-muted)] text-sm">
                            Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-mono text-xs">F8</kbd> or tap the mic to start
                        </p>
                    </div>
                )}

                {messages.map((msg: any, i: number) => (
                    <MessageBubble key={msg.id} msg={msg} isStreaming={isStreaming} isLast={i === messages.length - 1} onApprove={onApprove} onReject={onReject} />
                ))}

                {pendingConfirmId && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center">
                        <div className="px-3 py-1.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-xs text-[var(--accent)] animate-pulse">
                            Say "yes" or "no" to confirm
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Mic button + text input */}
            <div className="flex flex-col items-center gap-3 py-3 border-t border-[var(--border)]">
                <div className="flex items-center gap-2 w-full px-4">
                    <input
                        type="text"
                        value={textInput}
                        onChange={(e) => setTextInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSend(); } }}
                        placeholder="Type a message..."
                        className="flex-1 h-9 px-3 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <button
                        onClick={handleTextSend}
                        disabled={!textInput.trim() || isStreaming}
                        className="h-9 w-9 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-glow)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                    >
                        <Send size={16} className="text-white" />
                    </button>
                </div>
                <motion.button
                    onClick={toggleRecording}
                    disabled={!isConnected}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                        "relative flex items-center justify-center rounded-full transition-all duration-300",
                        !isConnected && "opacity-50 cursor-not-allowed",
                        isRecording ? "w-16 h-16 bg-gradient-to-br from-red-500 to-red-600" : "w-14 h-14 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-glow)]"
                    )}
                >
                    <AnimatePresence>
                        {isRecording && (
                            <>
                                <motion.div initial={{ scale: 1, opacity: 0.4 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }} className="absolute inset-0 rounded-full bg-red-500" />
                                <motion.div initial={{ scale: 1, opacity: 0.3 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }} className="absolute inset-0 rounded-full bg-red-500" />
                            </>
                        )}
                    </AnimatePresence>
                    {isRecording && isSpeaking && (
                        <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 0.4, repeat: Infinity }} className="absolute inset-0 rounded-full border-2 border-white" />
                    )}
                    <div className="text-white">{isRecording ? <MicOff size={22} /> : <Mic size={20} />}</div>
                </motion.button>
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">
                    {isRecording ? (isSpeaking ? 'Listening...' : 'Recording...') : 'F8 to toggle'}
                </p>
            </div>
        </div>
    );
}
