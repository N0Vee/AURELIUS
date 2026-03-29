import Dexie, { type EntityTable } from 'dexie';

// ============================================================
// Table shapes
// ============================================================

export interface ChatSession {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}

/**
 * A single persisted message row.
 * `data` is a JSON-serialised `Message` (from useChat) with `isStreaming` stripped out.
 * Storing the whole object as JSON keeps the schema stable even as the Message
 * union type evolves — we never have to run a DB migration just because a new
 * field is added to a message variant.
 */
export interface PersistedMessage {
    /** Same id as the in-memory Message.id */
    id: string;
    sessionId: string;
    timestamp: number;
    data: string;
}

// ============================================================
// Database
// ============================================================

class AureliusDB extends Dexie {
    sessions!: EntityTable<ChatSession, 'id'>;
    messages!: EntityTable<PersistedMessage, 'id'>;

    constructor() {
        super('AureliusDB');

        this.version(1).stores({
            // sessions: primary key = id, indexed on createdAt + updatedAt for sorting
            sessions: 'id, createdAt, updatedAt',

            // messages: primary key = id, indexed on sessionId for per-session queries,
            // compound index [sessionId+timestamp] for ordered per-session fetches
            messages: 'id, sessionId, timestamp, [sessionId+timestamp]',
        });
    }
}

export const db = new AureliusDB();
