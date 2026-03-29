'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { ChatSession } from '@/lib/db';

// ============================================================
// Constants
// ============================================================

const ACTIVE_SESSION_KEY = 'aurelius:activeSessionId';

// ============================================================
// Helpers
// ============================================================

function generateId(): string {
    return crypto.randomUUID();
}

function readStoredSessionId(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ACTIVE_SESSION_KEY);
}

function writeStoredSessionId(id: string | null): void {
    if (typeof window === 'undefined') return;
    if (id) {
        localStorage.setItem(ACTIVE_SESSION_KEY, id);
    } else {
        localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
}

// ============================================================
// Hook
// ============================================================

export interface UseChatSessionsReturn {
    /** All sessions ordered newest-first */
    sessions: ChatSession[];
    /** Whether Dexie has finished the first query */
    isReady: boolean;
    /** The currently active session id (null only during the very first load) */
    activeSessionId: string | null;
    /** Switch the active session */
    setActiveSessionId: (id: string) => void;
    /** Create a new session, switch to it, and return its id */
    createSession: (title?: string) => Promise<string>;
    /** Delete a session (and all its messages). Switches to the nearest remaining session. */
    deleteSession: (id: string) => Promise<void>;
    /** Rename an existing session */
    renameSession: (id: string, title: string) => Promise<void>;
    /** Bump the updatedAt timestamp — called by useChat after each save */
    touchSession: (id: string) => Promise<void>;
}

export function useChatSessions(): UseChatSessionsReturn {
    // ----------------------------------------------------------
    // Live query — re-renders automatically whenever sessions change
    // ----------------------------------------------------------
    const rawSessions = useLiveQuery(
        () => db.sessions.orderBy('updatedAt').reverse().toArray(),
        [],
    );

    // useLiveQuery returns undefined on the first render before the query resolves
    const sessions: ChatSession[] = rawSessions ?? [];
    const isReady = rawSessions !== undefined;

    // ----------------------------------------------------------
    // Active session state — seeded from localStorage
    // ----------------------------------------------------------
    const [activeSessionId, setActiveSessionIdState] = useState<string | null>(
        readStoredSessionId,
    );

    const setActiveSessionId = useCallback((id: string) => {
        setActiveSessionIdState(id);
        writeStoredSessionId(id);
    }, []);

    // ----------------------------------------------------------
    // CRUD operations
    // ----------------------------------------------------------

    const createSession = useCallback(
        async (title?: string): Promise<string> => {
            const id = generateId();
            const now = Date.now();

            await db.sessions.add({
                id,
                title: title ?? 'New Chat',
                createdAt: now,
                updatedAt: now,
            });

            setActiveSessionId(id);
            return id;
        },
        [setActiveSessionId],
    );

    const deleteSession = useCallback(
        async (id: string): Promise<void> => {
            // Remove all messages belonging to this session first
            await db.messages.where('sessionId').equals(id).delete();
            await db.sessions.delete(id);

            // If we just deleted the active session, switch to the next best one
            if (activeSessionId === id) {
                // rawSessions may lag one tick — query directly for accuracy
                const remaining = await db.sessions
                    .orderBy('updatedAt')
                    .reverse()
                    .toArray();

                if (remaining.length > 0) {
                    setActiveSessionId(remaining[0].id);
                } else {
                    // No sessions left — create a fresh one automatically
                    await createSession();
                }
            }
        },
        [activeSessionId, setActiveSessionId, createSession],
    );

    const renameSession = useCallback(
        async (id: string, title: string): Promise<void> => {
            await db.sessions.update(id, { title: title.trim() || 'New Chat' });
        },
        [],
    );

    const touchSession = useCallback(async (id: string): Promise<void> => {
        await db.sessions.update(id, { updatedAt: Date.now() });
    }, []);

    // ----------------------------------------------------------
    // Initialisation effect
    // Runs once after Dexie resolves the first query.
    // Ensures there is always at least one session and that the
    // stored active id actually points to a real session.
    // ----------------------------------------------------------
    useEffect(() => {
        if (!isReady) return;

        const init = async () => {
            // Case 1: No sessions at all — bootstrap the first one
            if (sessions.length === 0) {
                await createSession();
                return;
            }

            // Case 2: No active session stored, or stored id no longer exists
            const storedId = readStoredSessionId();
            const stillExists = storedId
                ? sessions.some((s) => s.id === storedId)
                : false;

            if (!storedId || !stillExists) {
                // Fall back to the most recently updated session
                setActiveSessionId(sessions[0].id);
            }
        };

        void init();
        // We only want to run this once after the first successful query
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady]);

    // ----------------------------------------------------------
    // Return
    // ----------------------------------------------------------
    return {
        sessions,
        isReady,
        activeSessionId,
        setActiveSessionId,
        createSession,
        deleteSession,
        renameSession,
        touchSession,
    };
}
