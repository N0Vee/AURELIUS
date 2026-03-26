'use client';

import { useState, FormEvent } from 'react';
import { useChat } from '@/hooks/useChat';
import { ChatWindow } from './components/ChatWindow';
import { VoiceVisual } from './components/VoiceVisual';
import { Button } from '@/components/ui';
import { Send, Square, Trash2, MessageSquare, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

type Mode = 'chat' | 'voice';

export default function ChatPage() {
    const [mode, setMode] = useState<Mode>('chat');
    const [input, setInput] = useState('');
    const [language, setLanguage] = useState<'th' | 'en'>('th');
    const { messages, isLoading, sendMessage, retryLastMessage, stopGeneration, clearMessages, approveToolCall, rejectToolCall } = useChat();

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (input.trim() && !isLoading) {
            sendMessage(input);
            setInput('');
        }
    };

    return (
        <div className="flex flex-col h-screen">
            {/* Header */}
            <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-4">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-[var(--accent)] to-[var(--accent-glow)] flex items-center justify-center text-white font-medium text-sm shadow-lg shadow-[var(--accent)]/20 ring-2 ring-[var(--surface)]">
                        A
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                            AURELIUS
                        </h1>
                        <p className="text-xs text-[var(--text-muted)]">
                            {mode === 'chat' ? 'Chat Mode' : 'Voice Mode'}
                        </p>
                    </div>
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
                        <VoiceVisual
                            language={language}
                            onLanguageChange={setLanguage}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Floating Input Area - Only in Chat Mode */}
            <AnimatePresence>
                {mode === 'chat' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-24 left-64 right-0 px-6 pointer-events-none"
                    >
                        <div className="max-w-3xl mx-auto pointer-events-auto">
                            <form
                                onSubmit={handleSubmit}
                                className="glass-strong rounded-2xl p-4 shadow-2xl"
                            >
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
                                    <p className="text-xs text-[var(--text-muted)]">
                                        Enter to send
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {isLoading ? (
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                onClick={stopGeneration}
                                                className="gap-1"
                                            >
                                                <Square size={14} />
                                                Stop
                                            </Button>
                                        ) : (
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={!input.trim()}
                                                className="gap-1"
                                            >
                                                <Send size={14} />
                                                Send
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mode Toggle - Always at bottom center */}
            <div className="fixed bottom-6 left-64 right-0 px-6 pointer-events-none">
                <div className="flex justify-center pointer-events-auto">
                    <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-1 shadow-xl">
                        <button
                            onClick={() => setMode('chat')}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all",
                                mode === 'chat'
                                    ? "bg-[var(--accent)] text-white shadow-sm"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            )}
                        >
                            <MessageSquare size={16} />
                            Chat
                        </button>
                        <button
                            onClick={() => setMode('voice')}
                            className={cn(
                                "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all",
                                mode === 'voice'
                                    ? "bg-[var(--accent)] text-white shadow-sm"
                                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            )}
                        >
                            <Mic size={16} />
                            Voice
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
