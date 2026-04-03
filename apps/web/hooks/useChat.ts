'use client';

/**
 * Vercel AI SDK chat hook (v2).
 *
 * Wraps `@ai-sdk/react` `useChat` with Aurelius-specific behaviours:
 *  - IndexedDB persistence (Dexie) for messages and sessions
 *  - Backend fallback URLs (127.0.0.1 → localhost)
 *  - AI SDK approval handling for SENSITIVE / DANGEROUS tools via
 *    `approval-requested` / `addToolApprovalResponse`
 *  - IndexedDB migration for stale pre-approval `input-available` tool calls,
 *    rewriting them to `output-denied` so later sends stay valid
 *  - Auto-send after all client-handled tool calls or approval responses
 *    are resolved, including explicit denials
 *  - Assistant-message resync after tool state changes so persisted
 *    sessions do not reload stale approval-requested tool calls
 */

import { useChat as useAIChat } from '@ai-sdk/react';
import {
    DefaultChatTransport,
    isToolUIPart,
    jsonSchema,
    lastAssistantMessageIsCompleteWithApprovalResponses,
    type UIMessage,
} from 'ai';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { db, type PersistedMessage } from '@/lib/db';

// ============================================================
// Message metadata schema (usage data sent by the backend)
// ============================================================

interface ChatMessageMetadata {
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model?: string;
}

const chatMetadataSchema = jsonSchema<ChatMessageMetadata>({
    type: 'object',
    properties: {
        usage: {
            type: 'object',
            properties: {
                promptTokens: { type: 'number' },
                completionTokens: { type: 'number' },
                totalTokens: { type: 'number' },
            },
        },
        model: { type: 'string' },
    },
});

// ============================================================
// Constants
// ============================================================

const API_BASES = [
    'http://127.0.0.1:4243',
    'http://localhost:4243',
];

const V2_STREAM_PATH = '/v2/chat/stream';

// Monotonically increasing counter to keep message insertion order
// within the same millisecond (user + assistant saved nearly together).
let saveSeq = 0;

// ============================================================
// Hook
// ============================================================

interface UseChatOptions {
    sessionId?: string | null;
    sessionTitle?: string | null;
    voiceMode?: boolean;
}

interface SendMessageOptions {
    voiceMode?: boolean;
}

function serializeMessageRow(message: UIMessage, sessionId: string, timestamp: number): PersistedMessage {
    return {
        id: message.id,
        sessionId,
        timestamp,
        data: JSON.stringify(message),
    };
}

function findLatestToolPart(messages: UIMessage[], toolCallId: string) {
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
        const message = messages[messageIndex];
        if (!Array.isArray(message.parts)) continue;

        for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
            const part = message.parts[partIndex];
            if (isToolUIPart(part) && part.toolCallId === toolCallId) {
                return part;
            }
        }
    }

    return null;
}

function getApprovalId(part: ReturnType<typeof findLatestToolPart>): string | null {
    if (
        part?.state === 'approval-requested'
        && 'approval' in part
        && typeof part.approval === 'object'
        && part.approval !== null
        && 'id' in part.approval
        && typeof part.approval.id === 'string'
    ) {
        return part.approval.id;
    }

    return null;
}

