'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { db } from '@/lib/db';

// ============================================================
// Types
// ============================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    images?: string[];
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

const API_BASES = [
    'http://127.0.0.1:3001',
    'http://localhost:3001',
];

const CHAT_STREAM_PATH = '/chat/stream';

function chatStreamUrl(base: string) { return `${base}${CHAT_STREAM_PATH}`; }
function approveUrl(base: string, pendingId: string) { return `${base}/api/tools/${pendingId}/approve`; }
function rejectUrl (base: string, pendingId: string) { return `${base}/api/tools/${pendingId}/reject`;  }

// ============================================================
// Error formatter
// ============================================================

function formatError(raw: string): string {
    const r = raw.toLowerCase();
    if (r.includes('402') || r.includes('insufficient credits') || r.includes('payment required') || r.includes('quota') || r.includes('billing')) {
        return 'Insufficient API credits. Add credits at openrouter.ai/settings/credits or switch to a free model.';
    }
    if (r.includes('401') || r.includes('unauthorized') || r.includes('invalid api key') || r.includes('missing auth')) {
        return 'API key is invalid or expired. Check your Settings.';
    }
    if (r.includes('429') || r.includes('rate limit')) {
        return 'Rate limit reached. Please wait a moment.';
    }
    if (r.includes('404') || r.includes('not found') || r.includes('no endpoints found')) {
        return 'Model not found or unavailable. Check the model name in Settings.';
    }
    if (r.includes('500') || r.includes('503') || r.includes('502')) {
        return 'The AI service is temporarily unavailable.';
    }
    if (r.includes('input stream') || r.includes('network') || r.includes('socket') || r.includes('econnrefused') || r.includes('enotfound')) {
        return 'Connection was interrupted.';
    }
    if (raw.length > 200) return raw.slice(0, 200) + '…';
    return raw;
}

// ============================================================
// Hook
// ============================================================

interface UseChatOptions {
    apiUrl?: string;
    /**
     * When provided, useChat will:
     * - Load persisted messages from IndexedDB for this session on mount
     * - Auto-save finalized messages to IndexedDB whenever they change
     * - Clear the session's DB messages when clearMessages() is called
     */
    sessionId?: string | null;
}

