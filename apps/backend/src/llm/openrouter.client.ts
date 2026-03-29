import { getSettings } from '../config/settings.store';
import type { ChatMessage } from '@aurelius/shared-schema';
import type { LLMStreamEvent, OpenAITool } from './types';

interface OpenRouterMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | Array<{type: string; text?: string; image_url?: {url: string}}>;
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
    model?: string;
    choices: Array<{
        delta: OpenRouterDelta;
        finish_reason: string | null;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
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

        if (m.images && m.images.length > 0) {
            msg.content = [
                { type: 'text', text: m.content },
                ...m.images.map(img => ({
                    type: 'image_url' as const,
                    image_url: { url: img },
                })),
            ];
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

=== TOOL SELECTION RULES (MANDATORY) ===
You MUST always use the most specific tool available. NEVER use run_command when a dedicated tool exists for the task.
- To open/view/show a LOCAL FILE (image, PDF, video, audio, document) → use open_file
- To open a WEB URL (http/https) → use open_url
- To open/launch an APPLICATION → use open_app
- To read the contents of a text file → use read_file
- To list files in a directory → use list_directory
- To search for files → use find_files
- To write/create a file → use write_file
- To kill a process → use kill_process
- run_command is ONLY for shell commands that have NO dedicated tool (e.g. pip install, system diagnostics, custom scripts).

=== TOOL RESULT EVALUATION (MANDATORY) ===
- After EVERY tool call, carefully read the result. Tool results prefixed with [FAILED] or containing "Error:" mean the tool DID NOT succeed.
- If a tool FAILED, report the failure honestly to the user. NEVER claim something was successful when the tool result shows an error.
- If a tool SUCCEEDED (result prefixed with [SUCCESS] or no error), you may proceed. Do NOT call another tool just to "verify" or "confirm" — trust the result.

=== RESPONSE RULES (MANDATORY) ===
- After all tool calls are complete, you MUST ALWAYS finish with a text response summarizing what you did and the results. NEVER end silently with no text.
- Once the user's task is fully accomplished, STOP calling tools. Do NOT make extra unnecessary tool calls.
  - Do NOT call list_directory after write_file — the write result already confirms success or failure.
  - Do NOT call find_files or list_directory after the answer is already known.
  - Do NOT call read_file on a file you just wrote — the write result confirms the content.
  - Do NOT repeat a tool call that already returned a clear answer.
- If the very first tool call gives you everything you need, respond with text immediately. Do NOT chain more tools.
- Keep your final summary concise and relevant to what the user asked.
`;
}

// ============================================================
// Streaming completion
// ============================================================

export async function* streamChatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
    systemPromptOverride?: string,
    trace?: import('./types').TraceContext,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
    const settings = getSettings();
    let currentModel = settings.openrouterModel;

    if (!settings.openrouterApiKey) {
        throw new Error(
            'OpenRouter API key is not set. Go to Settings → OpenRouter Configuration to add it.',
        );
    }

    const allMessages: OpenRouterMessage[] = [
        { role: 'system', content: systemPromptOverride ?? settings.systemPrompt },
        { role: 'system', content: getHiddenRuntimeSystemContext() },
        ...toOpenRouterMessages(messages),
    ];

    console.log(
        '[OpenRouter] model:', settings.openrouterModel,
        '| tools:', tools?.length ?? 0,
        '| temp:', settings.temperature,
        '| session:', trace?.sessionId ?? '—',
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

    // ── OpenRouter Broadcast trace metadata ───────────────────────────────────
    // session_id groups every turn of the same chat session together in
    // observability platforms (Langfuse, PostHog, etc.).  Sampling is
    // deterministic per session_id so you always see complete conversations.
    if (trace?.sessionId) {
        body.session_id = trace.sessionId;
    }

    // Identifies the application in the observability dashboard
    body.user = 'aurelius-local';

    // trace field carries arbitrary metadata forwarded to all Broadcast destinations
    const traceMeta: Record<string, string> = {
        environment: process.env.NODE_ENV ?? 'production',
        generation_name: 'chat',
    };

    // Use the session title as the human-readable trace name.
    // Skip the placeholder 'New Chat' — it is replaced automatically after the
    // first message saves, so the next turn will carry the real title.
    if (trace?.sessionTitle && trace.sessionTitle !== 'New Chat') {
        traceMeta.trace_name = trace.sessionTitle;
    }

    // Active skill name becomes the span that groups LLM calls in a session
    traceMeta.span_name = trace?.skillName
        ? `Skill: ${trace.skillName}`
        : 'Default';

    body.trace = traceMeta;
    // ─────────────────────────────────────────────────────────────────────────

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
        // Try to extract the nested error message for cleaner downstream formatting
        let errorMessage = `OpenRouter error ${response.status}`;
        try {
            const parsed = JSON.parse(errorText);
            if (parsed?.error?.message) {
                errorMessage = `OpenRouter ${response.status}: ${parsed.error.message}`;
            } else {
                errorMessage = `OpenRouter ${response.status}: ${errorText}`;
            }
        } catch {
            errorMessage = `OpenRouter ${response.status}: ${errorText || response.statusText}`;
        }
        console.error('[OpenRouter] API error:', errorMessage);
        throw new Error(errorMessage);
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

                // Track model name reported by the server
                if (chunk.model) currentModel = chunk.model;

                // Usage info is in the last chunk before [DONE]
                if (chunk.usage) {
                    yield {
                        type: 'usage',
                        promptTokens:     chunk.usage.prompt_tokens,
                        completionTokens: chunk.usage.completion_tokens,
                        totalTokens:      chunk.usage.total_tokens,
                        model:            currentModel,
                    };
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
    systemPromptOverride?: string,
    trace?: import('./types').TraceContext,
): Promise<string> {
    let result = '';
    for await (const event of streamChatCompletion(messages, tools, systemPromptOverride, trace)) {
        if (event.type === 'text') result += event.content;
    }
    return result;
}
