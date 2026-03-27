import { Elysia, t } from 'elysia';
import { streamChatCompletion } from '../llm/provider';
import { getOpenAITools, getTool, canAutoExecute } from '../tools/registry';
import { executeTool } from '../tools/executor';
import { waitForConfirmation } from '../tools/pending';
import { ChatMessageSchema } from '@aurelius/shared-schema';
import type { ChatMessage } from '@aurelius/shared-schema';
import { z } from 'zod';

const ChatRequestSchema = z.object({
    messages: z.array(ChatMessageSchema),
});

const MAX_TOOL_ITERATIONS = 10;
const MAX_SAME_TOOL_CALLS  = 4; // prevent the LLM looping the same tool
const MAX_STREAM_RETRIES   = 1; // retry a failed LLM call once per iteration

/**
 * Converts raw stream error messages into human-readable strings.
 */
function formatStreamError(raw: string): string {
    const r = raw.toLowerCase();
    if (r.includes('input stream') || r.includes('stream') || r.includes('network') || r.includes('socket')) {
        return 'Connection was interrupted. Please try again.';
    }
    if (r.includes('401') || r.includes('unauthorized')) {
        return 'API key is invalid or expired. Check your settings.';
    }
    if (r.includes('429') || r.includes('rate limit')) {
        return 'Rate limit reached. Please wait a moment and try again.';
    }
    if (r.includes('500') || r.includes('503') || r.includes('502')) {
        return 'The AI service is temporarily unavailable. Please try again.';
    }
    if (raw.length > 120) {
        return 'Something went wrong. Please try again.';
    }
    return raw;
}

/**
 * Core agentic loop.
 *
 * Each iteration:
 *   1. Calls the LLM with the current message context + tool definitions
 *   2. Streams text chunks to the client
 *   3. If the LLM emits a tool_call:
 *        - SAFE        → auto-execute, emit tool_auto, append result, loop
 *        - SENSITIVE / DANGEROUS → emit tool_confirm, pause, await user decision,
 *                                   execute or skip, loop
 *   4. If the LLM emits only text (no tool call) → done
 */
