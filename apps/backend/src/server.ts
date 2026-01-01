import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { chatStreamRoute } from './sse/chat.stream';
import { getSystemStats } from './debug/hardware';

const app = new Elysia()
    // CORS for Next.js frontend
    .use(cors({
        origin: env.CORS_ORIGIN,
        credentials: true,
    }))

    // Health check
    .get('/health', () => ({
        status: 'ok',
        timestamp: Date.now(),
        env: env.NODE_ENV,
    }))

    // System stats endpoint
    .get('/api/system/stats', async () => {
        return await getSystemStats();
    })

    // SSE streaming endpoint for system stats
    .get('/api/system/stats/stream', async function* () {
        yield `event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`;

        while (true) {
            const stats = await getSystemStats();
            yield `event: stats\ndata: ${JSON.stringify(stats)}\n\n`;
            await Bun.sleep(2000); // Update every 2 seconds
        }
    })

    // Chat routes
    .use(chatStreamRoute)

    // Start server
    .listen({
        port: env.PORT,
        hostname: env.HOST,
    });

console.log(`
🏛️  AURELIUS Backend Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 http://${env.HOST}:${env.PORT}
🔧 Environment: ${env.NODE_ENV}
🤖 Ollama: ${env.OLLAMA_HOST} (${env.OLLAMA_MODEL})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

export type App = typeof app;
