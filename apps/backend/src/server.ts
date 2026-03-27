import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { initSettings } from './config/settings.store';
import { chatStreamRoute } from './sse/chat.stream';
import { settingsRoute } from './routes/settings.route';
import { toolsRoute } from './routes/tools.route';
import { getSystemStats } from './debug/hardware';
import { getActiveProviderLabel } from './llm/provider';

// Load settings.json (merges on top of env defaults) before handling any requests
await initSettings();

const app = new Elysia()
    // CORS for Next.js frontend & Tauri desktop shell
    // Reflect any provided origin so desktop WebView requests always pass.
    .use(cors({
        origin: true,
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

    // Settings CRUD + connection test
    .use(settingsRoute)

    // Tool confirmation (approve / reject)
    .use(toolsRoute)

    // Chat routes
    .use(chatStreamRoute)

    // Start server
    .listen({
        port: env.PORT,
        hostname: env.HOST,
    });

console.log(`
🏛️  Aurelius Backend Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 http://${env.HOST}:${env.PORT}
🔧 Environment: ${env.NODE_ENV}
🤖 LLM: ${getActiveProviderLabel()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

export type App = typeof app;
