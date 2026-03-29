'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { ChatSession, SessionUsage } from '@/lib/db';

export interface SessionWithUsage extends ChatSession {
    usage: SessionUsage | null;
}

export interface DashboardStats {
    sessionCount:         number;
    messageCount:         number;
    totalTokens:          number;
    promptTokens:         number;
    completionTokens:     number;
    tokensToday:          number;
    recentSessions:       SessionWithUsage[];
    isReady:              boolean;
}

function todayStart(): number {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

export function useDashboardStats(): DashboardStats {
    const sessionCount = useLiveQuery(() => db.sessions.count(),  []);
    const messageCount = useLiveQuery(() => db.messages.count(),  []);
    const allUsage     = useLiveQuery(() => db.sessionUsage.toArray(), []);
    const rawSessions  = useLiveQuery(
        () => db.sessions.orderBy('updatedAt').reverse().limit(6).toArray(),
        [],
    );

    const isReady = sessionCount !== undefined && messageCount !== undefined;

    const safeUsage = allUsage ?? [];

    const totalTokens      = safeUsage.reduce((s, u) => s + u.totalTokens,      0);
    const promptTokens     = safeUsage.reduce((s, u) => s + u.promptTokens,     0);
    const completionTokens = safeUsage.reduce((s, u) => s + u.completionTokens, 0);

    const ts = todayStart();
    const tokensToday = safeUsage
        .filter(u => u.updatedAt >= ts)
        .reduce((s, u) => s + u.totalTokens, 0);

    const usageMap = new Map(safeUsage.map(u => [u.sessionId, u]));
    const recentSessions: SessionWithUsage[] = (rawSessions ?? []).map(s => ({
        ...s,
        usage: usageMap.get(s.id) ?? null,
    }));

    return {
        sessionCount:     sessionCount     ?? 0,
        messageCount:     messageCount     ?? 0,
        totalTokens,
        promptTokens,
        completionTokens,
        tokensToday,
        recentSessions,
        isReady,
    };
}
