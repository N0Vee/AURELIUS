import { Elysia } from 'elysia';
import { resolveConfirmation } from '../tools/pending';

/**
 * Tools confirmation route.
 *
 * POST /api/tools/:id/approve  — user clicked ✓ Approve
 * POST /api/tools/:id/reject   — user clicked ✕ Reject
 *
 * These endpoints resolve the Promise that the SSE stream is
 * awaiting in chat.stream.ts, allowing the agentic loop to continue.
 */
export const toolsRoute = new Elysia({ prefix: '/api/tools' })

    .post('/:id/approve', ({ params }) => {
        const ok = resolveConfirmation(params.id, 'approved');
        if (!ok) {
            return {
                success: false,
                error: `No pending confirmation found for id "${params.id}". It may have already been resolved or timed out.`,
            };
        }
        return { success: true, decision: 'approved' };
    })

    .post('/:id/reject', ({ params }) => {
        const ok = resolveConfirmation(params.id, 'rejected');
        if (!ok) {
            return {
                success: false,
                error: `No pending confirmation found for id "${params.id}". It may have already been resolved or timed out.`,
            };
        }
        return { success: true, decision: 'rejected' };
    });
