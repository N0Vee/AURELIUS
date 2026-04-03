/**
 * Vercel AI SDK chat streaming route.
 *
 * Replaces the hand-rolled SSE agent loop with `streamText` + `toUIMessageStreamResponse()`.
 * The frontend consumes this via `@ai-sdk/react` `useChat`.
 *
 * Key differences vs v1:
 *  - Multi-step tool calling is handled by `streamText({ maxSteps })`.
 *  - SAFE tools execute immediately on the server.
 *  - SENSITIVE / DANGEROUS tools use the AI SDK approval flow
 *    (`needsApproval` -> `approval-requested` -> `approval-responded`).
 *  - The UIMessage stream protocol replaces custom SSE events
 *    (chunk, text_clear, text_break, tool_auto, tool_confirm, etc.).
 */
import { Elysia, t } from 'elysia';
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai';
import { getModel } from '../llm/ai-provider';
import { buildSystemPrompt } from '../llm/runtime-context';
import { buildStepToolLoopSystemContext } from '../llm/tool-loop-guardrails';
import { getAITools, getToolPermission, getAllToolMetadata } from '../tools/ai-tools';
import { getActiveSkill } from '../skills/skills.store';
import { searchMemories } from '../memory/memory.search';
import { extractAndSaveMemories } from '../memory/memory.extractor';
import { isBrowserConnected } from '../browser/bridge';
import { CONSTANTS } from '../config/constants';
import { getSettings } from '../config/settings.store';
import { isToolResultFailure } from '../tools/tool-result';
import type { ChatMessage } from '@aurelius/shared-schema';

// ============================================================
// Helpers
// ============================================================

const MAX_TOOL_STEPS = 10;

/**
 * Extract text from a UIMessage's parts array.
 */
function getTextFromParts(msg: UIMessage): string {
    if (!Array.isArray(msg.parts)) return '';
    const textPart = msg.parts.find(
        (p) => p.type === 'text',
    );
    return textPart && 'text' in textPart ? (textPart.text as string) : '';
}

/**
 * Extract the last user message text from a UIMessage array.
 */
function getLastUserContent(messages: UIMessage[]): string | undefined {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            const text = getTextFromParts(messages[i]);
            return text || undefined;
        }
    }
    return undefined;
}

/**
 * Convert UIMessages to the lightweight ChatMessage format
 * expected by `extractAndSaveMemories`.
 */
function toChatMessages(messages: UIMessage[]): ChatMessage[] {
    return messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: getTextFromParts(m),
            timestamp: Date.now(),
        }));
}

/**
 * Converts raw stream error messages into human-readable strings.
 * (Same logic as v1 for consistency.)
 */
function formatStreamError(raw: string): string {
    const r = raw.toLowerCase();
    if (
        r.includes('402') ||
        r.includes('insufficient credits') ||
        r.includes('payment required') ||
        r.includes('quota') ||
        r.includes('billing')
    )
        return 'Insufficient API credits. Please add credits at https://openrouter.ai/settings/credits or switch to a free model.';
    if (
        r.includes('401') ||
        r.includes('unauthorized') ||
        r.includes('invalid api key') ||
        r.includes('missing auth')
    )
        return 'API key is invalid or expired. Check your settings.';
    if (r.includes('429') || r.includes('rate limit'))
        return 'Rate limit reached. Please wait a moment and try again.';
    if (
        r.includes('404') ||
        r.includes('not found') ||
        r.includes('no endpoints found')
    )
        return 'Model not found or unavailable. Check the model name in settings.';
    if (r.includes('500') || r.includes('503') || r.includes('502'))
        return 'The AI service is temporarily unavailable. Please try again.';
    if (
        r.includes('input stream') ||
        r.includes('network') ||
        r.includes('socket') ||
        r.includes('econnrefused') ||
        r.includes('enotfound')
    )
        return 'Connection was interrupted. Please try again.';
    if (raw.length > 200) return raw.slice(0, 200) + '…';
    return raw;
}

// ============================================================
// Route
// ============================================================

