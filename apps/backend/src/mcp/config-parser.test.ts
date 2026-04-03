import { describe, expect, test } from 'bun:test';
import { isValidMcpConfig, parseMcpConfig } from './config-parser';

describe('parseMcpConfig', () => {
    test('parses OpenCode-style remote MCP config', () => {
        const result = parseMcpConfig({
            mcp: {
                Supabase: {
                    type: 'remote',
                    url: 'https://mcp.supabase.com/mcp',
                    headers: {
                        Authorization: 'Bearer test-token',
                    },
                    enabled: true,
                },
            },
        });

        expect(result.errors).toEqual([]);
        expect(result.servers).toEqual([
            {
                id: 'supabase',
                name: 'Supabase',
                transport: 'sse',
                url: 'https://mcp.supabase.com/mcp',
                env: {},
                headers: {
                    Authorization: 'Bearer test-token',
                },
                enabled: true,
            },
        ]);
    });

    test('parses legacy mcpServers stdio config', () => {
        const result = parseMcpConfig({
            mcpServers: {
                filesystem: {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-filesystem'],
                },
            },
        });

        expect(result.errors).toEqual([]);
        expect(result.servers).toEqual([
            {
                id: 'filesystem',
                name: 'filesystem',
                transport: 'stdio',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem'],
                env: {},
                headers: undefined,
                enabled: true,
            },
        ]);
    });

    test('accepts both supported root keys', () => {
        expect(isValidMcpConfig({ mcp: {} })).toBe(true);
        expect(isValidMcpConfig({ mcpServers: {} })).toBe(true);
        expect(isValidMcpConfig({})).toBe(false);
    });
});