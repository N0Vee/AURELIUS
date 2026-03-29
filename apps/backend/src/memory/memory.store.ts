import path from 'path';
import { mkdirSync } from 'fs';
import type { MemoryEntry } from '@aurelius/shared-schema';
import { createMemoryEntry, isExpired, shouldPromoteToLongTerm } from '@aurelius/shared-schema';

// ============================================================
// Directory Resolution (mirrors skills.store.ts)
// ============================================================

function resolveDataDir(): string {
    if (process.env.AURELIUS_DATA_DIR) {
        return process.env.AURELIUS_DATA_DIR;
    }
    const appData =
        process.env.APPDATA ||
        (process.env.HOME ? path.join(process.env.HOME, '.config') : '.');
    return path.join(appData, 'Aurelius');
}

const DATA_DIR     = resolveDataDir();
const MEMORIES_FILE = path.join(DATA_DIR, 'memories.json');

try { mkdirSync(DATA_DIR, { recursive: true }); } catch { /* already exists */ }

// ============================================================
// In-memory cache
// ============================================================

let _memories: Map<string, MemoryEntry> = new Map();
let _initialized = false;

// ============================================================
// Persistence
// ============================================================

async function loadFromDisk(): Promise<void> {
    try {
        const file = Bun.file(MEMORIES_FILE);
        if (await file.exists()) {
            const raw = await file.json() as MemoryEntry[];
            _memories = new Map(raw.map(entry => [entry.id, entry]));
            console.log(`[Memory] Loaded ${_memories.size} memories from disk`);
        } else {
            console.log('[Memory] No memories file found — starting fresh');
        }
    } catch (err) {
        console.warn('[Memory] Could not load memories.json:', err);
        _memories = new Map();
    }
}

async function saveToDisk(): Promise<void> {
    try {
        const entries = Array.from(_memories.values());
        await Bun.write(MEMORIES_FILE, JSON.stringify(entries, null, 2));
    } catch (err) {
        console.error('[Memory] Failed to persist memories.json:', err);
    }
}

// ============================================================
// Initialization
// ============================================================

export async function initMemoryStore(): Promise<void> {
    if (_initialized) return;
    await loadFromDisk();
    const removed = await cleanupExpired();
    if (removed > 0) console.log(`[Memory] Cleaned up ${removed} expired entries on startup`);
    _initialized = true;
    console.log(`[Memory] Store ready. ${_memories.size} active memories.`);
}

// ============================================================
// Public CRUD API
// ============================================================

export async function saveMemory(
    data: Pick<MemoryEntry, 'type' | 'content'> & Partial<MemoryEntry>,
): Promise<MemoryEntry> {
    const entry = createMemoryEntry(data);
    _memories.set(entry.id, entry);
    await saveToDisk();
    console.log(`[Memory] Saved [${entry.type}/${entry.lifecycle}]: "${entry.content.slice(0, 80)}"`);
    return entry;
}

export async function getMemory(id: string): Promise<MemoryEntry | null> {
    const entry = _memories.get(id);
    if (!entry) return null;

    // Update access tracking
    entry.accessCount  = (entry.accessCount ?? 0) + 1;
    entry.lastAccessedAt = Date.now();

    // Auto-promote frequently-accessed memories
    if (shouldPromoteToLongTerm(entry) && entry.lifecycle !== 'long_term') {
        entry.lifecycle = 'long_term';
        entry.expiresAt = undefined;
        console.log(`[Memory] Auto-promoted to long_term: ${entry.id}`);
    }

    await saveToDisk();
    return entry;
}

export async function getAllMemories(): Promise<MemoryEntry[]> {
    return Array.from(_memories.values())
        .filter(e => e.lifecycle !== 'archived' && !isExpired(e))
        .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateMemoryEmbedding(id: string, embedding: number[]): Promise<void> {
    const entry = _memories.get(id);
    if (!entry) return;
    entry.embedding = embedding;
    await saveToDisk();
}

export async function deleteMemory(id: string): Promise<boolean> {
    const existed = _memories.has(id);
    _memories.delete(id);
    if (existed) await saveToDisk();
    console.log(`[Memory] Deleted: ${id}`);
    return existed;
}

export async function archiveMemory(id: string): Promise<void> {
    const entry = _memories.get(id);
    if (!entry) return;
    entry.lifecycle  = 'archived';
    entry.updatedAt  = Date.now();
    await saveToDisk();
    console.log(`[Memory] Archived: ${id}`);
}

export async function cleanupExpired(): Promise<number> {
    let count = 0;
    for (const [id, entry] of _memories) {
        if (isExpired(entry)) {
            _memories.delete(id);
            count++;
        }
    }
    if (count > 0) await saveToDisk();
    return count;
}

/** Raw map access for the search module (avoids extra copies) */
export function getMemoriesRaw(): Map<string, MemoryEntry> {
    return _memories;
}

export function getMemoriesFilePath(): string {
    return MEMORIES_FILE;
}