async function* agentLoop(
    initialMessages: ChatMessage[],
): AsyncGenerator<string, void, unknown> {
    // Work on a mutable copy so we can append tool results
    const messages: ChatMessage[] = [...initialMessages];
    const tools = getOpenAITools();

    // Track how many times each tool has been called this response
    const toolCallCounts = new Map<string, number>();

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        let textContent = '';
        let toolCallEvent: { id: string; name: string; arguments: string } | null = null;

        // ── Stream one LLM turn (with retry if stream dies before any content) ──
        let streamAttempt = 0;
        let streamDone    = false;

        while (!streamDone) {
            let hasYieldedContent = false;
            try {
                for await (const event of streamChatCompletion(messages, tools)) {
                    if (event.type === 'text') {
                        hasYieldedContent = true;
                        textContent += event.content;
                        yield `event: chunk\ndata: ${JSON.stringify({ content: event.content })}\n\n`;
                    } else if (event.type === 'tool_call') {
                        if (!toolCallEvent) toolCallEvent = event;
                    }
                }
                streamDone = true;
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);

                if (!hasYieldedContent && streamAttempt < MAX_STREAM_RETRIES) {
                    streamAttempt++;
                    textContent   = '';
                    toolCallEvent = null;
                    console.warn(`[AgentLoop] Stream error on attempt ${streamAttempt} — retrying in 800ms… (${msg})`);
                    await Bun.sleep(800);
                } else {
                    // Content was already streamed or retries exhausted — propagate
                    throw new Error(formatStreamError(msg));
                }
            }
        }

        // ── No tool call → final text response, exit loop ────────────────
        if (!toolCallEvent) break;

        // ── Per-tool call cap ─────────────────────────────────────────────────
        const prevCount = toolCallCounts.get(toolCallEvent.name) ?? 0;
        if (prevCount >= MAX_SAME_TOOL_CALLS) {
            console.warn(`[AgentLoop] Tool "${toolCallEvent.name}" hit per-turn cap (${MAX_SAME_TOOL_CALLS}). Stopping loop.`);

            messages.push({
                id: crypto.randomUUID(),
                role: 'tool',
                content: `You have already called "${toolCallEvent.name}" ${MAX_SAME_TOOL_CALLS} times this response. Do not call it again. Synthesise the information you have and give a final answer now.`,
                tool_call_id: toolCallEvent.id,
                timestamp: Date.now(),
            });
            continue;
        }
        toolCallCounts.set(toolCallEvent.name, prevCount + 1);

        // ── Look up the tool definition ───────────────────────────────────────
        const tool = getTool(toolCallEvent.name);

        if (!tool) {
            // Unknown tool — tell the LLM and continue
            console.warn(`[AgentLoop] Unknown tool requested: "${toolCallEvent.name}"`);

            messages.push({
                id: crypto.randomUUID(),
                role: 'assistant',
                content: textContent,
                tool_calls: [{
                    id: toolCallEvent.id,
                    type: 'function',
                    function: { name: toolCallEvent.name, arguments: toolCallEvent.arguments },
                }],
                timestamp: Date.now(),
            });

            messages.push({
                id: crypto.randomUUID(),
                role: 'tool',
                content: `Error: Tool "${toolCallEvent.name}" is not registered.`,
                tool_call_id: toolCallEvent.id,
                timestamp: Date.now(),
            });

            continue;
        }

        // ── Parse arguments safely ────────────────────────────────────────
        let parsedArgs: Record<string, unknown> = {};
        try {
            parsedArgs = JSON.parse(toolCallEvent.arguments || '{}') as Record<string, unknown>;
        } catch {
            parsedArgs = {};
        }

        let toolResult: string;

        // ── SAFE → auto-execute ───────────────────────────────────────────
        if (canAutoExecute(tool)) {
            console.log(`[AgentLoop] Auto-executing SAFE tool: ${tool.name}`);

            toolResult = await executeTool(tool.name, parsedArgs);

            yield `event: tool_auto\ndata: ${JSON.stringify({
                toolName: tool.name,
                displayName: tool.displayName,
                result: toolResult,
            })}\n\n`;

        // ── SENSITIVE / DANGEROUS → request user confirmation ─────────────
        } else {
            const confirmId = crypto.randomUUID();

            console.log(`[AgentLoop] Requesting confirmation for ${tool.permissionLevel} tool: ${tool.name} (id: ${confirmId})`);

            yield `event: tool_confirm\ndata: ${JSON.stringify({
                id: confirmId,
                toolName: tool.name,
                displayName: tool.displayName,
                description: tool.description,
                permissionLevel: tool.permissionLevel,
                args: parsedArgs,
                timestamp: Date.now(),
            })}\n\n`;

            const decision = await waitForConfirmation(confirmId);

            if (decision === 'rejected' || decision === 'timeout') {
                const reason = decision === 'timeout' ? 'timed out' : 'rejected by user';
                console.log(`[AgentLoop] Tool "${tool.name}" ${reason}`);

                toolResult = `Tool execution was ${reason}.`;

                yield `event: tool_rejected\ndata: ${JSON.stringify({
                    pendingId: confirmId,
                    toolName: tool.name,
                    reason,
                })}\n\n`;

            } else {
                console.log(`[AgentLoop] Tool "${tool.name}" approved — executing`);

                toolResult = await executeTool(tool.name, parsedArgs);

                yield `event: tool_executed\ndata: ${JSON.stringify({
                    pendingId: confirmId,
                    toolName: tool.name,
                    displayName: tool.displayName,
                    result: toolResult,
                })}\n\n`;
            }
        }

        // ── Append tool call + result to context for next iteration ───────
        messages.push({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: textContent,
            tool_calls: [{
                id: toolCallEvent.id,
                type: 'function',
                function: {
                    name: toolCallEvent.name,
                    arguments: toolCallEvent.arguments,
                },
            }],
            timestamp: Date.now(),
        });

        messages.push({
            id: crypto.randomUUID(),
            role: 'tool',
            content: toolResult,
            tool_call_id: toolCallEvent.id,
            timestamp: Date.now(),
        });
    }

    // ── Safety net: if the loop ended after a tool call (hit iteration cap
    //    or the last iteration was a tool call), do one final LLM call
    //    WITHOUT tools to force a text summary so the user never gets silence.
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'tool') {
        messages.push({
            id: crypto.randomUUID(),
            role: 'system',
            content: 'You have finished all tool calls. Now give the user a concise final text summary of everything you did and the results. Do NOT call any more tools.',
            timestamp: Date.now(),
        });

        try {
            for await (const event of streamChatCompletion(messages, undefined)) {
                if (event.type === 'text' && event.content) {
                    yield `event: chunk\ndata: ${JSON.stringify({ content: event.content })}\n\n`;
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[AgentLoop] Final summary stream error:', msg);
        }
    }
}

/**
 * SSE Chat Streaming Route
 */
export const chatStreamRoute = new Elysia({ prefix: '/chat' })
    .post(
        '/stream',
        async function* ({ body }) {
            const { messages } = ChatRequestSchema.parse(body);

            yield `event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`;

            try {
                yield* agentLoop(messages);
                yield `event: done\ndata: ${JSON.stringify({ status: 'complete' })}\n\n`;
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error('[ChatStream] Error:', message);
                yield `event: error\ndata: ${JSON.stringify({ error: message })}\n\n`;
            }
        },
        {
            body: t.Object({
                messages: t.Array(t.Any()),
            }),
        }
    );
