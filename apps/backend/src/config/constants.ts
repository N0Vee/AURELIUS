import { env } from './env';

export const CONSTANTS = {
    // Server
    API_PREFIX: '/api',

    // LLM
    MAX_TOKENS: 2048,
    TEMPERATURE: 0.7,
    SYSTEM_PROMPT: `You are AURELIUS, a local AI assistant for a software engineer named Aum.
You run entirely on the user's local machine for privacy.
You can control Windows 11 applications, manage files, and help with coding tasks.
Be concise, helpful, and respectful of the user's time.
When suggesting tool calls, always explain what you're about to do.`,

    // SSE
    SSE_HEARTBEAT_INTERVAL: 30000, // 30 seconds

    // Permission levels
    PERMISSION_LEVELS: {
        SAFE: 'SAFE',
        SENSITIVE: 'SENSITIVE',
        DANGEROUS: 'DANGEROUS',
    } as const,
} as const;
