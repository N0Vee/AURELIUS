import { getSettings } from '../config/settings.store';
import type { ChatMessage } from '@aurelius/shared-schema';
import type { LLMStreamEvent, OpenAITool, TraceContext } from './types';

import {
    streamChatCompletion as ollamaStream,
    chatCompletion as ollamaChat,
} from './ollama.client';

import {
    streamChatCompletion as openRouterStream,
    chatCompletion as openRouterChat,
} from './openrouter.client';

/**
 * Active provider label for the server startup banner.
 * Reads from the live settings store so it reflects runtime changes.
 */
export function getActiveProviderLabel(): string {
    const s = getSettings();
    if (s.llmProvider === 'openrouter') {
        return `OpenRouter (${s.openrouterModel})`;
    }
    return `Ollama (${s.ollamaModel} @ ${s.ollamaHost})`;
}

/**
 * Stream chat completion — routes to the configured LLM provider.
 * Provider is resolved at call-time from the live settings store,
 * so switching providers in the UI takes effect immediately.
 *
 * Supported providers:
 *   - 'ollama'      → local Ollama instance (default, privacy-first)
 *   - 'openrouter'  → OpenRouter cloud API (requires openrouterApiKey in settings)
 */
export async function* streamChatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
    systemPromptOverride?: string,
    trace?: TraceContext,
): AsyncGenerator<LLMStreamEvent, void, unknown> {
    const { llmProvider } = getSettings();

    switch (llmProvider) {
        case 'openrouter':
            console.log('[Provider] Routing to → OpenRouter');
            yield* openRouterStream(messages, tools, systemPromptOverride, trace);
            break;

        case 'ollama':
        default:
            console.log('[Provider] Routing to → Ollama');
            // Ollama is local — trace metadata is OpenRouter-specific, skip it
            yield* ollamaStream(messages, tools, systemPromptOverride);
            break;
    }
}

/**
 * Non-streaming chat completion — routes to the configured LLM provider.
 */
export async function chatCompletion(
    messages: ChatMessage[],
    tools?: OpenAITool[],
    systemPromptOverride?: string,
    trace?: TraceContext,
): Promise<string> {
    const { llmProvider } = getSettings();

    switch (llmProvider) {
        case 'openrouter':
            return openRouterChat(messages, tools, systemPromptOverride, trace);

        case 'ollama':
        default:
            return ollamaChat(messages, tools, systemPromptOverride);
    }
}
