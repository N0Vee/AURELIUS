import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpServerConfig, McpConnection, McpTool, McpResource, McpPrompt, McpServerCapabilities } from './types.js';

// ============================================================
// MCP Client Factory
// ============================================================

export async function createMcpClient(config: McpServerConfig): Promise<McpConnection> {
    const connection: McpConnection = {
        config,
        client: null,
        tools: [],
        resources: [],
        prompts: [],
        connected: false,
    };

    try {
        let transport;

        if (config.transport === 'stdio') {
            if (!config.command) {
                throw new Error('stdio transport requires a command');
            }
            const envVars: Record<string, string> = {};
            for (const [key, value] of Object.entries(process.env)) {
                if (value !== undefined) {
                    envVars[key] = value;
                }
            }
            
            transport = new StdioClientTransport({
                command: config.command,
                args: config.args || [],
                env: { ...envVars, ...config.env },
            });
        } else if (config.transport === 'sse') {
            if (!config.url) {
                throw new Error('sse transport requires a URL');
            }
            transport = new SSEClientTransport(new URL(config.url));
        } else {
            throw new Error(`Unsupported transport: ${config.transport}`);
        }

        const client = new Client({
            name: 'aurelius-mcp-client',
            version: '0.1.0',
        });

        await client.connect(transport);

        connection.client = client;
        connection.connected = true;
        connection.lastConnected = new Date();

        // Fetch server capabilities and tools
        await fetchServerInfo(connection);

        console.log(`[MCP] Connected to server: ${config.name}`);
        return connection;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Failed to connect to ${config.name}: ${errMsg}`);
        connection.error = errMsg;
        connection.connected = false;
        return connection;
    }
}

async function fetchServerInfo(connection: McpConnection): Promise<void> {
    if (!connection.client || !connection.connected) return;

    const client = connection.client as Client;

    try {
        // List tools
        const toolsResult = await client.listTools();
        connection.tools = toolsResult.tools as McpTool[];
        console.log(`[MCP] ${connection.config.name}: Found ${connection.tools.length} tools`);
    } catch (error) {
        console.warn(`[MCP] ${connection.config.name}: Failed to list tools:`, error);
        connection.tools = [];
    }

    try {
        // List resources
        const resourcesResult = await client.listResources();
        connection.resources = (resourcesResult.resources || []) as McpResource[];
        console.log(`[MCP] ${connection.config.name}: Found ${connection.resources.length} resources`);
    } catch (error) {
        // Resources are optional
        connection.resources = [];
    }

    try {
        // List prompts
        const promptsResult = await client.listPrompts();
        connection.prompts = (promptsResult.prompts || []) as McpPrompt[];
        console.log(`[MCP] ${connection.config.name}: Found ${connection.prompts.length} prompts`);
    } catch (error) {
        // Prompts are optional
        connection.prompts = [];
    }
}

export async function disconnectMcpClient(connection: McpConnection): Promise<void> {
    if (connection.client && connection.connected) {
        try {
            const client = connection.client as Client;
            await client.close();
            console.log(`[MCP] Disconnected from ${connection.config.name}`);
        } catch (error) {
            console.warn(`[MCP] Error disconnecting from ${connection.config.name}:`, error);
        }
    }
    connection.connected = false;
    connection.client = null;
    connection.tools = [];
    connection.resources = [];
    connection.prompts = [];
}

export async function callMcpTool(
    connection: McpConnection,
    toolName: string,
    args: Record<string, unknown>
): Promise<unknown> {
    if (!connection.client || !connection.connected) {
        throw new Error(`MCP server ${connection.config.name} is not connected`);
    }

    const client = connection.client as Client;
    
    try {
        const result = await client.callTool({
            name: toolName,
            arguments: args,
        });
        return result;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Tool call failed on ${connection.config.name}/${toolName}: ${errMsg}`);
        throw error;
    }
}

export async function readMcpResource(
    connection: McpConnection,
    uri: string
): Promise<unknown> {
    if (!connection.client || !connection.connected) {
        throw new Error(`MCP server ${connection.config.name} is not connected`);
    }

    const client = connection.client as Client;
    
    try {
        const result = await client.readResource({ uri });
        return result;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Resource read failed on ${connection.config.name}/${uri}: ${errMsg}`);
        throw error;
    }
}

export async function getMcpPrompt(
    connection: McpConnection,
    promptName: string,
    args?: Record<string, string>
): Promise<unknown> {
    if (!connection.client || !connection.connected) {
        throw new Error(`MCP server ${connection.config.name} is not connected`);
    }

    const client = connection.client as Client;
    
    try {
        const result = await client.getPrompt({
            name: promptName,
            arguments: args,
        });
        return result;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Get prompt failed on ${connection.config.name}/${promptName}: ${errMsg}`);
        throw error;
    }
}
