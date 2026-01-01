'use client';

import { useState, useCallback, useRef } from 'react';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    isStreaming?: boolean;
}

interface UseChatOptions {
    apiUrl?: string;
}

const DEFAULT_API_URL = 'http://localhost:3001/chat/stream';

/**
 * Chat hook with SSE streaming support
 */
export function useChat(options: UseChatOptions = {}) {
    const { apiUrl = DEFAULT_API_URL } = options;
    const [messages, setMessages] = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(
        async (content: string) => {
            if (!content.trim() || isLoading) return;

            // Add user message
            const userMessage: Message = {
                id: crypto.randomUUID(),
                role: 'user',
                content: content.trim(),
                timestamp: Date.now(),
            };

            // Add placeholder assistant message
            const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
            };

            setMessages((prev) => [...prev, userMessage, assistantMessage]);
            setIsLoading(true);
            setError(null);

            try {
                abortControllerRef.current?.abort();
                abortControllerRef.current = new AbortController();

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [...messages, userMessage].map((m) => ({
                            role: m.role,
                            content: m.content,
                        })),
                    }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`Chat error: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let buffer = '';
                let fullContent = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const block of lines) {
                        if (!block.trim()) continue;

                        const eventMatch = block.match(/^event: (.+)$/m);
                        const dataMatch = block.match(/^data: (.+)$/m);

                        if (eventMatch && dataMatch) {
                            try {
                                const event = eventMatch[1];
                                const data = JSON.parse(dataMatch[1]);

                                if (event === 'chunk' && data.content) {
                                    fullContent += data.content;
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === assistantMessage.id
                                                ? { ...m, content: fullContent }
                                                : m
                                        )
                                    );
                                }

                                if (event === 'done') {
                                    setMessages((prev) =>
                                        prev.map((m) =>
                                            m.id === assistantMessage.id
                                                ? { ...m, isStreaming: false }
                                                : m
                                        )
                                    );
                                }

                                if (event === 'error') {
                                    throw new Error(data.error);
                                }
                            } catch {
                                // Skip malformed events
                            }
                        }
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    setError(err);
                    setMessages((prev) =>
                        prev.map((m) =>
                            m.id === assistantMessage.id
                                ? { ...m, content: `Error: ${err.message}`, isStreaming: false }
                                : m
                        )
                    );
                }
            } finally {
                setIsLoading(false);
            }
        },
        [apiUrl, messages, isLoading]
    );

    const stopGeneration = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
        setMessages((prev) =>
            prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
        );
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        stopGeneration,
        clearMessages,
    };
}
