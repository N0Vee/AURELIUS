import { getSettings } from '../config/settings.store';
import type { ChatMessage } from '@aurelius/shared-schema';

interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OpenRouterStreamChunk {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: {
        index: number;
        delta: {
            role?: string;
            content?: string;
        };
        finish_reason: string | null;
    }[];
}

/**
 * Convert our ChatMessage format to OpenRouter/OpenAI format
 */
function toOpenRouterMessages(messages: ChatMessage[]): OpenRouterMessage[] {
    return messages
        .filter(m => m.role !== 'tool')
        .map(m => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
        }));
}

/**
 * Stream chat completion from OpenRouter (OpenAI-compatible API)
 */
export async function* streamChatCompletion(
    messages: ChatMessage[]
): AsyncGenerator<string, void, unknown> {
    const settings = getSettings();

    if (!settings.openrouterApiKey) {
        throw new Error(
            'OpenRouter API key is not set. Go to Settings → OpenRouter Configuration to add it.'
        );
    }

    const lastMessage = messages[messages.length - 1];
    let steeredMessages = toOpenRouterMessages(messages);

    if (lastMessage && lastMessage.role === 'user') {
        const text = lastMessage.content;
        const hasThai = /[\u0E00-\u0E7F]/.test(text);

        // Steering: Inject a final SYSTEM message to force language compliance
        const instruction = hasThai
            ? 'ANSWER ONLY IN THAI (ภาษาไทย).'
            : 'ANSWER ONLY IN ENGLISH.';

        steeredMessages.push({
            role: 'system',
            content: `[IMPORTANT]: ${instruction}`,
        });
    }

    const openRouterMessages: OpenRouterMessage[] = [
        { role: 'system', content: settings.systemPrompt },
        ...steeredMessages,
    ];

    console.log('[OpenRouter] Sending request | model:', settings.openrouterModel, '| temp:', settings.temperature);

    const response = await fetch(`${settings.openrouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.openrouterApiKey}`,
            'HTTP-Referer': settings.openrouterSiteUrl,
            'X-Title': settings.openrouterSiteName,
        },
        body: JSON.stringify({
            model: settings.openrouterModel,
            messages: openRouterMessages,
            stream: true,
            temperature: settings.temperature,
            max_tokens: settings.maxTokens,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`OpenRouter error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body from OpenRouter');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and non-data lines
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const jsonStr = trimmed.slice('data: '.length);

            // End of stream signal
            if (jsonStr === '[DONE]') return;

            try {
                const chunk: OpenRouterStreamChunk = JSON.parse(jsonStr);
                const content = chunk.choices?.[0]?.delta?.content;

                if (content) {
                    // Filter: Whitelist ONLY Thai, English, Numbers, Punctuation, and Newlines
                    // Strips out Chinese, Arabic, emojis, etc.
                    const cleanContent = content.replace(
                        /[^\u0E00-\u0E7F\u0000-\u007F\u200B-\u200D\uFEFF]/g,
                        ''
                    );

                    if (cleanContent) {
                        process.stdout.write(cleanContent);
                        yield cleanContent;
                    }
                }
            } catch {
                // Skip malformed JSON chunks
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