export const chatStreamRoute = new Elysia({ prefix: '/v2/chat' })
    // ── Main streaming endpoint ──────────────────────────────────────────────
    .post(
        '/stream',
        async ({ body }) => {
            const { messages, session_id, session_title, voice_mode } = body as {
                messages: UIMessage[];
                session_id?: string;
                session_title?: string;
                voice_mode?: boolean;
            };

            const settings = getSettings();
            const activeSkill = await getActiveSkill();

            // ── Memory injection ──────────────────────────────────────────
            let memoryContext = '';
            const lastUserContent = getLastUserContent(messages);
            if (lastUserContent) {
                try {
                    const memories = await searchMemories(
                        lastUserContent,
                        6,
                        0.2,
                    );
                    if (memories.length > 0) {
                        memoryContext = `\n\n[CONTEXT: Known facts about the user]\n${memories
                            .map(
                                (r) =>
                                    `- [${r.entry.type}] ${r.entry.content}`,
                            )
                            .join(
                                '\n',
                            )}\n\nIntegrate naturally. Never mention that you have memories or data about the user.`;
                    }
                } catch (err) {
                    console.warn(
                        '[ChatStreamV2] Memory search failed (non-fatal):',
                        err,
                    );
                }
            }

            // ── System prompt ─────────────────────────────────────────────
            const systemPrompt = buildSystemPrompt({
                basePrompt:
                    settings.systemPrompt || CONSTANTS.SYSTEM_PROMPT,
                voiceMode: voice_mode,
                skill: activeSkill
                    ? {
                          displayName: activeSkill.displayName,
                          icon: activeSkill.icon,
                          body: activeSkill.body,
                      }
                    : undefined,
                memoryContext,
            });

            // ── Tools ─────────────────────────────────────────────────────
            const browserConnected = isBrowserConnected();
            const tools = getAITools({
                filterBrowser: !browserConnected,
            });

            // ── Resolve temperature (skill override takes precedence) ─────
            const temperature =
                activeSkill?.temperature ?? settings.temperature;

            console.log(
                '[ChatStreamV2] model:',
                settings.llmProvider === 'openrouter'
                    ? settings.openrouterModel
                    : settings.ollamaModel,
                '| tools:',
                Object.keys(tools).length,
                '| temp:',
                temperature,
                '| session:',
                session_id ?? '—',
            );

            try {
                const modelMessages = await convertToModelMessages(messages);

                // ── OpenRouter Broadcast trace metadata ───────────────
                const traceMeta: Record<string, string> = {
                    environment: process.env.NODE_ENV ?? 'production',
                    generation_name: 'chat',
                };
                if (session_title && session_title !== 'New Chat') {
                    traceMeta.trace_name = session_title;
                }
                traceMeta.span_name = activeSkill
                    ? `Skill: ${activeSkill.displayName}`
                    : 'Default';

                const result = streamText({
                    model: getModel(),
                    system: systemPrompt,
                    messages: modelMessages,
                    tools,
                    stopWhen: stepCountIs(MAX_TOOL_STEPS),
                    temperature,
                    maxOutputTokens: settings.maxTokens,

                    prepareStep: ({ steps }) => {
                        const toolLoopContext = buildStepToolLoopSystemContext(steps);

                        if (!toolLoopContext) {
                            return undefined;
                        }

                        return {
                            system: `${systemPrompt}\n\n${toolLoopContext}`,
                        };
                    },

                    providerOptions: {
                        openrouter: {
                            session_id: session_id ?? undefined,
                            user: 'aurelius-local',
                            trace: traceMeta,
                        },
                    },

                    onStepFinish: ({ stepNumber, toolCalls, toolResults, finishReason }) => {
                        if (toolResults && toolResults.length > 0) {
                            const summary = toolResults
                                .map((result) => `${result.toolName}:${isToolResultFailure(result.output) ? 'failed' : 'success'}`)
                                .join(', ');

                            console.log(
                                `[ChatStreamV2] Step ${stepNumber} finished (${finishReason}). Tool results: ${summary}`,
                            );
                            return;
                        }

                        if (toolCalls && toolCalls.length > 0) {
                            const names = toolCalls
                                .map((tc) => tc.toolName)
                                .join(', ');
                            console.log(
                                `[ChatStreamV2] Step ${stepNumber} finished (${finishReason}). Tool calls: ${names}`,
                            );
                        }
                    },

                    onFinish: async ({ text, steps }) => {
                        console.log(
                            `[ChatStreamV2] Finished. Steps: ${steps.length}`,
                        );

                        // Fire-and-forget: extract memories from conversation
                        try {
                            const chatMsgs = toChatMessages(messages);
                            // Append the assistant's final text so the extractor sees it
                            if (text) {
                                chatMsgs.push({
                                    id: crypto.randomUUID(),
                                    role: 'assistant',
                                    content: text,
                                    timestamp: Date.now(),
                                });
                            }
                            extractAndSaveMemories(chatMsgs).catch((err) =>
                                console.warn(
                                    '[ChatStreamV2] Memory extraction failed (non-fatal):',
                                    err,
                                ),
                            );
                        } catch {}
                    },
                });

                // Resolve model name so the frontend can display it in the token bar
                const modelName =
                    settings.llmProvider === 'openrouter'
                        ? settings.openrouterModel
                        : settings.ollamaModel;

                return result.toUIMessageStreamResponse({
                    messageMetadata: ({ part }) => {
                        if (part.type === 'finish') {
                            return {
                                usage: {
                                    promptTokens: part.totalUsage.inputTokens ?? 0,
                                    completionTokens: part.totalUsage.outputTokens ?? 0,
                                    totalTokens: part.totalUsage.totalTokens ?? 0,
                                },
                                model: modelName,
                            };
                        }
                        return undefined;
                    },
                });
            } catch (err) {
                const raw =
                    err instanceof Error ? err.message : String(err);
                console.error('[ChatStreamV2] Error:', raw);
                return new Response(
                    JSON.stringify({ error: formatStreamError(raw) }),
                    { status: 500, headers: { 'Content-Type': 'application/json' } },
                );
            }
        },
        {
            body: t.Object({
                messages: t.Array(t.Any()),
                session_id: t.Optional(t.String()),
                session_title: t.Optional(t.String()),
                voice_mode: t.Optional(t.Boolean()),
            }),
        },
    )

    // ── Batch tool metadata (client fetches once on mount) ─────────────────────
    .get('/tools/metadata', () => getAllToolMetadata())

    // ── Tool permission info (client uses this to decide UI) ─────────────────
    .get('/tools/:name/permission', ({ params }) => {
        const permission = getToolPermission(params.name);
        return { name: params.name, permission };
    });
