import { Elysia, t } from 'elysia';
import { streamChatCompletion } from '../llm/provider';
import { getActiveSkill } from '../skills/skills.store';
import { getOpenAITools, getTool, canAutoExecute } from '../tools/registry';
import { executeTool } from '../tools/executor';
import { getAutomationByName, streamAutomationSteps } from '../tools/automations';
import { waitForConfirmation } from '../tools/pending';
import { isBrowserConnected } from '../browser/bridge';
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

    // Payment / credits — surface clearly so the user knows to top up
    if (r.includes('402') || r.includes('insufficient credits') || r.includes('payment required') || r.includes('quota') || r.includes('billing')) {
        return 'Insufficient API credits. Please add credits at https://openrouter.ai/settings/credits or switch to a free model.';
    }
    if (r.includes('401') || r.includes('unauthorized') || r.includes('invalid api key') || r.includes('missing auth')) {
        return 'API key is invalid or expired. Check your settings.';
    }
    if (r.includes('429') || r.includes('rate limit')) {
        return 'Rate limit reached. Please wait a moment and try again.';
    }
    if (r.includes('404') || r.includes('not found') || r.includes('no endpoints found')) {
        return 'Model not found or unavailable. Check the model name in settings.';
    }
    if (r.includes('500') || r.includes('503') || r.includes('502')) {
        return 'The AI service is temporarily unavailable. Please try again.';
    }
    if (r.includes('input stream') || r.includes('network') || r.includes('socket') || r.includes('econnrefused') || r.includes('enotfound')) {
        return 'Connection was interrupted. Please try again.';
    }

    // For long unrecognised errors, log full text but return a useful summary
    if (raw.length > 200) {
        console.error('[formatStreamError] Long error truncated. Full text:', raw);
        return raw.slice(0, 200) + '…';
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

    // ── Active skill injection ────────────────────────────────────────────────
    // If the user has an active skill, prepend its instructions as a system
    // message so the LLM follows the skill's behavioral overlay on top of the
    // base Aurelius personality.
    const activeSkill = await getActiveSkill();
    if (activeSkill) {
        messages.unshift({
            id: crypto.randomUUID(),
            role: 'system',
            content: `[ACTIVE SKILL: ${activeSkill.displayName} ${activeSkill.icon}]\n\n${activeSkill.body}`,
            timestamp: Date.now(),
        });
        console.log(`[AgentLoop] Skill active: ${activeSkill.name} (${activeSkill.displayName})`);
    }

    // Only include browser tools if the extension is currently connected.
    // Without this guard, 16 extra tool schemas are sent to the LLM on every
    // request, bloating the context and causing smaller models to hang.
    const browserConnected = isBrowserConnected();
    const tools = getOpenAITools().filter((t) => {
        if (t.function.name.startsWith('browser_')) return browserConnected;
        return true;
    });

    // Track how many times each tool has been called this response
    const toolCallCounts = new Map<string, number>();

    let lastIterationYieldedText = false;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        let textContent = '';
        lastIterationYieldedText = false;
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
                        lastIterationYieldedText = true;
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
                    console.warn(`[AgentLoop] Stream error on attempt ${streamAttempt} — retrying in 800ms…`);
                    console.warn(`[AgentLoop] Error detail:`, msg);
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

                // ── Custom automation → stream each step live ─────────────
                const automation = getAutomationByName(tool.name);

                if (automation) {
                    console.log(`[AgentLoop] Streaming automation steps for "${tool.name}"`);
                    toolResult = '';

                    for await (const event of streamAutomationSteps(automation, parsedArgs)) {
                        if (event.type === 'step_done') {
                            // Emit each step as its own tool_auto card in the UI
                            yield `event: tool_auto\ndata: ${JSON.stringify({
                                toolName: event.toolName,
                                displayName: event.skipped
                                    ? `⏭ ${event.displayName} (skipped)`
                                    : event.success
                                        ? event.displayName
                                        : `✘ ${event.displayName} (failed)`,
                                result: event.result,
                                automationStep: true,
                                stepIndex: event.stepIndex + 1,
                                totalSteps: event.totalSteps,
                            })}\n\n`;
                        } else if (event.type === 'done') {
                            toolResult = event.summary;
                        }
                    }

                    // Resolve the original automation confirmation card
                    yield `event: tool_executed\ndata: ${JSON.stringify({
                        pendingId: confirmId,
                        toolName: tool.name,
                        displayName: tool.displayName,
                        result: toolResult,
                    })}\n\n`;

                } else {
                    // ── Normal tool ───────────────────────────────────────
                    toolResult = await executeTool(tool.name, parsedArgs);

                    yield `event: tool_executed\ndata: ${JSON.stringify({
                        pendingId: confirmId,
                        toolName: tool.name,
                        displayName: tool.displayName,
                        result: toolResult,
                    })}\n\n`;
                }
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
    //    Skip if the last iteration already streamed text to the client —
    //    that means the LLM gave a proper text answer after the tool result.
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'tool' && !lastIterationYieldedText) {
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
                const rawMessage = error instanceof Error ? error.message : 'Unknown error';
                console.error('[ChatStream] Raw error:', rawMessage);
                if (error instanceof Error && error.stack) {
                    console.error('[ChatStream] Stack:', error.stack);
                }
                // Re-format at the SSE boundary so the user sees a helpful message
                const userMessage = formatStreamError(rawMessage);
                yield `event: error\ndata: ${JSON.stringify({ error: userMessage })}\n\n`;
            }
        },
        {
            body: t.Object({
                messages: t.Array(t.Any()),
            }),
        }
    );
