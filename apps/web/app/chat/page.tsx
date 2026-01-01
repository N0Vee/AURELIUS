'use client';

import { useState, FormEvent } from 'react';
import { useChat } from '@/hooks/useChat';
import { ChatWindow } from './components/ChatWindow';
import { Button } from '@/components/ui';
import { Send, Square, Trash2, Sparkles } from 'lucide-react';

export default function ChatPage() {
    const [input, setInput] = useState('');
    const { messages, isLoading, sendMessage, stopGeneration, clearMessages } = useChat();

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
                <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-muted)]">
                        <Sparkles size={18} className="text-[var(--accent)]" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                            Chat
                        </h1>
                        <p className="text-xs text-[var(--text-muted)]">
                            Powered by Llama 3.1
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

            {/* Chat Area - with padding for floating input */}
            <div className="flex-1 min-h-0 overflow-y-auto pb-40">
                <ChatWindow messages={messages} />
            </div>

            {/* Floating Input Area */}
            <div className="fixed bottom-6 left-64 right-0 px-6 pointer-events-none">
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
                            rows={3}
                            className="w-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none text-base leading-relaxed"
                        />
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
                            <p className="text-xs text-[var(--text-muted)]">
                                Press Enter to send, Shift+Enter for new line
                            </p>
                            <div className="flex gap-2">
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
            </div>
        </div>
    );
}
