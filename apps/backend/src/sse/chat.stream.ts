import { Elysia, t } from 'elysia';
import { streamChatCompletion } from '../llm/ollama.client';
import { ChatMessageSchema } from '@aurelius/shared-schema';
import { z } from 'zod';

const ChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema),
});

/**
 * SSE Chat Streaming Route
 */
export const chatStreamRoute = new Elysia({ prefix: '/chat' })
    .post(
        '/stream',
        async function* ({ body }) {
            const { messages } = ChatRequestSchema.parse(body);

            // Send initial connection event
            yield `event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`;

            try {
                for await (const chunk of streamChatCompletion(messages)) {
                    yield `event: chunk\ndata: ${JSON.stringify({ content: chunk })}\n\n`;
                }

                yield `event: done\ndata: ${JSON.stringify({ status: 'complete' })}\n\n`;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                yield `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`;
            }
        },
        {
            body: t.Object({
                messages: t.Array(t.Any()),
            }),
        }
    );
