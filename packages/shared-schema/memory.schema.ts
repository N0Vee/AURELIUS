import { z } from 'zod';

// ===== Memory Entry Types =====
export const MemoryType = z.enum([
    'conversation',  // Chat history
    'fact',          // Extracted facts about user
    'preference',    // User preferences
    'task',          // Task/todo items
    'note',          // General notes
]);
export type MemoryType = z.infer<typeof MemoryType>;

// ===== Memory Lifecycle States =====
export const MemoryLifecycle = z.enum([
    'ephemeral',     // Deleted after session
    'short_term',    // Kept for 24 hours
    'long_term',     // Kept indefinitely
    'archived',      // Soft deleted, can be restored
]);
export type MemoryLifecycle = z.infer<typeof MemoryLifecycle>;

// ===== Memory Entry Schema =====
export const MemoryEntrySchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()),
    type: MemoryType,
    content: z.string(),
    embedding: z.array(z.number()).optional(), // Vector embedding
    metadata: z.record(z.string(), z.any()).optional(),
    lifecycle: MemoryLifecycle.default('short_term'),
    createdAt: z.number().default(() => Date.now()),
    updatedAt: z.number().default(() => Date.now()),
    expiresAt: z.number().optional(), // For TTL-based deletion
    accessCount: z.number().default(0),
    lastAccessedAt: z.number().optional(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

// ===== Memory Query Schema =====
export const MemoryQuerySchema = z.object({
    query: z.string(),
    types: z.array(MemoryType).optional(),
    lifecycle: z.array(MemoryLifecycle).optional(),
    limit: z.number().min(1).max(100).default(10),
    minSimilarity: z.number().min(0).max(1).default(0.7),
});
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

// ===== Memory Search Result =====
export const MemorySearchResultSchema = z.object({
    entry: MemoryEntrySchema,
    similarity: z.number().min(0).max(1),
});
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

// ===== Lifecycle Policy Functions =====

/**
 * Calculate expiration time based on lifecycle
 */
export function getExpirationTime(lifecycle: MemoryLifecycle): number | null {
    const now = Date.now();
    switch (lifecycle) {
        case 'ephemeral':
            return now; // Expires immediately after session
        case 'short_term':
            return now + 24 * 60 * 60 * 1000; // 24 hours
        case 'long_term':
            return null; // Never expires
        case 'archived':
            return now + 30 * 24 * 60 * 60 * 1000; // 30 days before permanent deletion
    }
}

/**
 * Determine if a memory entry should be promoted to long-term
 */
export function shouldPromoteToLongTerm(entry: MemoryEntry): boolean {
    // Promote if accessed more than 5 times
    if (entry.accessCount >= 5) return true;

    // Promote facts and preferences by default
    if (entry.type === 'fact' || entry.type === 'preference') return true;

    return false;
}

/**
 * Check if memory entry is expired
 */
export function isExpired(entry: MemoryEntry): boolean {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
}

/**
 * Create a new memory entry with proper defaults
 */
export function createMemoryEntry(
    data: Pick<MemoryEntry, 'type' | 'content'> & Partial<MemoryEntry>
): MemoryEntry {
    const lifecycle = data.lifecycle ?? 'short_term';
    const expiresAt = getExpirationTime(lifecycle);

    return MemoryEntrySchema.parse({
        ...data,
        lifecycle,
        expiresAt: expiresAt ?? undefined,
    });
}

// ===== Memory Store Interface =====
export interface MemoryStore {
    save(entry: MemoryEntry): Promise<void>;
    get(id: string): Promise<MemoryEntry | null>;
    search(query: MemoryQuery): Promise<MemorySearchResult[]>;
    delete(id: string): Promise<void>;
    archive(id: string): Promise<void>;
    cleanup(): Promise<number>; // Returns count of deleted entries
}
