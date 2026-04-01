'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export interface SessionTokens {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model: string;
    turnCount: number;
}

const EMPTY: SessionTokens = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: '',
    turnCount: 0,
};

export function useSessionTokens(sessionId: string | null): SessionTokens {
    const usage = useLiveQuery(
        () => (sessionId ? db.sessionUsage.get(sessionId) : undefined),
        [sessionId],
    );

    if (!usage) return EMPTY;

    return {
        promptTokens: usage.promptTokens ?? 0,
        completionTokens: usage.completionTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        model: usage.model ?? '',
        turnCount: usage.turnCount ?? 0,
    };
}
