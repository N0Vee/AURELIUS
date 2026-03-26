import { getSettings } from '../config/settings.store';
import type { ChatMessage } from '@aurelius/shared-schema';
import type { LLMStreamEvent, OpenAITool } from './types';

interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
}

interface OpenRouterDelta {
    content?: string;
    tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
            name?: string;
            arguments?: string;
        };
    }>;
}

interface OpenRouterChunk {
    id: string;
    choices: Array<{
        delta: OpenRouterDelta;
        finish_reason: string | null;
    }>;
}

// ============================================================
// Message conversion
// ============================================================

function toOpenRouterMessages(messages: ChatMessage[]): OpenRouterMessage[] {
    return messages.map(m => {
        const msg: OpenRouterMessage = {
            role: m.role as OpenRouterMessage['role'],
            content: m.content,
        };

        if (m.tool_calls) {
            msg.tool_calls = m.tool_calls.map(tc => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                    name: tc.function.name,
                    arguments: tc.function.arguments,
                },
            }));
        }

        if (m.tool_call_id) {
            msg.tool_call_id = m.tool_call_id;
        }

        return msg;
    });
}

// ============================================================
// Output filtering
// ============================================================

function shouldDropPromptLeakLine(line: string): boolean {
    const normalized = line
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    if (!normalized) return false;

    const leakPatterns = [
        'use thai polite particles',
        'refer to yourself as',
        'address aum as',
        'be concise and natural',
        'be concise.',
        'reply in english only',
        'reply in thai only',
        'answer only in thai',
        'answer only in english',
        'thai speech rules',
        'language absolute rule',
        'personality & tone',
        'response format',
        'tools',
        'polite particle',
        'self-reference',
    ];

    return leakPatterns.some(pattern => normalized.includes(pattern));
}

function sanitizeOutputChunk(raw: string): string {
    const clean = raw.replace(
        /[^\u0E00-\u0E7F\u0000-\u007F\u200B-\u200D\uFEFF]/g,
        '',
    );

    if (!clean) return '';

    const lines = clean.split('\n');
    const kept = lines.filter(line => !shouldDropPromptLeakLine(line));

    return kept.join('\n');
}

// ============================================================
// Hidden runtime system context
// ============================================================

function getHiddenRuntimeSystemContext(): string {
    const username = process.env.USERNAME?.trim() || 'UsEr';
    const userProfile = process.env.USERPROFILE?.trim() || `C:\\Users\\${username}`;

    return `System environment:
- Operating system: Windows
- Current Windows username: ${username}
- User home directory: ${userProfile}
- Never invent a different Windows username in file paths.
- Prefer exact tool-returned paths when available.
- For local folders, prefer known paths under ${userProfile} such as Desktop, Documents, Downloads, Pictures, and Videos.
`;
}

// ============================================================
// Streaming completion
// ============================================================

export async function* streamChatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
): AsyncGenerator<LLMStreamEvent, void, unknown> {
    const settings = getSettings();

    if (!settings.openrouterApiKey) {
        throw new Error(
            'OpenRouter API key is not set. Go to Settings → OpenRouter Configuration to add it.',
        );
    }

    const allMessages: OpenRouterMessage[] = [
        { role: 'system', content: settings.systemPrompt },
        { role: 'system', content: getHiddenRuntimeSystemContext() },
        ...toOpenRouterMessages(messages),
    ];

    console.log(
        '[OpenRouter] model:', settings.openrouterModel,
        '| tools:', tools?.length ?? 0,
        '| temp:', settings.temperature,
    );

    const body: Record<string, unknown> = {
        model: settings.openrouterModel,
        messages: allMessages,
        stream: true,
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
    }

    const response = await fetch(`${settings.openrouterBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.openrouterApiKey}`,
            'HTTP-Referer': settings.openrouterSiteUrl,
            'X-Title': settings.openrouterSiteName,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text().catch(() => response.statusText);
        throw new Error(`OpenRouter error: ${response.status} ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body from OpenRouter');

    const decoder = new TextDecoder();
    let buffer = '';

    // Accumulate tool call deltas — keyed by index
    const toolCallAccumulator = new Map<number, {
        id: string;
        name: string;
        arguments: string;
    }>();

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;

            const jsonStr = trimmed.slice('data: '.length);
            if (jsonStr === '[DONE]') {
                for (const [, tc] of toolCallAccumulator) {
                    if (tc.name) {
                        yield {
                            type: 'tool_call',
                            id: tc.id,
                            name: tc.name,
                            arguments: tc.arguments,
                        };
                    }
                }
                toolCallAccumulator.clear();
                yield { type: 'done' };
                return;
            }

            try {
                const chunk: OpenRouterChunk = JSON.parse(jsonStr);
                const choice = chunk.choices?.[0];
                if (!choice) continue;

                const delta = choice.delta;

                // ── Text content ──────────────────────────────────────
                if (delta.content) {
                    const sanitized = sanitizeOutputChunk(delta.content);
                    if (sanitized.trim()) {
                        process.stdout.write(sanitized);
                        yield { type: 'text', content: sanitized };
                    }
                }

                // ── Tool call deltas ──────────────────────────────────
                if (delta.tool_calls) {
                    for (const tcDelta of delta.tool_calls) {
                        const idx = tcDelta.index ?? 0;

                        if (!toolCallAccumulator.has(idx)) {
                            toolCallAccumulator.set(idx, {
                                id: tcDelta.id ?? crypto.randomUUID(),
                                name: '',
                                arguments: '',
                            });
                        }

                        const acc = toolCallAccumulator.get(idx)!;

                        if (tcDelta.id) acc.id = tcDelta.id;
                        if (tcDelta.function?.name) acc.name += tcDelta.function.name;
                        if (tcDelta.function?.arguments) acc.arguments += tcDelta.function.arguments;
                    }
                }

                // ── finish_reason: tool_calls — flush accumulated calls
                if (choice.finish_reason === 'tool_calls') {
                    for (const [, tc] of toolCallAccumulator) {
                        if (tc.name) {
                            yield {
                                type: 'tool_call',
                                id: tc.id,
                                name: tc.name,
                                arguments: tc.arguments,
                            };
                        }
                    }
                    toolCallAccumulator.clear();
                }
            } catch {
                // Skip malformed JSON chunks
            }
        }
    }

    // Flush any remaining tool calls if stream ended without [DONE]
    for (const [, tc] of toolCallAccumulator) {
        if (tc.name) {
            yield {
                type: 'tool_call',
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
            };
        }
    }

    yield { type: 'done' };
}

// ============================================================
// Non-streaming helper
// ============================================================

export async function chatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
): Promise<string> {
    let result = '';
    for await (const event of streamChatCompletion(messages, tools)) {
        if (event.type === 'text') result += event.content;
    }
    return result;
}
