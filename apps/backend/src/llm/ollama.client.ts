import { getSettings } from '../config/settings.store';
import type { ChatMessage } from '@aurelius/shared-schema';
import type { LLMStreamEvent, OpenAITool } from './types';

// ============================================================
// Ollama message format
// ============================================================

interface OllamaMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    images?: string[];
    tool_calls?: Array<{
        function: {
            name: string;
            arguments: Record<string, unknown>;
        };
    }>;
    tool_call_id?: string;
}

interface OllamaStreamResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
        tool_calls?: Array<{
            function: {
                name: string;
                // Ollama returns arguments as an object, not a JSON string
                arguments: Record<string, unknown> | string;
            };
        }>;
    };
    done: boolean;
    done_reason?: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Convert our ChatMessage format to Ollama wire format.
 * Handles tool_calls (object args) and tool result messages.
 */
function toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
    return messages.map(m => {
        const msg: OllamaMessage = {
            role: m.role as OllamaMessage['role'],
            content: m.content,
        };

        // Assistant message that contains tool calls
        if (m.tool_calls && m.tool_calls.length > 0) {
            msg.tool_calls = m.tool_calls.map(tc => ({
                function: {
                    name: tc.function.name,
                    // Ollama expects arguments as an object, not a JSON string
                    arguments: JSON.parse(tc.function.arguments) as Record<string, unknown>,
                },
            }));
        }

        // User message with image attachments (vision)
        if (m.images && m.images.length > 0) {
            msg.images = m.images.map(img => img.replace(/^data:image\/[^;]+;base64,/, ''));
        }

        // Tool result message
        if (m.tool_call_id) {
            msg.tool_call_id = m.tool_call_id;
        }

        return msg;
    });
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
- To open/view a LOCAL file (image, PDF, video, audio, document) → use open_file
- To open a web URL (http/https) → use open_url
- To open/launch an application → use open_app
- To read file contents as text → use read_file
- To list folder contents → use list_directory
- To search the web → use web_search
- To write/create a file → use write_file
- To kill a process → use kill_process
- run_command is a LAST RESORT — only use it when NO other tool can accomplish the task (e.g. running scripts, piping commands, system diagnostics).

=== RESPONSE RULES (MANDATORY) ===
- After all tool calls are complete, you MUST ALWAYS finish with a text response summarizing what you did and the results. NEVER end silently with no text.
- Once the user's task is fully accomplished, STOP calling tools. Do NOT make extra unnecessary tool calls (e.g. listing directories after writing a file, or searching after the answer is already known).
- Keep your final summary concise and relevant to what the user asked.
`;
}

// ============================================================
// Stream
// ============================================================

export async function* streamChatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
    systemPromptOverride?: string,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
    const settings = getSettings();

    // Find the last user message for language steering
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');

    const steeredMessages = toOllamaMessages(messages);

    if (lastUserMessage) {
        const hasThai = /[\u0E00-\u0E7F]/.test(lastUserMessage.content);
        const instruction = hasThai
            ? 'ANSWER ONLY IN THAI (ภาษาไทย).'
            : 'ANSWER ONLY IN ENGLISH.';
        steeredMessages.push({
            role: 'system',
            content: `[IMPORTANT]: ${instruction}`,
        });
    }

    const ollamaMessages: OllamaMessage[] = [
        { role: 'system', content: systemPromptOverride ?? settings.systemPrompt },
        { role: 'system', content: getHiddenRuntimeSystemContext() },
        ...steeredMessages,
    ];

    console.log(
        '[Ollama] →',
        settings.ollamaHost,
        '| model:', settings.ollamaModel,
        '| messages:', ollamaMessages.length,
        '| tools:', tools?.length ?? 0,
    );

    const body: Record<string, unknown> = {
        model: settings.ollamaModel,
        messages: ollamaMessages,
        stream: true,
        options: {
            temperature: settings.temperature,
            num_predict: settings.maxTokens,
        },
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
    }

    const response = await fetch(`${settings.ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body from Ollama');

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

                // ── Tool call ───────────────────────────────────────
                if (data.message?.tool_calls?.length) {
                    for (const tc of data.message.tool_calls) {
                        const args =
                            typeof tc.function.arguments === 'object'
                                ? JSON.stringify(tc.function.arguments)
                                : (tc.function.arguments as string);

                        yield {
                            type: 'tool_call',
                            // Ollama does not provide call IDs — generate one
                            id: crypto.randomUUID(),
                            name: tc.function.name,
                            arguments: args,
                        };
                    }
                }

                // ── Text content ────────────────────────────────────
                if (data.message?.content) {
                    // Whitelist: Thai, ASCII, zero-width chars only
                    const clean = data.message.content.replace(
                        /[^\u0E00-\u0E7F\u0000-\u007F\u200B-\u200D\uFEFF]/g,
                        '',
                    );
                    if (clean) {
                        process.stdout.write(clean);
                        yield { type: 'text', content: clean };
                    }
                }

                if (data.done) {
                    yield { type: 'done' };
                }
            } catch {
                // Skip malformed JSON lines
            }
        }
    }
}

// ============================================================
// Non-streaming helper
// ============================================================

export async function chatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
    systemPromptOverride?: string,
): Promise<string> {
    let full = '';
    for await (const event of streamChatCompletion(messages, tools, systemPromptOverride)) {
        if (event.type === 'text') full += event.content;
    }
    return full;
}