export function useChat(options: UseChatOptions = {}) {
    const { apiUrl, sessionId } = options;

    const [messages, setMessages]   = useState<Message[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]         = useState<Error | null>(null);

    const abortControllerRef   = useRef<AbortController | null>(null);
    const streamActiveRef      = useRef(false);
    const lastHistoryRef       = useRef<Array<{ role: string; content: string }>>([]);
    const lastAssistantIdRef   = useRef<string>('');
    const activeApiBaseRef     = useRef<string>(API_BASES[0]);

    // ----------------------------------------------------------
    // Load messages from IndexedDB when sessionId changes
    // ----------------------------------------------------------
    useEffect(() => {
        if (!sessionId) return;

        // Clear in-memory state immediately so the old session's messages
        // don't flash while the DB query is in-flight
        setMessages([]);

        db.messages
            .where('sessionId')
            .equals(sessionId)
            .sortBy('timestamp')
            .then((stored) => {
                const loaded = stored.map((row) => JSON.parse(row.data) as Message);
                setMessages(loaded);
            })
            .catch((err) => {
                console.error('[useChat] Failed to load messages from DB:', err);
            });
    }, [sessionId]);

    // ----------------------------------------------------------
    // Auto-save finalized messages to IndexedDB (debounced 400 ms)
    // ----------------------------------------------------------
    useEffect(() => {
        if (!sessionId) return;
        if (messages.length === 0) return;

        // Only persist messages that are no longer streaming
        const toSave = messages.filter(
            (m) => !('isStreaming' in m) || !(m as ChatMessage).isStreaming,
        );
        if (toSave.length === 0) return;

        const timer = setTimeout(async () => {
            try {
                await db.messages.bulkPut(
                    toSave.map((m) => ({
                        id: m.id,
                        sessionId: sessionId,
                        timestamp: m.timestamp,
                        // Strip isStreaming before storing — it's always false at rest
                        data: JSON.stringify(
                            'isStreaming' in m
                                ? { ...(m as ChatMessage), isStreaming: undefined }
                                : m,
                        ),
                    })),
                );

                // Bump the session's updatedAt so the sidebar re-sorts correctly
                await db.sessions.update(sessionId, { updatedAt: Date.now() });

                // Auto-title: if the session is still called 'New Chat', derive a
                // title from the first user message (up to 60 chars)
                const firstUser = toSave.find(
                    (m): m is ChatMessage => m.role === 'user',
                );
                if (firstUser) {
                    const session = await db.sessions.get(sessionId);
                    if (session?.title === 'New Chat') {
                        const derived = firstUser.content.slice(0, 60).trim();
                        if (derived) {
                            await db.sessions.update(sessionId, { title: derived });
                        }
                    }
                }
            } catch (err) {
                console.error('[useChat] Failed to persist messages to DB:', err);
            }
        }, 400);

        return () => clearTimeout(timer);
}, [messages, sessionId]);

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
                if (streamActiveRef.current) {
                    abortControllerRef.current?.abort();
                }
                abortControllerRef.current = new AbortController();
                streamActiveRef.current = true;

                const streamUrls = apiUrl
                    ? [apiUrl]
                    : [
                        chatStreamUrl(activeApiBaseRef.current),
                        ...API_BASES
                            .filter(base => base !== activeApiBaseRef.current)
                            .map(base => chatStreamUrl(base)),
                    ];

                let response: Response | null = null;
                let lastFetchError: unknown = null;

                for (const url of streamUrls) {
                    try {
                        response = await fetch(url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ messages: history }),
                            signal: abortControllerRef.current.signal,
                        });

                        if (response.ok) {
                            if (!apiUrl) {
                                const matchedBase = API_BASES.find(base => url.startsWith(base));
                                if (matchedBase) activeApiBaseRef.current = matchedBase;
                            }
                            break;
                        }

                        lastFetchError = new Error(`Chat error: ${response.status}`);
                    } catch (err) {
                        lastFetchError = err;
                    }
                }

                if (!response?.ok) {
                    throw (lastFetchError instanceof Error ? lastFetchError : new Error('Chat backend unavailable'));
                }

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
                if (err instanceof Error && err.name === 'AbortError') {
                    setMessages(prev =>
                        prev.map(m =>
                            m.id === assistantMsgId && m.role === 'assistant'
                                ? {
                                    ...m,
                                    content: fullContent || m.content,
                                    isStreaming: false,
                                }
                                : m,
                        ),
                    );
                } else if (err instanceof Error) {
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
                streamActiveRef.current = false;
                setIsLoading(false);
            }
        },
        [apiUrl],
    );

    // ----------------------------------------------------------
    // Send message — creates bubbles then runs the stream
    // ----------------------------------------------------------
    const sendMessage = useCallback(
        async (content: string, images?: string[]) => {
            if (!content.trim() || isLoading) return;

            const userMessage: ChatMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                content: content.trim(),
                ...(images && images.length > 0 ? { images } : {}),
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
                .map(m => {
                    const entry: { role: string; content: string; images?: string[] } = {
                        role: m.role,
                        content: m.content,
                    };
                    if (m.images && m.images.length > 0) {
                        entry.images = m.images;
                    }
                    return entry;
                });

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
            const bases = [activeApiBaseRef.current, ...API_BASES.filter(base => base !== activeApiBaseRef.current)];

            let res: Response | null = null;
            for (const base of bases) {
                try {
                    res = await fetch(approveUrl(base, pendingId), { method: 'POST' });
                    if (res.ok) {
                        activeApiBaseRef.current = base;
                        break;
                    }
                } catch {
                    // try next base
                }
            }

            if (!res?.ok) throw new Error(`Approve failed: ${res?.status ?? 'unreachable'}`);
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
            const bases = [activeApiBaseRef.current, ...API_BASES.filter(base => base !== activeApiBaseRef.current)];

            let res: Response | null = null;
            for (const base of bases) {
                try {
                    res = await fetch(rejectUrl(base, pendingId), { method: 'POST' });
                    if (res.ok) {
                        activeApiBaseRef.current = base;
                        break;
                    }
                } catch {
                    // try next base
                }
            }

            if (!res?.ok) throw new Error(`Reject failed: ${res?.status ?? 'unreachable'}`);
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
        if (streamActiveRef.current) {
            abortControllerRef.current?.abort();
        }
        streamActiveRef.current = false;
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
    // Clear all messages (in-memory + DB for current session)
    // ----------------------------------------------------------
    const clearMessages = useCallback(() => {
        // Abort any active stream so isLoading resets immediately
        // and the orphaned stream doesn't keep trying to update cleared messages
        if (streamActiveRef.current) {
            abortControllerRef.current?.abort();
        }
        streamActiveRef.current = false;
        setIsLoading(false);

        if (sessionId) {
            void db.messages.where('sessionId').equals(sessionId).delete();
            void db.sessions.update(sessionId, {
                title: 'New Chat',
                updatedAt: Date.now(),
            });
        }
        setMessages([]);
        setError(null);
        lastHistoryRef.current     = [];
        lastAssistantIdRef.current = '';
    }, [sessionId]);

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
