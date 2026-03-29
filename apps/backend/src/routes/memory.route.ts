import { Elysia, t } from 'elysia';
import {
    getAllMemories,
    saveMemory,
    deleteMemory,
    archiveMemory,
    cleanupExpired,
    getMemoriesFilePath,
} from '../memory/memory.store';
import { searchMemories } from '../memory/memory.search';

export const memoryRoute = new Elysia({ prefix: '/api/memory' })

    // ----------------------------------------------------------
    // GET /api/memory
    // Returns all non-archived, non-expired memories
    // ----------------------------------------------------------
    .get('/', async () => {
        const memories = await getAllMemories();
        return { memories, total: memories.length };
    })

    // ----------------------------------------------------------
    // GET /api/memory/info
    // Returns the path to the memories file (for debug / UI)
    // ----------------------------------------------------------
    .get('/info', () => ({
        memoriesFilePath: getMemoriesFilePath(),
    }))

    // ----------------------------------------------------------
    // POST /api/memory
    // Manually create a memory entry
    // ----------------------------------------------------------
    .post(
        '/',
        async ({ body }) => {
            const entry = await saveMemory({
                type:      body.type as 'fact' | 'preference' | 'task' | 'note' | 'conversation',
                content:   body.content,
                lifecycle: (body.lifecycle ?? 'long_term') as 'long_term' | 'short_term' | 'ephemeral' | 'archived',
                metadata:  { source: 'manual' },
            });
            return entry;
        },
        {
            body: t.Object({
                type:      t.String(),
                content:   t.String(),
                lifecycle: t.Optional(t.String()),
            }),
        },
    )

    // ----------------------------------------------------------
    // POST /api/memory/search
    // Semantic / keyword search over memories
    // ----------------------------------------------------------
    .post(
        '/search',
        async ({ body }) => {
            const results = await searchMemories(
                body.query,
                body.limit         ?? 10,
                body.minSimilarity ?? 0.25,
            );
            return { results, total: results.length };
        },
        {
            body: t.Object({
                query:         t.String(),
                limit:         t.Optional(t.Number()),
                minSimilarity: t.Optional(t.Number()),
            }),
        },
    )

    // ----------------------------------------------------------
    // DELETE /api/memory/:id
    // Permanently delete a memory
    // ----------------------------------------------------------
    .delete('/:id', async ({ params }) => {
        const deleted = await deleteMemory(params.id);
        return { success: deleted };
    })

    // ----------------------------------------------------------
    // POST /api/memory/:id/archive
    // Soft-delete (archive) a memory
    // ----------------------------------------------------------
    .post('/:id/archive', async ({ params }) => {
        await archiveMemory(params.id);
        return { success: true };
    })

    // ----------------------------------------------------------
    // POST /api/memory/cleanup
    // Manually trigger TTL-based cleanup
    // ----------------------------------------------------------
    .post('/cleanup', async () => {
        const removed = await cleanupExpired();
        return { removed };
    });
