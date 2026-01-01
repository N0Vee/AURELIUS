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
    const lastMessage = messages[messages.length - 1];
    let steeredMessages = toOllamaMessages(messages);

    if (lastMessage && lastMessage.role === 'user') {
        const text = lastMessage.content;
        const hasThai = /[\u0E00-\u0E7F]/.test(text);

        // Steering: Inject a final SYSTEM message to force language compliance
        // This is stronger than appending to user message
        const instruction = hasThai
            ? 'ANSWER ONLY IN THAI (ภาษาไทย).'
            : 'ANSWER ONLY IN ENGLISH.';

        steeredMessages.push({
            role: 'system',
            content: `[IMPORTANT]: ${instruction}`
        });
    }

    const ollamaMessages: OllamaMessage[] = [
        { role: 'system', content: CONSTANTS.SYSTEM_PROMPT },
        ...steeredMessages,
    ];

    console.log('[Ollama] Sending request with prompts:', JSON.stringify(ollamaMessages, null, 2));

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
                    // Filter: Whitelist ONLY Thai, English, Numbers, Punctuation, and Newlines
                    // Strips out Chinese, Arabic, emojis, etc.
                    const cleanContent = data.message.content.replace(/[^\u0E00-\u0E7F\u0000-\u007F\u200B-\u200D\uFEFF]/g, '');

                    if (cleanContent) {
                        process.stdout.write(cleanContent); // Stream to console
                        yield cleanContent;
                    }
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
