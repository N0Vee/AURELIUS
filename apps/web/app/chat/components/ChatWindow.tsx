'use client';

import { useRef, useEffect } from 'react';
import { MessageBubble } from './MessageBubble';
import { ToolConfirmBubble, ToolAutoBubble } from './ToolConfirmBubble';
import { MessageSquare } from 'lucide-react';
import type { Message, ToolConfirmMessage, ToolAutoMessage, ChatMessage } from '@/hooks/useChat';

interface ChatWindowProps {
    messages: Message[];
    onApproveToolCall: (pendingId: string) => void;
    onRejectToolCall:  (pendingId: string) => void;
    onRetry?: () => void;
}

export function ChatWindow({ messages, onApproveToolCall, onRejectToolCall, onRetry }: ChatWindowProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    return (
        <div className="h-full overflow-y-auto p-3 sm:p-6 bg-transparent">
            {messages.length === 0 ? (
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
            ) : (
                <div className="max-w-full sm:max-w-4xl mx-auto space-y-3 sm:space-y-4 pb-4">
                    {messages.map((message) => {
                        if (message.role === 'tool_confirm') {
                            return (
                                <ToolConfirmBubble
                                    key={message.id}
                                    message={message as ToolConfirmMessage}
                                    onApprove={() => onApproveToolCall((message as ToolConfirmMessage).pendingId)}
                                    onReject={()  => onRejectToolCall ((message as ToolConfirmMessage).pendingId)}
                                />
                            );
                        }

                        if (message.role === 'tool_auto') {
                            return (
                                <ToolAutoBubble
                                    key={message.id}
                                    message={message as ToolAutoMessage}
                                />
                            );
                        }

                        return (
                            <MessageBubble
                                key={message.id}
                                message={message as ChatMessage}
                                onRetry={onRetry}
                            />
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>
            )}
        </div>
    );
}
