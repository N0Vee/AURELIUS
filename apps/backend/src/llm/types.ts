// ============================================================
// LLM Stream Event
// Unified event type yielded by both Ollama and OpenRouter clients
// ============================================================

export type LLMStreamEvent =
    | { type: 'text';      content: string }
    | { type: 'tool_call'; id: string; name: string; arguments: string }
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
