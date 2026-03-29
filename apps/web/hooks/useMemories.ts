'use client';

import { useState, useCallback, useEffect } from 'react';

// ============================================================
// Types
// ============================================================

export interface MemoryEntry {
    id: string;
    type: 'conversation' | 'fact' | 'preference' | 'task' | 'note';
    content: string;
    embedding?: number[];
    metadata?: Record<string, unknown>;
    lifecycle: 'ephemeral' | 'short_term' | 'long_term' | 'archived';
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
    accessCount: number;
    lastAccessedAt?: number;
}

export interface MemorySearchResult {
    entry: MemoryEntry;
    similarity: number;
}

// ============================================================
// API URL resolution (same pattern as useChat.ts)
// ============================================================

const API_BASE = 'http://localhost:4243';

function memoriesUrl()                  { return `${API_BASE}/api/memory`; }
function memorySearchUrl()              { return `${API_BASE}/api/memory/search`; }
function memoryDeleteUrl(id: string)    { return `${API_BASE}/api/memory/${id}`; }
function memoryArchiveUrl(id: string)   { return `${API_BASE}/api/memory/${id}/archive`; }
function memoryCleanupUrl()             { return `${API_BASE}/api/memory/cleanup`; }

// ============================================================
// Hook
// ============================================================

export function useMemories() {
    const [memories, setMemories]   = useState<MemoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError]         = useState<string | null>(null);

    // ── Fetch all ──────────────────────────────────────────────
    const fetchMemories = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await fetch(memoriesUrl());
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { memories: MemoryEntry[] };
            setMemories(data.memories);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load memories');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Auto-fetch on mount
    useEffect(() => { void fetchMemories(); }, [fetchMemories]);

    // ── Create ─────────────────────────────────────────────────
    const createMemory = useCallback(async (
        content: string,
        type: MemoryEntry['type'] = 'note',
        lifecycle: MemoryEntry['lifecycle'] = 'long_term',
    ): Promise<MemoryEntry | null> => {
        try {
            const res = await fetch(memoriesUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, type, lifecycle }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const entry = await res.json() as MemoryEntry;
            setMemories(prev => [entry, ...prev]);
            return entry;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create memory');
            return null;
        }
    }, []);

    // ── Search ─────────────────────────────────────────────────
    const searchMemories = useCallback(async (
        query: string,
        limit = 10,
    ): Promise<MemorySearchResult[]> => {
        try {
            const res = await fetch(memorySearchUrl(), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query, limit }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { results: MemorySearchResult[] };
            return data.results;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
            return [];
        }
    }, []);

    // ── Delete ─────────────────────────────────────────────────
    const deleteMemory = useCallback(async (id: string): Promise<boolean> => {
        try {
            const res = await fetch(memoryDeleteUrl(id), { method: 'DELETE' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMemories(prev => prev.filter(m => m.id !== id));
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete memory');
            return false;
        }
    }, []);

    // ── Archive ────────────────────────────────────────────────
    const archiveMemory = useCallback(async (id: string): Promise<boolean> => {
        try {
            const res = await fetch(memoryArchiveUrl(id), { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setMemories(prev => prev.filter(m => m.id !== id));
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to archive memory');
            return false;
        }
    }, []);

    // ── Cleanup ────────────────────────────────────────────────
    const cleanupExpired = useCallback(async (): Promise<number> => {
        try {
            const res = await fetch(memoryCleanupUrl(), { method: 'POST' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json() as { removed: number };
            if (data.removed > 0) await fetchMemories();
            return data.removed;
        } catch {
            return 0;
        }
    }, [fetchMemories]);

    return {
        memories,
        isLoading,
        error,
        fetchMemories,
        createMemory,
        searchMemories,
        deleteMemory,
        archiveMemory,
        cleanupExpired,
    };
}
