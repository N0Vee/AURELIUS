// MCP Types - Type definitions for Model Context Protocol

export type McpTransport = 'stdio' | 'sse';

export interface McpServerConfig {
    id: string;
    name: string;
    transport: McpTransport;
    command?: string;        // For stdio: e.g., "npx", "docker"
    args?: string[];         // For stdio: e.g., ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    url?: string;            // For SSE: e.g., "http://localhost:3001/sse"
    env?: Record<string, string>;
    enabled: boolean;
}

// MCP Tool definition from server
export interface McpTool {
    name: string;
    description?: string;
    inputSchema: {
        type: 'object';
        properties?: Record<string, unknown>;
        required?: string[];
    };
    // Optional annotations for safety
    annotations?: {
        title?: string;
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
    };
}

// MCP Resource from server
export interface McpResource {
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
}

// MCP Prompt from server
export interface McpPrompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}

// Server connection state
export interface McpConnection {
    config: McpServerConfig;
    client: unknown; // MCP SDK Client (typed as unknown to avoid import issues)
    tools: McpTool[];
    resources: McpResource[];
    prompts: McpPrompt[];
    connected: boolean;
    error?: string;
    lastConnected?: Date;
}

// Tool call result
export interface McpToolResult {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: string; // base64 for images
        mimeType?: string;
        resource?: McpResource;
    }>;
    isError?: boolean;
}

// Server capabilities
export interface McpServerCapabilities {
    tools?: {
        listChanged?: boolean;
    };
    resources?: {
        subscribe?: boolean;
        listChanged?: boolean;
    };
    prompts?: {
        listChanged?: boolean;
    };
}
