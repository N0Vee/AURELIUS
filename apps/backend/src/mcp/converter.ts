import type { McpTool } from './types.js';
import type { ToolDefinition } from '../tools/registry.js';
import type { OpenAITool, OpenAIToolParameter } from '../llm/types.js';

// ============================================================
// MCP Tool to Aurelius Tool Converter
// ============================================================

/**
 * Convert MCP tool annotations to Aurelius permission level
 */
function getPermissionLevel(tool: McpTool): 'SAFE' | 'SENSITIVE' | 'DANGEROUS' {
    const annotations = tool.annotations;
    
    if (!annotations) {
        // Default to SENSITIVE if no annotations
        return 'SENSITIVE';
    }
    
    // Destructive operations always prompt
    if (annotations.destructiveHint) {
        return 'DANGEROUS';
    }
    
    // Read-only operations are generally safe
    if (annotations.readOnlyHint && !annotations.openWorldHint) {
        return 'SAFE';
    }
    
    // Open world operations (external APIs, etc.) should prompt
    if (annotations.openWorldHint) {
        return 'SENSITIVE';
    }
    
    // Default to SENSITIVE for unknown capabilities
    return 'SENSITIVE';
}

/**
 * Convert MCP tool schema to OpenAI-compatible format
 */
function convertInputSchema(schema: McpTool['inputSchema']): OpenAITool['function']['parameters'] {
    // MCP and OpenAI use similar JSON Schema format
    // Cast properties to the expected OpenAI format
    const properties: Record<string, OpenAIToolParameter> = {};
    
    if (schema.properties) {
        for (const [key, value] of Object.entries(schema.properties)) {
            const prop = value as Partial<OpenAIToolParameter>;
            properties[key] = {
                type: prop.type || 'string',
                description: prop.description || '',
                enum: prop.enum,
                items: prop.items,
            };
        }
    }
    
    return {
        type: 'object',
        properties,
        required: schema.required || [],
    };
}

/**
 * Convert a single MCP tool to Aurelius ToolDefinition
 */
export function convertMcpTool(
    serverId: string,
    serverName: string,
    tool: McpTool
): ToolDefinition {
    // Create namespaced tool name to avoid conflicts
    const namespacedName = `mcp_${serverId}_${tool.name}`;
    
    // Build description with server context
    let description = tool.description || `MCP tool from ${serverName}`;
    
    // Add annotation hints to description
    const annotations = tool.annotations;
    if (annotations) {
        const hints: string[] = [];
        if (annotations.readOnlyHint) hints.push('read-only');
        if (annotations.destructiveHint) hints.push('destructive');
        if (annotations.idempotentHint) hints.push('idempotent');
        if (annotations.openWorldHint) hints.push('external');
        
        if (hints.length > 0) {
            description += ` (${hints.join(', ')})`;
        }
    }
    
    const permissionLevel = getPermissionLevel(tool);
    
    return {
        name: namespacedName,
        displayName: `${serverName}: ${tool.name}`,
        description,
        permissionLevel,
        openAITool: {
            type: 'function',
            function: {
                name: namespacedName,
                description,
                parameters: convertInputSchema(tool.inputSchema),
            },
        },
    };
}

/**
 * Convert multiple MCP tools
 */
export function convertMcpTools(
    serverId: string,
    serverName: string,
    tools: McpTool[]
): ToolDefinition[] {
    return tools.map(tool => convertMcpTool(serverId, serverName, tool));
}

/**
 * Parse namespaced tool name to get server and tool
 */
export function parseMcpToolName(namespacedName: string): { serverId: string; toolName: string } | null {
    const prefix = 'mcp_';
    if (!namespacedName.startsWith(prefix)) {
        return null;
    }
    
    const rest = namespacedName.slice(prefix.length);
    const firstUnderscore = rest.indexOf('_');
    
    if (firstUnderscore === -1) {
        return null;
    }
    
    const serverId = rest.slice(0, firstUnderscore);
    const toolName = rest.slice(firstUnderscore + 1);
    
    return { serverId, toolName };
}

/**
 * Check if a tool name is an MCP tool
 */
export function isMcpToolName(name: string): boolean {
    return name.startsWith('mcp_');
}
