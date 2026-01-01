'use client';

import { useState, useEffect } from 'react';

export interface SystemStats {
    cpu: {
        usage: number;
        cores: number;
        model: string;
    };
    memory: {
        total: number;
        used: number;
        free: number;
        usagePercent: number;
    };
    gpu?: {
        name: string;
        memoryTotal: number;
        memoryUsed: number;
        memoryFree: number;
        utilization: number;
        temperature: number;
    };
    uptime: number;
    platform: string;
}

interface UseSystemStatsOptions {
    apiUrl?: string;
    refreshInterval?: number;
}

const DEFAULT_API_URL = 'http://localhost:3001/api/system/stats';

/**
 * Hook for fetching system stats with auto-refresh
 */
export function useSystemStats(options: UseSystemStatsOptions = {}) {
    const { apiUrl = DEFAULT_API_URL, refreshInterval = 2000 } = options;
    const [stats, setStats] = useState<SystemStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;

        const fetchStats = async () => {
            try {
                const response = await fetch(apiUrl);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (isMounted) {
                    setStats(data);
                    setError(null);
                }
            } catch (err) {
                if (isMounted) {
                    setError(err instanceof Error ? err : new Error('Unknown error'));
                }
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, refreshInterval);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [apiUrl, refreshInterval]);

    return { stats, isLoading, error };
}
