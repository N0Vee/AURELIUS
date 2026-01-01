'use client';

import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { MessageSquare } from 'lucide-react';
import type { Message } from '@/hooks/useChat';

interface ChatWindowProps {
    messages: Message[];
}

export function ChatWindow({ messages }: ChatWindowProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div
            ref={scrollRef}
            className="h-full overflow-y-auto p-6"
        >
            {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                    <div className="glass-strong rounded-full p-6 mb-6">
                        <MessageSquare size={40} className="text-[var(--accent)]" />
                    </div>
                    <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
                        Start a Conversation
                    </h2>
                    <p className="text-[var(--text-secondary)] max-w-md mb-6">
                        AURELIUS is ready to assist. Ask questions, get help with code, or control your system.
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                        {['What can you do?', 'Help me with code', 'Open a file'].map((suggestion) => (
                            <button
                                key={suggestion}
                                className="glass-strong px-4 py-2 rounded-full text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] transition-all"
                            >
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto space-y-6 pb-4">
                    {messages.map((message) => (
                        <MessageBubble key={message.id} message={message} />
                    ))}
                    {/* Scroll anchor */}
                    <div ref={messagesEndRef} />
                </div>
            )}
        </div>
    );
}
