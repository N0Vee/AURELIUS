// ============================================================
// Trace Context
// Passed from the chat stream route through to the OpenRouter client
// so every API call carries Broadcast-compatible observability metadata.
// ============================================================

export interface TraceContext {
    /** Chat session UUID — groups all turns of a conversation in the dashboard */
    sessionId?: string;
    /** Human-readable session title derived from the first user message */
    sessionTitle?: string;
    /** Display name of the currently active skill (e.g. "Code Assistant") */
    skillName?: string;
}

// ============================================================
// LLM Stream Event
// Unified event type yielded by both Ollama and OpenRouter clients
// ============================================================

export type LLMStreamEvent =
    | { type: 'text';      content: string }
    | { type: 'tool_call'; id: string; name: string; arguments: string }
    | { type: 'usage'; promptTokens: number; completionTokens: number; totalTokens: number; model: string }
    | { type: 'done' };

// ============================================================
// OpenAI Function Calling Format
// Used by both Ollama and OpenRouter (they share this format)
// ============================================================

export interface OpenAIToolParameter {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    enum?: string[];
    items?: { type: string };
}

export interface OpenAITool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, OpenAIToolParameter>;
            required?: string[];
        };
    };
}
