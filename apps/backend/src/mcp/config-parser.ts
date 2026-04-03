import type { McpServerConfig } from './types.js';

// ============================================================
// External MCP Config Parser
// Converts Windsurf/Cursor/OpenCode/Kilo MCP JSON format to Aurelius format
// ============================================================

interface ExternalMcpServer {
  type?: 'remote' | 'local' | string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // Remote transport (Windsurf/Cursor format)
  serverUrl?: string;
  // Remote transport (OpenCode/Kilo format)
  url?: string;
  headers?: Record<string, string>;
  enabled?: boolean;
}

interface ExternalMcpConfig {
  mcpServers?: Record<string, ExternalMcpServer>;
  mcp?: Record<string, ExternalMcpServer>;
}

export interface ParseResult {
  servers: McpServerConfig[];
  errors: string[];
}

/**
 * Parse external MCP config (Windsurf/Cursor/OpenCode/Kilo format) into Aurelius format
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
  const servers = getExternalServers(config);

  if (!servers) {
    result.errors.push('Invalid config: missing or invalid "mcpServers" or "mcp" object');
    return result;
  }

  // Parse each server
  for (const [name, serverConfig] of Object.entries(servers)) {
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

function getExternalServers(
  config: Partial<ExternalMcpConfig>,
): Record<string, ExternalMcpServer> | null {
  if (config.mcpServers && typeof config.mcpServers === 'object') {
    return config.mcpServers;
  }

  if (config.mcp && typeof config.mcp === 'object') {
    return config.mcp;
  }

  return null;
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
  const command = typeof server.command === 'string' && server.command.trim().length > 0
    ? server.command.trim()
    : undefined;
  const remoteUrl = typeof server.serverUrl === 'string' && server.serverUrl.trim().length > 0
    ? server.serverUrl.trim()
    : typeof server.url === 'string' && server.url.trim().length > 0
      ? server.url.trim()
      : undefined;

  // Determine transport type
  const hasCommand = Boolean(command);
  const hasRemoteUrl = Boolean(remoteUrl);

  if (!hasCommand && !hasRemoteUrl) {
    throw new Error('Invalid server config: must have either "command" (stdio) or "serverUrl"/"url" (remote)');
  }

  // Build base config
  const baseConfig: Omit<McpServerConfig, 'transport' | 'command' | 'args' | 'url'> = {
    id,
    name,
    enabled: server.enabled ?? true,
    env: server.env || {},
    headers: normalizeHeaders(server.headers),
  };

  // Parse based on transport type
  if (hasRemoteUrl) {
    // Remote transport
    return {
      ...baseConfig,
      transport: 'sse',
      url: remoteUrl,
    };
  } else {
    // stdio transport
    return {
      ...baseConfig,
      transport: 'stdio',
      command: command!,
      args: Array.isArray(server.args) ? server.args : [],
    };
  }
}

function normalizeHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const entries = Object.entries(headers)
    .filter(([key, value]) => key.trim().length > 0 && typeof value === 'string');

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
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
  return Boolean(
    (config.mcpServers && typeof config.mcpServers === 'object')
    || (config.mcp && typeof config.mcp === 'object'),
  );
}
