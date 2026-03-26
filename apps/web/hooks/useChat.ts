'use client';

import { useState, useCallback, useRef } from 'react';

// ============================================================
// Types
// ============================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    isStreaming?: boolean;
}

export interface ToolConfirmMessage {
    id: string;
    role: 'tool_confirm';
    pendingId: string;
    toolName: string;
    displayName: string;
    description: string;
    permissionLevel: 'SAFE' | 'SENSITIVE' | 'DANGEROUS';
    args: Record<string, unknown>;
    status: 'pending' | 'approved' | 'rejected';
    timestamp: number;
}

export interface ToolAutoMessage {
    id: string;
    role: 'tool_auto';
    toolName: string;
    displayName: string;
    result: string;
    timestamp: number;
}

export type Message = ChatMessage | ToolConfirmMessage | ToolAutoMessage;

// ============================================================
// Constants
// ============================================================

const API_BASE        = 'http://localhost:3001';
const CHAT_STREAM_URL = `${API_BASE}/chat/stream`;

function approveUrl(pendingId: string) { return `${API_BASE}/api/tools/${pendingId}/approve`; }
function rejectUrl (pendingId: string) { return `${API_BASE}/api/tools/${pendingId}/reject`;  }

// ============================================================
// Error formatter
// ============================================================

function formatError(raw: string): string {
    const r = raw.toLowerCase();
    if (r.includes('input stream') || r.includes('stream') || r.includes('network') || r.includes('socket')) {
        return 'Connection was interrupted.';
    }
    if (r.includes('401') || r.includes('unauthorized')) {
        return 'API key is invalid or expired. Check your Settings.';
    }
    if (r.includes('429') || r.includes('rate limit')) {
        return 'Rate limit reached. Please wait a moment.';
    }
    if (r.includes('500') || r.includes('503') || r.includes('502')) {
        return 'The AI service is temporarily unavailable.';
    }
    if (raw.length > 120) return 'Something went wrong.';
    return raw;
}

// ============================================================
// Hook
// ============================================================

interface UseChatOptions {
    apiUrl?: string;
}