export function useChat(options: UseChatOptions = {}) {
    const { sessionId, sessionTitle, voiceMode = false } = options;

    // Refs so the transport body closure always reads the latest values
    // without the transport instance being recreated on every render.
    const sessionIdRef = useRef(sessionId);
    const sessionTitleRef = useRef(sessionTitle);
    const voiceModeRef = useRef(voiceMode);
    const apiBaseRef = useRef(API_BASES[0]);

    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
    useEffect(() => { sessionTitleRef.current = sessionTitle; }, [sessionTitle]);
    useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

    // DB load guard — prevents the auto-save effect from clearing
    // messages before the DB query finishes on session switch.
    const [dbLoaded, setDbLoaded] = useState(false);

    // Track which message IDs we've already persisted so we never
    // overwrite timestamps or duplicate writes.
    const savedIdsRef = useRef<Set<string>>(new Set());
    const messageTimestampsRef = useRef<Map<string, number>>(new Map());

    const getMessageTimestamp = useCallback((messageId: string) => {
        const existing = messageTimestampsRef.current.get(messageId);
        if (existing != null) {
            return existing;
        }

        const timestamp = Date.now() + (++saveSeq % 1000) * 0.001;
        messageTimestampsRef.current.set(messageId, timestamp);
        return timestamp;
    }, []);

    // ── Transport (created once) ──────────────────────────────────────────
    const customFetch = async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const bases = [
            apiBaseRef.current,
            ...API_BASES.filter((base) => base !== apiBaseRef.current),
        ];

        for (const base of bases) {
            try {
                const url = `${base}${V2_STREAM_PATH}`;
                const res = await globalThis.fetch(url, init);
                if (res.ok) {
                    apiBaseRef.current = base;
                    return res;
                }
            } catch {
                // try next
            }
        }
        throw new Error('Chat backend unavailable');
    };

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: `${API_BASES[0]}${V2_STREAM_PATH}`,
                body: () => ({
                    session_id: sessionIdRef.current,
                    session_title: sessionTitleRef.current,
                    voice_mode: voiceModeRef.current,
                }),
                fetch: customFetch as typeof globalThis.fetch,
            }),
        [], // stable — body reads refs
    );

    // ── Core useChat hook ─────────────────────────────────────────────────
    const chat = useAIChat({
        id: sessionId ?? undefined,
        transport,
        messageMetadataSchema: chatMetadataSchema,

        // Continue automatically once the user has responded to all pending
        // approval requests in the last assistant message.
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,

        onFinish: async ({ message }) => {
            const sid = sessionIdRef.current;
            if (!sid) return;
            if (savedIdsRef.current.has(message.id)) return;
            try {
                savedIdsRef.current.add(message.id);
                await db.messages.put(serializeMessageRow(message, sid, getMessageTimestamp(message.id)));
                await db.sessions.update(sid, { updatedAt: Date.now() });
            } catch (err: unknown) {
                savedIdsRef.current.delete(message.id);
                console.error('[useChat] Failed to persist assistant message:', err);
            }

            // Persist token usage for the session token bar
            const meta = message.metadata as ChatMessageMetadata | undefined;
            if (meta?.usage) {
                try {
                    const existing = await db.sessionUsage.get(sid);
                    await db.sessionUsage.put({
                        sessionId: sid,
                        promptTokens: (existing?.promptTokens ?? 0) + (meta.usage.promptTokens ?? 0),
                        completionTokens: (existing?.completionTokens ?? 0) + (meta.usage.completionTokens ?? 0),
                        totalTokens: (existing?.totalTokens ?? 0) + (meta.usage.totalTokens ?? 0),
                        model: meta.model ?? existing?.model ?? '',
                        turnCount: (existing?.turnCount ?? 0) + 1,
                        updatedAt: Date.now(),
                    });
                } catch (err) {
                    console.error('[useChat] Failed to persist usage:', err);
                }
            }
        },

        onError: (error) => {
            console.error('[useChat] Stream error:', error.message);
        },
    });
    const { addToolOutput } = chat;

    const messagesRef = useRef<UIMessage[]>(chat.messages);

    useEffect(() => {
        messagesRef.current = chat.messages;
    }, [chat.messages]);

    // ── Load messages from IndexedDB on session switch ────────────────────
    useEffect(() => {
        // Capture the session ID at effect start so we can check for staleness
        const targetSessionId = sessionId;

        if (!targetSessionId) {
            chat.setMessages([]);
            savedIdsRef.current = new Set();
            messageTimestampsRef.current = new Map();
            setDbLoaded(true);
            return;
        }

        setDbLoaded(false);
        chat.setMessages([]);
        savedIdsRef.current = new Set();
        messageTimestampsRef.current = new Map();

        db.messages
            .where('[sessionId+timestamp]')
            .between([targetSessionId, -Infinity], [targetSessionId, Infinity])
            .sortBy('timestamp')
            .then((stored) => {
                // Guard: if the session changed while we were loading, discard
                if (sessionIdRef.current !== targetSessionId) return;

                const loaded = stored.map((r) => {
                    const raw = JSON.parse(r.data);
                    // Migrate v1 messages (have .content string, no .parts)
                    if (!raw.parts && typeof raw.content === 'string') {
                        raw.parts = raw.content
                            ? [{ type: 'text', text: raw.content }]
                            : [];
                    }

                    if (Array.isArray(raw.parts)) {
                        raw.parts = raw.parts.map((part: Record<string, unknown>) => {
                            if (
                                part.state === 'input-available'
                                && (part as { providerExecuted?: boolean }).providerExecuted !== true
                            ) {
                                return {
                                    ...part,
                                    state: 'output-denied',
                                };
                            }

                            if (
                                part.state === 'approval-responded'
                                && typeof part.approval === 'object'
                                && part.approval !== null
                                && (part.approval as { approved?: boolean }).approved === false
                            ) {
                                return {
                                    ...part,
                                    state: 'output-denied',
                                };
                            }

                            return part;
                        });
                    }

                    return raw as UIMessage;
                });

                // Pre-populate saved IDs so auto-save doesn't re-persist them
                savedIdsRef.current = new Set(stored.map((r) => r.id));
                messageTimestampsRef.current = new Map(stored.map((r) => [r.id, r.timestamp]));
                chat.setMessages(loaded);
                setDbLoaded(true);
            })
            .catch((err: unknown) => {
                if (sessionIdRef.current !== targetSessionId) return;
                console.error('[useChat] DB load failed:', err);
                setDbLoaded(true);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    // ── Auto-save user messages (assistant saved via onFinish) ────────────
    useEffect(() => {
        if (!sessionId || !dbLoaded) return;

        const userMsgs = chat.messages.filter((m) => m.role === 'user');
        if (userMsgs.length === 0) return;

        // Only save messages we haven't persisted yet (tracked in-memory)
        const newUserMsgs = userMsgs.filter((m) => !savedIdsRef.current.has(m.id));
        if (newUserMsgs.length === 0) return;

        const sid = sessionId; // capture for closure
        const timer = setTimeout(async () => {
            // Re-check: session may have changed during the debounce
            if (sessionIdRef.current !== sid) return;

            try {
                await db.messages.bulkPut(
                    newUserMsgs.map((m) => {
                        savedIdsRef.current.add(m.id);
                        return serializeMessageRow(m, sid, getMessageTimestamp(m.id));
                    }),
                );

                // Auto-title: derive from first user message
                const first = userMsgs[0];
                if (first) {
                    const session = await db.sessions.get(sid);
                    if (session?.title === 'New Chat') {
                        const text =
                            first.parts?.find((p): p is { type: 'text'; text: string } => p.type === 'text')
                                ?.text ?? '';
                        const derived = text.slice(0, 60).trim();
                        if (derived) {
                            await db.sessions.update(sid, { title: derived });
                        }
                    }
                }
            } catch (err) {
                // Roll back tracked IDs so next attempt can retry
                for (const m of newUserMsgs) savedIdsRef.current.delete(m.id);
                console.error('[useChat] Failed to save user messages:', err);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [chat.messages, sessionId, dbLoaded, getMessageTimestamp]);

    // ── Persist assistant message mutations after tool approval/output ───
    useEffect(() => {
        if (!sessionId || !dbLoaded) return;

        const assistantMsgs = chat.messages.filter(
            (m) => m.role === 'assistant' && savedIdsRef.current.has(m.id),
        );
        if (assistantMsgs.length === 0) return;

        const timer = setTimeout(async () => {
            if (sessionIdRef.current !== sessionId) return;

            try {
                await db.messages.bulkPut(
                    assistantMsgs.map((message) => {
                        savedIdsRef.current.add(message.id);
                        return serializeMessageRow(message, sessionId, getMessageTimestamp(message.id));
                    }),
                );
                await db.sessions.update(sessionId, { updatedAt: Date.now() });
            } catch (err) {
                console.error('[useChat] Failed to sync assistant messages:', err);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [chat.messages, sessionId, dbLoaded, getMessageTimestamp]);

    // ── Approve a tool call ───────────────────────────────────────────────
    const approveToolCall = useCallback(
        async (toolCallId: string, toolName: string) => {
            const part = findLatestToolPart(messagesRef.current, toolCallId);
            const approvalId = getApprovalId(part);

            if (approvalId) {
                const wasStreaming = chat.status === 'streaming' || chat.status === 'submitted';

                await chat.addToolApprovalResponse({
                    id: approvalId,
                    approved: true,
                });

                // When the approval arrives before the previous response fully
                // closes, stop that tail so the SDK can continue immediately.
                if (wasStreaming) {
                    await chat.stop();
                }

                return;
            }

            addToolOutput({
                toolCallId,
                tool: toolName as never,
                state: 'output-error',
                errorText: 'Tool approval is no longer valid. Ask the assistant to try again.',
            });
        },
        [addToolOutput, chat],
    );

    // ── Reject a tool ─────────────────────────────────────────────────────
    const rejectToolCall = useCallback(
        async (toolCallId: string, toolName: string) => {
            const part = findLatestToolPart(messagesRef.current, toolCallId);
            const approvalId = getApprovalId(part);

            if (approvalId) {
                const wasStreaming = chat.status === 'streaming' || chat.status === 'submitted';

                await chat.addToolApprovalResponse({
                    id: approvalId,
                    approved: false,
                });

                if (wasStreaming) {
                    await chat.stop();
                }

                return;
            }

            const addDeniedToolOutput = addToolOutput as unknown as (args: {
                toolCallId: string;
                tool: never;
                state: 'output-denied';
            }) => void;

            addDeniedToolOutput({
                toolCallId,
                tool: toolName as never,
                state: 'output-denied',
            });
        },
        [addToolOutput, chat],
    );

    // ── Send a text message with optional image attachments ──────────────
    const sendMessage = useCallback(
        async (content: string, images?: string[], options?: SendMessageOptions) => {
            if (!content.trim() && (!images || images.length === 0)) return;

            if (typeof options?.voiceMode === 'boolean') {
                voiceModeRef.current = options.voiceMode;
            }

            const text = content.trim();

            if (images && images.length > 0) {
                // Convert base64 data-URLs to FileUIPart[]
                const files = images.map((dataUrl, index) => {
                    // data:image/png;base64,iVBOR... → extract mediaType + raw base64
                    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
                    const mediaType = match?.[1] ?? 'image/png';
                    const extension = mediaType.split('/')[1] ?? 'png';

                    return {
                        type: 'file' as const,
                        url: dataUrl,
                        mediaType,
                        filename: `attachment-${index + 1}.${extension}`,
                    };
                });
                await chat.sendMessage({ text, files });
            } else {
                await chat.sendMessage({ text });
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chat.sendMessage],
    );

    // ── Clear messages ────────────────────────────────────────────────────
    const clearMessages = useCallback(async () => {
        await chat.stop();
        chat.setMessages([]);
        savedIdsRef.current = new Set();
        messageTimestampsRef.current = new Map();

        if (sessionId) {
            await db.transaction('rw', db.messages, db.sessionUsage, db.sessions, async () => {
                await db.messages.where('sessionId').equals(sessionId).delete();
                await db.sessionUsage.where('sessionId').equals(sessionId).delete();
                await db.sessions.update(sessionId, {
                    title: 'New Chat',
                    updatedAt: Date.now(),
                });
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, chat.stop, chat.setMessages]);

    // ── Public API ────────────────────────────────────────────────────────
    return {
        /** Current messages in UIMessage format (with `parts[]`) */
        messages: chat.messages,
        /** Chat status: 'submitted' | 'streaming' | 'ready' | 'error' */
        status: chat.status,
        /** Convenience boolean matching v1 hook's isLoading */
        isLoading: chat.status === 'submitted' || chat.status === 'streaming',
        /** Current error (undefined when healthy) */
        error: chat.error,

        sendMessage,
        /** Regenerate the last assistant response */
        regenerate: chat.regenerate,
        /** Abort the active stream */
        stop: chat.stop,
        clearMessages,
        setMessages: chat.setMessages,

        /** Approve a pending tool call */
        approveToolCall,
        /** Reject a pending tool call */
        rejectToolCall,
    };
}
