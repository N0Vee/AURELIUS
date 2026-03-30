'use client';

import { useState, useEffect, useCallback } from 'react';

// ============================================================
// Types
// ============================================================

export type McpTransport = 'stdio' | 'sse';

export interface McpServer {
    id: string;
    name: string;
    transport: McpTransport;
    command?: string;
    args?: string[];
    url?: string;
    env?: Record<string, string>;
    enabled: boolean;
    connected?: boolean;
    error?: string;
    toolCount?: number;
    resourceCount?: number;
    lastConnected?: Date;
}

export interface McpTool {
    name: string;
    description?: string;
}

export interface UseMcpReturn {
    servers: McpServer[];
    isLoading: boolean;
    error: string | null;
    addServer: (server: Omit<McpServer, 'connected' | 'error' | 'toolCount' | 'resourceCount'>) => Promise<boolean>;
    updateServer: (id: string, updates: Partial<McpServer>) => Promise<boolean>;
    deleteServer: (id: string) => Promise<boolean>;
    connectServer: (id: string) => Promise<boolean>;
    disconnectServer: (id: string) => Promise<boolean>;
    refresh: () => Promise<void>;
    getServerTools: (id: string) => Promise<McpTool[]>;
    importConfig: (config: unknown) => Promise<{ success: boolean; added: number; errors: string[]; skipped: number }>;
}

// ============================================================
// Hook
// ============================================================

const API_BASE = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:4243' 
    : 'http://localhost:4243';

export function useMcp(): UseMcpReturn {
    const [servers, setServers] = useState<McpServer[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchServers = useCallback(async () => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers`);
            if (!response.ok) throw new Error('Failed to fetch MCP servers');
            const data = await response.json();
            setServers(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchServers();
    }, [fetchServers]);

    const addServer = useCallback(async (server: Omit<McpServer, 'connected' | 'error' | 'toolCount' | 'resourceCount'>): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(server),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to add server');
            }
            await fetchServers();
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add server');
            return false;
        }
    }, [fetchServers]);

    const updateServer = useCallback(async (id: string, updates: Partial<McpServer>): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update server');
            }
            await fetchServers();
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update server');
            return false;
        }
    }, [fetchServers]);

    const deleteServer = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers/${id}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete server');
            await fetchServers();
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete server');
            return false;
        }
    }, [fetchServers]);

    const connectServer = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers/${id}/connect`, {
                method: 'POST',
            });
            if (!response.ok) throw new Error('Failed to connect server');
            const data = await response.json();
            await fetchServers();
            return data.success;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to connect');
            return false;
        }
    }, [fetchServers]);

    const disconnectServer = useCallback(async (id: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers/${id}/disconnect`, {
                method: 'POST',
            });
            if (!response.ok) throw new Error('Failed to disconnect server');
            await fetchServers();
            return true;
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to disconnect');
            return false;
        }
    }, [fetchServers]);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        await fetchServers();
    }, [fetchServers]);

    const getServerTools = useCallback(async (id: string): Promise<McpTool[]> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/servers/${id}/tools`);
            if (!response.ok) throw new Error('Failed to fetch tools');
            const data = await response.json();
            return data.tools || [];
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch tools');
            return [];
        }
    }, []);

    const importConfig = useCallback(async (config: unknown): Promise<{ success: boolean; added: number; errors: string[]; skipped: number }> => {
        try {
            const response = await fetch(`${API_BASE}/mcp/import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config),
            });
            if (!response.ok) throw new Error('Failed to import config');
            const data = await response.json();
            await fetchServers();
            return {
                success: data.success,
                added: data.added || 0,
                errors: data.errors || [],
                skipped: data.skipped || 0,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to import config';
            setError(msg);
            return { success: false, added: 0, errors: [msg], skipped: 0 };
        }
    }, [fetchServers]);

    return {
        servers,
        isLoading,
        error,
        addServer,
        updateServer,
        deleteServer,
        connectServer,
        disconnectServer,
        refresh,
        getServerTools,
        importConfig,
    };
}
