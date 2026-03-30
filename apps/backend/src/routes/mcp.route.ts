import { Elysia } from 'elysia';
import { z } from 'zod';
import { getSettings, updateSettings } from '../config/settings.store.js';
import { getAllConnections, connectServer, disconnectServer, reconnectAll, getAllMcpTools } from '../mcp/registry.js';
import { convertMcpTools } from '../mcp/converter.js';
import { register, unregister, getTool } from '../tools/registry.js';

// ============================================================
// MCP Routes
// ============================================================

export const mcpRoutes = new Elysia({ prefix: '/mcp' })
    // Get all MCP servers and their status
    .get('/servers', () => {
        const settings = getSettings();
        const connections = getAllConnections();
        
        return settings.mcpServers.map(server => {
            const conn = connections.find(c => c.config.id === server.id);
            return {
                ...server,
                connected: conn?.connected || false,
                error: conn?.error,
                toolCount: conn?.tools.length || 0,
                resourceCount: conn?.resources.length || 0,
                lastConnected: conn?.lastConnected,
            };
        });
    })

    // Add new MCP server
    .post('/servers', async ({ body }) => {
        const settings = getSettings();
        const server = body as {
            id: string;
            name: string;
            transport: 'stdio' | 'sse';
            command?: string;
            args?: string[];
            url?: string;
            env?: Record<string, string>;
            enabled?: boolean;
        };

        // Validate unique ID
        if (settings.mcpServers.some(s => s.id === server.id)) {
            return { error: `Server with id '${server.id}' already exists` };
        }

        const newServer = {
            ...server,
            enabled: server.enabled ?? true,
        };

        const updatedServers = [...settings.mcpServers, newServer];
        await updateSettings({ mcpServers: updatedServers });

        // Auto-connect if enabled
        if (newServer.enabled) {
            await connectServer(newServer);
            registerMcpToolsForServer(newServer.id);
        }

        return { success: true, server: newServer };
    })

    // Update MCP server
    .put('/servers/:id', async ({ params, body }) => {
        const settings = getSettings();
        const serverId = params.id;
        const serverIndex = settings.mcpServers.findIndex(s => s.id === serverId);

        if (serverIndex === -1) {
            return { error: `Server '${serverId}' not found` };
        }

        // Disconnect old connection if exists
        await disconnectServer(serverId);
        unregisterMcpToolsForServer(serverId);

        // Update server config
        const updatedServer = {
            ...settings.mcpServers[serverIndex],
            ...body as Partial<typeof settings.mcpServers[0]>,
        };

        const updatedServers = [...settings.mcpServers];
        updatedServers[serverIndex] = updatedServer;
        await updateSettings({ mcpServers: updatedServers });

        // Reconnect if enabled
        if (updatedServer.enabled) {
            await connectServer(updatedServer);
            registerMcpToolsForServer(updatedServer.id);
        }

        return { success: true, server: updatedServer };
    })

    // Delete MCP server
    .delete('/servers/:id', async ({ params }) => {
        const settings = getSettings();
        const serverId = params.id;

        // Disconnect and cleanup
        await disconnectServer(serverId);
        unregisterMcpToolsForServer(serverId);

        const updatedServers = settings.mcpServers.filter(s => s.id !== serverId);
        await updateSettings({ mcpServers: updatedServers });

        return { success: true };
    })

    // Connect to MCP server
    .post('/servers/:id/connect', async ({ params }) => {
        const settings = getSettings();
        const serverId = params.id;
        const server = settings.mcpServers.find(s => s.id === serverId);

        if (!server) {
            return { error: `Server '${serverId}' not found` };
        }

        const connection = await connectServer(server);
        registerMcpToolsForServer(serverId);

        return {
            success: connection.connected,
            error: connection.error,
            toolCount: connection.tools.length,
        };
    })

    // Disconnect from MCP server
    .post('/servers/:id/disconnect', async ({ params }) => {
        const serverId = params.id;
        await disconnectServer(serverId);
        unregisterMcpToolsForServer(serverId);
        return { success: true };
    })

    // Get tools from a specific server
    .get('/servers/:id/tools', ({ params }) => {
        const connections = getAllConnections();
        const connection = connections.find(c => c.config.id === params.id);

        if (!connection) {
            return { error: `Server '${params.id}' not found or not connected` };
        }

        return {
            serverId: params.id,
            serverName: connection.config.name,
            tools: connection.tools,
        };
    })

    // Get all MCP tools from all connected servers
    .get('/tools', () => {
        const tools = getAllMcpTools();
        return {
            count: tools.length,
            tools: tools.map(t => ({
                serverId: t.serverId,
                serverName: t.serverName,
                name: t.tool.name,
                description: t.tool.description,
            })),
        };
    });

// ============================================================
// Helper Functions
// ============================================================

function registerMcpToolsForServer(serverId: string): void {
    const connections = getAllConnections();
    const connection = connections.find(c => c.config.id === serverId);

    if (!connection || !connection.connected) return;

    const toolDefs = convertMcpTools(
        connection.config.id,
        connection.config.name,
        connection.tools
    );

    for (const toolDef of toolDefs) {
        register(toolDef);
        console.log(`[MCP] Registered tool: ${toolDef.name}`);
    }
}

function unregisterMcpToolsForServer(serverId: string): void {
    const settings = getSettings();
    const server = settings.mcpServers.find(s => s.id === serverId);
    if (!server) return;

    // Unregister all tools for this server
    const prefix = `mcp_${serverId}_`;
    const connections = getAllConnections();
    const connection = connections.find(c => c.config.id === serverId);

    if (connection) {
        for (const tool of connection.tools) {
            const namespacedName = `${prefix}${tool.name}`;
            unregister(namespacedName);
        }
    }

    console.log(`[MCP] Unregistered tools for server: ${serverId}`);
}

// ============================================================
// Initialization
// ============================================================

export async function initMcpServers(): Promise<void> {
    const settings = getSettings();
    console.log(`[MCP] Initializing ${settings.mcpServers.length} MCP servers...`);

    for (const server of settings.mcpServers) {
        if (server.enabled) {
            try {
                await connectServer(server);
                registerMcpToolsForServer(server.id);
            } catch (error) {
                console.error(`[MCP] Failed to initialize server ${server.name}:`, error);
            }
        }
    }
}
