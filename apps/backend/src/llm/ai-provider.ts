/**
 * Vercel AI SDK model factory.
 *
 * Routes to OpenRouter or Ollama based on the live settings store,
 * so switching providers in the UI takes effect immediately.
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createOllama } from 'ollama-ai-provider';
import { getSettings } from '../config/settings.store';
import { wrapLanguageModel, generateText, type LanguageModel, type LanguageModelMiddleware } from 'ai';
import { sanitizeMiddleware } from './sanitize-middleware';
import type { ChatMessage } from '@aurelius/shared-schema';

/**
 * Return the active Vercel AI SDK model instance.
 * Called once per request — reads live settings at call time.
 * The model is wrapped with sanitization middleware to filter
 * prompt leak lines and unicode artefacts from the output.
 */
export function getModel(): LanguageModel {
    const s = getSettings();
    let raw: LanguageModel;

    if (s.llmProvider === 'openrouter') {
        if (!s.openrouterApiKey) {
            throw new Error(
                'OpenRouter API key is not set. Go to Settings → OpenRouter Configuration to add it.',
            );
        }
        const openrouter = createOpenRouter({
            apiKey: s.openrouterApiKey,
            baseURL: s.openrouterBaseUrl,
            headers: {
                'HTTP-Referer': s.openrouterSiteUrl,
                'X-Title': s.openrouterSiteName,
            },
        });
        raw = openrouter(s.openrouterModel) as unknown as LanguageModel;
    } else {
        // Ollama (default — privacy-first local inference)
        const ollama = createOllama({ baseURL: `${s.ollamaHost}/api` });
        raw = ollama(s.ollamaModel) as unknown as LanguageModel;
    }

    return wrapLanguageModel({
        model: raw as Parameters<typeof wrapLanguageModel>[0]['model'],
        middleware: sanitizeMiddleware as LanguageModelMiddleware,
    });
}

/**
 * Human-readable provider label for the startup banner.
 */
export function getActiveProviderLabel(): string {
    const s = getSettings();
    if (s.llmProvider === 'openrouter') {
        return `OpenRouter (${s.openrouterModel})`;
    }
    return `Ollama (${s.ollamaModel} @ ${s.ollamaHost})`;
}

/**
 * Non-streaming text generation.
 * Drop-in replacement for the old `chatCompletion()` from `provider.ts`.
 * Used by memory extraction, skill generation, etc.
 */
export async function generateCompletion(
    messages: ChatMessage[],
    systemPrompt?: string,
): Promise<string> {
    const s = getSettings();
    const model = getModel();

    const result = await generateText({
        model,
        system: systemPrompt,
        messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
        })),
        temperature: s.temperature,
        maxOutputTokens: s.maxTokens,
    });

    return result.text;
}
