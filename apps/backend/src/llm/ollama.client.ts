import { env } from '../config/env';
import { CONSTANTS } from '../config/constants';
import type { ChatMessage } from '@aurelius/shared-schema';

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OllamaStreamResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
}

/**
 * Convert our ChatMessage format to Ollama format
 */
function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
    return messages
        .filter(m => m.role !== 'tool')
        .map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
        }));
}

/**
 * Stream chat completion from Ollama
 */
export async function* streamChatCompletion(
    messages: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
    const ollamaMessages: OllamaMessage[] = [
        { role: 'system', content: CONSTANTS.SYSTEM_PROMPT },
        ...toOllamaMessages(messages),
    ];

    const response = await fetch(`${env.OLLAMA_HOST}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: env.OLLAMA_MODEL,
            messages: ollamaMessages,
            stream: true,
            options: {
                temperature: CONSTANTS.TEMPERATURE,
                num_predict: CONSTANTS.MAX_TOKENS,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;

            try {
                const data: OllamaStreamResponse = JSON.parse(line);
                if (data.message?.content) {
                    yield data.message.content;
                }
            } catch {
                // Skip malformed JSON
            }
        }
    }
}

/**
 * Non-streaming chat completion
 */
export async function chatCompletion(messages: ChatMessage[]): Promise<string> {
    let fullResponse = '';
    for await (const chunk of streamChatCompletion(messages)) {
        fullResponse += chunk;
    }
    return fullResponse;
}
