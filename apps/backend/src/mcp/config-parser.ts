import type { McpServerConfig } from './types.js';

// ============================================================
// External MCP Config Parser
// Converts Windsurf/Cursor MCP JSON format to Aurelius format
// ============================================================

interface ExternalMcpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // SSE transport (Windsurf/Cursor format)
  serverUrl?: string;
  headers?: Record<string, string>;
}

interface ExternalMcpConfig {
  mcpServers: Record<string, ExternalMcpServer>;
}

export interface ParseResult {
  servers: McpServerConfig[];
  errors: string[];
}

/**
 * Parse external MCP config (Windsurf/Cursor format) into Aurelius format
 */
export function parseMcpConfig(json: unknown): ParseResult {
  const result: ParseResult = {
    servers: [],
    errors: [],
  };

  // Validate basic structure
  if (!json || typeof json !== 'object') {
    result.errors.push('Invalid JSON: expected an object');
    return result;
  }

  const config = json as Partial<ExternalMcpConfig>;

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    result.errors.push('Invalid config: missing or invalid "mcpServers" object');
    return result;
  }

  // Parse each server
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    try {
      const parsed = parseServerConfig(name, serverConfig);
      if (parsed) {
        result.servers.push(parsed);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Server "${name}": ${msg}`);
    }
  }

  return result;
}

/**
 * Parse a single server configuration
 */
function parseServerConfig(name: string, config: unknown): McpServerConfig | null {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid server config: expected an object');
  }

  const server = config as ExternalMcpServer;
  const id = slugify(name);

  // Determine transport type
  const hasCommand = typeof server.command === 'string' && server.command.length > 0;
  const hasServerUrl = typeof server.serverUrl === 'string' && server.serverUrl.length > 0;

  if (!hasCommand && !hasServerUrl) {
    throw new Error('Invalid server config: must have either "command" (stdio) or "serverUrl" (sse)');
  }

  // Build base config
  const baseConfig: Omit<McpServerConfig, 'transport' | 'command' | 'args' | 'url'> = {
    id,
    name,
    enabled: true,
    env: server.env || {},
  };

  // Parse based on transport type
  if (hasServerUrl) {
    // SSE transport
    return {
      ...baseConfig,
      transport: 'sse',
      url: server.serverUrl,
    };
  } else {
    // stdio transport
    return {
      ...baseConfig,
      transport: 'stdio',
      command: server.command!,
      args: Array.isArray(server.args) ? server.args : [],
    };
  }
}

/**
 * Convert a string to a valid ID (slugify)
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * Validate and format JSON string for display
 */
export function formatMcpConfigForDisplay(json: unknown): string {
  try {
    return JSON.stringify(json, null, 2);
  } catch {
    return String(json);
  }
}

/**
 * Check if config has valid MCP format
 */
export function isValidMcpConfig(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const config = json as Partial<ExternalMcpConfig>;
  return !!config.mcpServers && typeof config.mcpServers === 'object';
}
