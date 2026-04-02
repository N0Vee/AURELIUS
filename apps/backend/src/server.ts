import { Elysia } from 'elysia';
import process from 'process';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { initSettings } from './config/settings.store';
import { initMemoryStore } from './memory/memory.store';
import { memoryRoute } from './routes/memory.route';
import { chatStreamRoute } from './sse/chat.stream';
import { settingsRoute } from './routes/settings.route';
import { toolsRoute } from './routes/tools.route';
import { automationsRoute } from './routes/automations.route';
import { initAutomations } from './tools/automations';
import { browserBridgeRoute, isBrowserConnected } from './browser/bridge';
import { skillsRoute } from './routes/skills.route';
import { initSkills } from './skills/skills.store';
import { getSystemStats } from './debug/hardware';
import { getActiveProviderLabel } from './llm/ai-provider';
import { mcpRoutes, initMcpServers } from './routes/mcp.route.js';

// Load settings.json (merges on top of env defaults) before handling any requests
await initSettings();

// Load custom automations and register them as tools
await initAutomations();

// Seed built-in skills and load skill state
await initSkills();

// Load long-term memory store
await initMemoryStore();

// Initialize MCP servers
await initMcpServers();

const app = new Elysia()
    // CORS for the Next.js frontend and browser extension bridge.
    // Reflect any provided origin so local clients can connect without a
    // hardcoded origin allowlist during development.
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

    // Browser extension WebSocket bridge
    .use(browserBridgeRoute)

    // Browser extension connection status
    .get('/api/browser/status', () => ({
        connected: isBrowserConnected(),
    }))

    // Settings CRUD + connection test
    .use(settingsRoute)

    // Tool confirmation (approve / reject)
    .use(toolsRoute)

    // Custom automations CRUD + test
    .use(automationsRoute)

    // Skills CRUD + generate
    .use(skillsRoute)

    // Memory CRUD + search
    .use(memoryRoute)

    // MCP server management
    .use(mcpRoutes)

    // Chat routes (Vercel AI SDK)
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

// ── Graceful shutdown ────────────────────────────────────────────────────────
// Some Windows launchers stop the backend with a hard process kill, so SIGTERM
// may never arrive. We still register both signals so the port is released
// cleanly whenever the runtime does deliver them.

function shutdown(signal: string) {
    console.log(`\n[Server] Received ${signal} — stopping server and releasing port ${env.PORT}…`);
    try {
        app.stop();
        console.log('[Server] Server stopped cleanly.');
    } catch (err) {
        console.warn('[Server] Error during stop:', err);
    } finally {
        process.exit(0);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