export function useChat(options: UseChatOptions = {}) {
    const { apiUrl = CHAT_STREAM_URL } = options;

    const [messages, setMessages]   = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]         = useState<Error | null>(null);

    const abortControllerRef   = useRef<AbortController | null>(null);
    const lastHistoryRef       = useRef<Array<{ role: string; content: string }>>([]);
    const lastAssistantIdRef   = useRef<string>('');

    // ----------------------------------------------------------
    // Core stream runner
    // Fetches the SSE stream and updates messages in place.
    // Both sendMessage and retryLastMessage use this.
    // ----------------------------------------------------------
    const runStream = useCallback(
        async (
            history: Array<{ role: string; content: string }>,
            assistantMsgId: string,
        ) => {
            setIsLoading(true);
            setError(null);

            let fullContent = '';

            try {
                abortControllerRef.current?.abort();
                abortControllerRef.current = new AbortController();

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: history }),
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) throw new Error(`Chat error: ${response.status}`);

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const blocks = buffer.split('\n\n');
                    buffer = blocks.pop() ?? '';

                    for (const block of blocks) {
                        if (!block.trim()) continue;

                        const eventMatch = block.match(/^event: (.+)$/m);
                        const dataMatch  = block.match(/^data: (.+)$/m);
                        if (!eventMatch || !dataMatch) continue;

                        const event = eventMatch[1].trim();

                        let data: Record<string, unknown>;
                        try {
                            data = JSON.parse(dataMatch[1]) as Record<string, unknown>;
                        } catch {
                            continue;
                        }

                        // ── Text chunk ────────────────────────────────────
                        if (event === 'chunk') {
                            const chunk = String(data.content ?? '');
                            fullContent += chunk;
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantMsgId && m.role === 'assistant'
                                        ? { ...m, content: fullContent }
                                        : m,
                                ),
                            );
                        }

                        // ── SAFE tool ran automatically ───────────────────
                        else if (event === 'tool_auto') {
                            const autoMsg: ToolAutoMessage = {
                                id: crypto.randomUUID(),
                                role: 'tool_auto',
                                toolName:    String(data.toolName    ?? ''),
                                displayName: String(data.displayName ?? data.toolName ?? ''),
                                result:      String(data.result      ?? ''),
                                timestamp:   Date.now(),
                            };
                            setMessages(prev => {
                                const idx = prev.findIndex(m => m.id === assistantMsgId);
                                if (idx === -1) return [...prev, autoMsg];
                                const next = [...prev];
                                next.splice(idx, 0, autoMsg);
                                return next;
                            });
                        }

                        // ── Needs confirmation ────────────────────────────
                        else if (event === 'tool_confirm') {
                            const confirmMsg: ToolConfirmMessage = {
                                id:              crypto.randomUUID(),
                                role:            'tool_confirm',
                                pendingId:       String(data.id          ?? ''),
                                toolName:        String(data.toolName    ?? ''),
                                displayName:     String(data.displayName ?? data.toolName ?? ''),
                                description:     String(data.description ?? ''),
                                permissionLevel: (data.permissionLevel as ToolConfirmMessage['permissionLevel']) ?? 'DANGEROUS',
                                args:            (data.args as Record<string, unknown>) ?? {},
                                status:          'pending',
                                timestamp:       Date.now(),
                            };
                            setMessages(prev => {
                                const idx = prev.findIndex(m => m.id === assistantMsgId);
                                if (idx === -1) return [...prev, confirmMsg];
                                const next = [...prev];
                                next.splice(idx, 0, confirmMsg);
                                return next;
                            });
                        }

                        // ── Tool was executed after approval ──────────────
                        else if (event === 'tool_executed') {
                            const pendingId = String(data.pendingId ?? '');
                            setMessages(prev =>
                                prev.map(m =>
                                    m.role === 'tool_confirm' && m.pendingId === pendingId
                                        ? { ...m, status: 'approved' as const }
                                        : m,
                                ),
                            );
                        }

                        // ── Tool was rejected ─────────────────────────────
                        else if (event === 'tool_rejected') {
                            const pendingId = String(data.pendingId ?? '');
                            setMessages(prev =>
                                prev.map(m =>
                                    m.role === 'tool_confirm' && m.pendingId === pendingId
                                        ? { ...m, status: 'rejected' as const }
                                        : m,
                                ),
                            );
                        }

                        // ── Stream complete ───────────────────────────────
                        else if (event === 'done') {
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantMsgId && m.role === 'assistant'
                                        ? { ...m, isStreaming: false }
                                        : m,
                                ),
                            );
                        }

                        // ── Error from backend ────────────────────────────
                        else if (event === 'error') {
                            throw new Error(String(data.error ?? 'Unknown stream error'));
                        }
                    }
                }
            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    const friendly = formatError(err.message);
                    setError(new Error(friendly));
                    setMessages(prev =>
                        prev.map(m =>
                            m.id === assistantMsgId && m.role === 'assistant'
                                ? { ...m, content: friendly, isStreaming: false }
                                : m,
                        ),
                    );
                }
            } finally {
                setIsLoading(false);
            }
        },
        [apiUrl],
    );

    // ----------------------------------------------------------
    // Send message — creates bubbles then runs the stream
    // ----------------------------------------------------------
    const sendMessage = useCallback(
        async (content: string) => {
            if (!content.trim() || isLoading) return;

            const userMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                content: content.trim(),
                timestamp: Date.now(),
            };

            const assistantMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: '',
                timestamp: Date.now(),
                isStreaming: true,
            };

            setMessages(prev => [...prev, userMessage, assistantMessage]);

            // Build context — chat messages only (no tool_confirm / tool_auto)
            const history = [...messages, userMessage]
                .filter((m): m is ChatMessage => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content }));

            // Store for retry
            lastHistoryRef.current     = history;
            lastAssistantIdRef.current = assistantMessage.id;

            await runStream(history, assistantMessage.id);
        },
        [messages, isLoading, runStream],
    );

    // ----------------------------------------------------------
    // Retry — resets the error bubble and re-runs the same stream
    // ----------------------------------------------------------
    const retryLastMessage = useCallback(async () => {
        if (isLoading || lastHistoryRef.current.length === 0) return;

        const assistantId = lastAssistantIdRef.current;

        // Reset the error assistant bubble back to streaming state
        setMessages(prev =>
            prev.map(m =>
                m.id === assistantId && m.role === 'assistant'
                    ? { ...m, content: '', isStreaming: true }
                    : m,
            ),
        );

        setError(null);

        await runStream(lastHistoryRef.current, assistantId);
    }, [isLoading, runStream]);

    // ----------------------------------------------------------
    // Approve a pending tool call
    // ----------------------------------------------------------
    const approveToolCall = useCallback(async (pendingId: string) => {
        setMessages(prev =>
            prev.map(m =>
                m.role === 'tool_confirm' && m.pendingId === pendingId
                    ? { ...m, status: 'approved' as const }
                    : m,
            ),
        );

        try {
            const res = await fetch(approveUrl(pendingId), { method: 'POST' });
            if (!res.ok) throw new Error(`Approve failed: ${res.status}`);
        } catch {
            setMessages(prev =>
                prev.map(m =>
                    m.role === 'tool_confirm' && m.pendingId === pendingId
                        ? { ...m, status: 'pending' as const }
                        : m,
                ),
            );
        }
    }, []);

    // ----------------------------------------------------------
    // Reject a pending tool call
    // ----------------------------------------------------------
    const rejectToolCall = useCallback(async (pendingId: string) => {
        setMessages(prev =>
            prev.map(m =>
                m.role === 'tool_confirm' && m.pendingId === pendingId
                    ? { ...m, status: 'rejected' as const }
                    : m,
            ),
        );

        try {
            const res = await fetch(rejectUrl(pendingId), { method: 'POST' });
            if (!res.ok) throw new Error(`Reject failed: ${res.status}`);
        } catch {
            setMessages(prev =>
                prev.map(m =>
                    m.role === 'tool_confirm' && m.pendingId === pendingId
                        ? { ...m, status: 'pending' as const }
                        : m,
                ),
            );
        }
    }, []);

    // ----------------------------------------------------------
    // Stop generation
    // ----------------------------------------------------------
    const stopGeneration = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsLoading(false);
        setMessages(prev =>
            prev.map(m =>
                m.role === 'assistant' && m.isStreaming
                    ? { ...m, isStreaming: false }
                    : m,
            ),
        );
    }, []);

    // ----------------------------------------------------------
    // Clear all messages
    // ----------------------------------------------------------
    const clearMessages = useCallback(() => {
        setMessages([]);
        setError(null);
        lastHistoryRef.current     = [];
        lastAssistantIdRef.current = '';
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        retryLastMessage,
        stopGeneration,
        clearMessages,
        approveToolCall,
        rejectToolCall,
    };
}
