import type { McpConnection, McpServerConfig, McpTool } from './types.js';
import { createMcpClient, disconnectMcpClient } from './client.js';

// ============================================================
// MCP Registry - Manages MCP server connections
// ============================================================

const connections = new Map<string, McpConnection>();

// ============================================================
// Public API
// ============================================================

export async function connectServer(config: McpServerConfig): Promise<McpConnection> {
    // Disconnect existing if present
    const existing = connections.get(config.id);
    if (existing) {
        await disconnectMcpClient(existing);
        connections.delete(config.id);
    }

    const connection = await createMcpClient(config);
    connections.set(config.id, connection);
    return connection;
}

export async function disconnectServer(serverId: string): Promise<void> {
    const connection = connections.get(serverId);
    if (connection) {
        await disconnectMcpClient(connection);
        connections.delete(serverId);
    }
}

export async function disconnectAllServers(): Promise<void> {
    for (const [id, connection] of connections) {
        await disconnectMcpClient(connection);
    }
    connections.clear();
}

export function getConnection(serverId: string): McpConnection | undefined {
    return connections.get(serverId);
}

export function getAllConnections(): McpConnection[] {
    return Array.from(connections.values());
}

export function getConnectedServers(): McpConnection[] {
    return Array.from(connections.values()).filter(c => c.connected);
}

// ============================================================
// Tool Management
// ============================================================

export function getAllMcpTools(): Array<{ serverId: string; serverName: string; tool: McpTool }> {
    const tools: Array<{ serverId: string; serverName: string; tool: McpTool }> = [];
    
    for (const connection of connections.values()) {
        if (connection.connected) {
            for (const tool of connection.tools) {
                tools.push({
                    serverId: connection.config.id,
                    serverName: connection.config.name,
                    tool,
                });
            }
        }
    }
    
    return tools;
}

export function findTool(serverId: string, toolName: string): { connection: McpConnection; tool: McpTool } | undefined {
    const connection = connections.get(serverId);
    if (!connection || !connection.connected) return undefined;
    
    const tool = connection.tools.find(t => t.name === toolName);
    if (!tool) return undefined;
    
    return { connection, tool };
}

// ============================================================
// Reconnection Logic
// ============================================================

export async function reconnectAll(enabledConfigs: McpServerConfig[]): Promise<void> {
    console.log('[MCP] Reconnecting to all enabled servers...');
    
    for (const config of enabledConfigs) {
        if (config.enabled) {
            try {
                await connectServer(config);
            } catch (error) {
                console.error(`[MCP] Failed to reconnect to ${config.name}:`, error);
            }
        }
    }
}

// ============================================================
// Health Check
// ============================================================

export async function checkServerHealth(serverId: string): Promise<boolean> {
    const connection = connections.get(serverId);
    if (!connection) return false;
    
    // Try to list tools as a ping
    if (connection.client && connection.connected) {
        try {
            const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
            const client = connection.client as InstanceType<typeof Client>;
            await client.listTools();
            return true;
        } catch {
            connection.connected = false;
            connection.error = 'Connection lost';
            return false;
        }
    }
    
    return false;
}
