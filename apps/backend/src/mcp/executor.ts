import { callMcpTool } from './client.js';
import { findTool } from './registry.js';
import { parseMcpToolName, isMcpToolName } from './converter.js';
import type { McpConnection } from './types.js';

// ============================================================
// MCP Tool Executor
// ============================================================

/**
 * Execute an MCP tool call
 */
export async function executeMcpTool(
    namespacedName: string,
    args: Record<string, unknown>
): Promise<unknown> {
    const parsed = parseMcpToolName(namespacedName);
    if (!parsed) {
        throw new Error(`Invalid MCP tool name: ${namespacedName}`);
    }

    const { serverId, toolName } = parsed;
    const found = findTool(serverId, toolName);

    if (!found) {
        throw new Error(`MCP tool not found: ${toolName} on server ${serverId}`);
    }

    const { connection, tool } = found;

    console.log(`[MCP] Executing ${connection.config.name}/${tool.name}`, args);

    try {
        const result = await callMcpTool(connection, tool.name, args);
        console.log(`[MCP] Tool ${tool.name} executed successfully`);
        return result;
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[MCP] Tool execution failed: ${errMsg}`);
        throw error;
    }
}

/**
 * Check if a tool name is an MCP tool
 */
export function isMcpTool(toolName: string): boolean {
    return isMcpToolName(toolName);
}

/**
 * Get MCP tool info for display
 */
export function getMcpToolInfo(namespacedName: string): { serverName: string; toolName: string } | null {
    const parsed = parseMcpToolName(namespacedName);
    if (!parsed) return null;

    const { serverId, toolName } = parsed;
    const found = findTool(serverId, toolName);

    if (!found) return null;

    return {
        serverName: found.connection.config.name,
        toolName: found.tool.name,
    };
}
