'use client';

import { useState, useCallback, useRef } from 'react';

interface UseSSEOptions {
    onMessage?: (event: string, data: unknown) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
}

/**
 * SSE Client Hook for consuming Server-Sent Events
 */
export function useSSE(url: string, options: UseSSEOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const connect = useCallback(
        async (body?: object) => {
            try {
                // Abort any existing connection
                abortControllerRef.current?.abort();
                abortControllerRef.current = new AbortController();

                setError(null);
                setIsConnected(true);

                const response = await fetch(url, {
                    method: body ? 'POST' : 'GET',
                    headers: body ? { 'Content-Type': 'application/json' } : {},
                    body: body ? JSON.stringify(body) : undefined,
                    signal: abortControllerRef.current.signal,
                });

                if (!response.ok) {
                    throw new Error(`SSE error: ${response.status}`);
                }

                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body');

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const block of lines) {
                        if (!block.trim()) continue;

                        const eventMatch = block.match(/^event: (.+)$/m);
                        const dataMatch = block.match(/^data: (.+)$/m);

                        if (eventMatch && dataMatch) {
                            try {
                                const event = eventMatch[1];
                                const data = JSON.parse(dataMatch[1]);
                                options.onMessage?.(event, data);
                            } catch {
                                // Skip malformed events
                            }
                        }
                    }
                }

                setIsConnected(false);
                options.onClose?.();
            } catch (err) {
                if (err instanceof Error && err.name !== 'AbortError') {
                    setError(err);
                    options.onError?.(err);
                }
                setIsConnected(false);
            }
        },
        [url, options]
    );

    const disconnect = useCallback(() => {
        abortControllerRef.current?.abort();
        setIsConnected(false);
    }, []);

    return {
        connect,
        disconnect,
        isConnected,
        error,
    };
}
