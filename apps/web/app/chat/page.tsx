'use client';

import { useState, FormEvent, useRef, useEffect } from 'react';
import { useChat } from '@/hooks/useChat';
import { ChatWindow } from './components/ChatWindow';
import { VoiceVisual } from './components/VoiceVisual';
import { Button } from '@/components/ui';
import { Send, Square, Trash2, MessageSquare, Mic, ArrowUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/components/layout/DesktopContext';

type Mode = 'chat' | 'voice';

export default function ChatPage() {
    const [mode, setMode] = useState<Mode>('chat');
    const [input, setInput] = useState('');
    const [language, setLanguage] = useState<'th' | 'en'>('th');
    const { messages, isLoading, sendMessage, retryLastMessage, stopGeneration, clearMessages, approveToolCall, rejectToolCall } = useChat();
    const isDesktop = useIsDesktop();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = (e: FormEvent | React.KeyboardEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            sendMessage(input);
            setInput('');
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    // ── DESKTOP OVERLAY LAYOUT ──────────────────────────────────────────────
    if (isDesktop) {
        return (
            <div
                className="flex flex-col h-full"
                style={{ background: 'transparent' }}
            >
                {/* ── Top bar (only shows when has messages) ─────── */}
                <AnimatePresence>
                    {messages.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.18 }}
                            className="flex items-center justify-between px-4 py-2 shrink-0"
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                        >
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setMode('chat')}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
                                    style={{
                                        background: mode === 'chat' ? 'rgba(245,158,11,0.15)' : 'transparent',
                                        color: mode === 'chat' ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                                        border: mode === 'chat' ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                                    }}
                                >
                                    <MessageSquare size={11} />
                                    Chat
                                </button>
                                <button
                                    onClick={() => setMode('voice')}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all"
                                    style={{
                                        background: mode === 'voice' ? 'rgba(245,158,11,0.15)' : 'transparent',
                                        color: mode === 'voice' ? '#f59e0b' : 'rgba(255,255,255,0.3)',
                                        border: mode === 'voice' ? '1px solid rgba(245,158,11,0.2)' : '1px solid transparent',
                                    }}
                                >
                                    <Mic size={11} />
                                    Voice
                                </button>
                            </div>
                            <button
                                onClick={clearMessages}
                                className="flex items-center gap-1 text-xs transition-colors"
                                style={{ color: 'rgba(255,255,255,0.2)' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                            >
                                <Trash2 size={11} />
                                Clear
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Messages / Voice area ──────────────────────── */}
                <div className="flex-1 min-h-0 overflow-hidden relative">
                    <AnimatePresence mode="wait">
                        {mode === 'chat' ? (
                            <motion.div
                                key="chat"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="h-full overflow-y-auto"
                                style={{
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: 'rgba(255,255,255,0.08) transparent',
                                }}
                            >
                                {messages.length === 0 ? (
                                    /* ── Empty state ─────────────────────────── */
                                    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                                        <motion.div
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 25 }}
                                        >
                                            <div
                                                className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 mx-auto"
                                                style={{
                                                    background: 'rgba(245,158,11,0.1)',
                                                    border: '1px solid rgba(245,158,11,0.2)',
                                                    boxShadow: '0 0 32px rgba(245,158,11,0.08)',
                                                }}
                                            >
                                                <span style={{ fontSize: '24px', color: '#f59e0b', fontWeight: 800 }}>A</span>
                                            </div>
                                        </motion.div>

                                        <motion.div
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.2 }}
                                        >
                                            <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
                                                How can I help you?
                                            </p>
                                            <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
                                                Ctrl+Shift+Space to hide
                                            </p>
                                        </motion.div>

                                        <motion.div
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: 0.3 }}
                                            className="flex flex-wrap gap-2 justify-center max-w-xs"
                                        >
                                            {['What time is it?', 'Search the web', 'Open Notepad', 'Take a screenshot'].map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => { setInput(s); textareaRef.current?.focus(); }}
                                                    className="px-3 py-1.5 rounded-full text-xs transition-all"
                                                    style={{
                                                        background: 'rgba(255,255,255,0.04)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        color: 'rgba(255,255,255,0.4)',
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.background = 'rgba(245,158,11,0.08)';
                                                        e.currentTarget.style.borderColor = 'rgba(245,158,11,0.2)';
                                                        e.currentTarget.style.color = 'rgba(245,158,11,0.8)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                                                        e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
                                                    }}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </motion.div>
                                    </div>
                                ) : (
                                    <ChatWindow
                                        messages={messages}
                                        onApproveToolCall={approveToolCall}
                                        onRejectToolCall={rejectToolCall}
                                        onRetry={retryLastMessage}
                                    />
                                )}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="voice"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="h-full"
                            >
                                <VoiceVisual language={language} onLanguageChange={setLanguage} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* ── Input Bar ──────────────────────────────────── */}
                {mode === 'chat' && (
                    <div
                        className="shrink-0 px-3 pb-3 pt-2"
                        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
                    >
                        <div
                            className="flex items-end gap-2 rounded-2xl px-4 py-3"
                            style={{
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.07)',
                            }}
                        >
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit(e);
                                    }
                                }}
                                placeholder="Ask AURELIUS anything..."
                                disabled={isLoading}
                                rows={1}
                                className="flex-1 bg-transparent resize-none focus:outline-none text-sm leading-relaxed"
                                style={{
                                    color: 'rgba(255,255,255,0.85)',
                                    caretColor: '#f59e0b',
                                    minHeight: '22px',
                                    maxHeight: '120px',
                                }}
                            />

                            <AnimatePresence mode="wait">
                                {isLoading ? (
                                    <motion.button
                                        key="stop"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        transition={{ duration: 0.12 }}
                                        type="button"
                                        onClick={stopGeneration}
                                        className="flex items-center justify-center rounded-xl shrink-0 transition-all"
                                        style={{
                                            width: '32px',
                                            height: '32px',
                                            background: 'rgba(239,68,68,0.15)',
                                            border: '1px solid rgba(239,68,68,0.25)',
                                            color: '#ef4444',
                                        }}
                                    >
                                        <Square size={12} />
                                    </motion.button>
                                ) : (
                                    <motion.button
                                        key="send"
                                        initial={{ scale: 0.8, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        exit={{ scale: 0.8, opacity: 0 }}
                                        transition={{ duration: 0.12 }}
                                        type="button"
                                        onClick={handleSubmit}
                                        disabled={!input.trim()}
                                        className="flex items-center justify-center rounded-xl shrink-0 transition-all"
                                        style={{
                                            width: '32px',
                                            height: '32px',
                                            background: input.trim() ? 'rgba(245,158,11,0.9)' : 'rgba(255,255,255,0.04)',
                                            border: input.trim() ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.07)',
                                            color: input.trim() ? '#000' : 'rgba(255,255,255,0.2)',
                                            cursor: input.trim() ? 'pointer' : 'default',
                                        }}
                                    >
                                        <ArrowUp size={14} />
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>
                        <p
                            className="text-center mt-1.5 text-xs"
                            style={{ color: 'rgba(255,255,255,0.12)' }}
                        >
                            ↵ send · shift+↵ newline
                        </p>
                    </div>
                )}
            </div>
        );
    }

    // ── STANDARD WEB LAYOUT ──────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-screen">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                        {mode === 'chat' ? 'Chat Mode' : 'Voice Mode'}
                    </h1>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearMessages}
                    disabled={messages.length === 0}
                    className="gap-2"
                >
                    <Trash2 size={16} />
                    Clear
                </Button>
            </header>

            {/* Main Content */}
            <AnimatePresence mode="wait">
                {mode === 'chat' ? (
                    <motion.div
                        key="chat"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 min-h-0 overflow-y-auto pb-56"
                    >
                        <ChatWindow
                            messages={messages}
                            onApproveToolCall={approveToolCall}
                            onRejectToolCall={rejectToolCall}
                            onRetry={retryLastMessage}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="voice"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 min-h-0"
                    >
                        <VoiceVisual language={language} onLanguageChange={setLanguage} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Input */}
            <AnimatePresence>
                {mode === 'chat' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-24 left-64 right-0 px-6 pointer-events-none"
                    >
                        <div className="max-w-3xl mx-auto pointer-events-auto">
                            <form onSubmit={handleSubmit} className="glass-strong rounded-2xl p-4 shadow-2xl">
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                    placeholder="Ask AURELIUS anything..."
                                    disabled={isLoading}
                                    rows={2}
                                    className="w-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none text-base leading-relaxed"
                                />
                                <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                                    <p className="text-xs text-[var(--text-muted)]">Enter to send</p>
                                    <div className="flex items-center gap-2">
                                        {isLoading ? (
                                            <Button type="button" variant="destructive" size="sm" onClick={stopGeneration} className="gap-1">
                                                <Square size={14} /> Stop
                                            </Button>
                                        ) : (
                                            <Button type="submit" size="sm" disabled={!input.trim()} className="gap-1">
                                                <Send size={14} /> Send
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mode Toggle */}
            <div className="fixed bottom-6 left-64 right-0 px-6 pointer-events-none">
                <div className="flex justify-center pointer-events-auto">
                    <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-1 shadow-xl">
                        <button
                            onClick={() => setMode('chat')}
                            className={cn(
                                'flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all',
                                mode === 'chat'
                                    ? 'bg-[var(--accent)] text-white shadow-sm'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                            )}
                        >
                            <MessageSquare size={16} /> Chat
                        </button>
                        <button
                            onClick={() => setMode('voice')}
                            className={cn(
                                'flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all',
                                mode === 'voice'
                                    ? 'bg-[var(--accent)] text-white shadow-sm'
                                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                            )}
                        >
                            <Mic size={16} /> Voice
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
