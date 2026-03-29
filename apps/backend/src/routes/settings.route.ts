import { Elysia, t } from 'elysia';
import {
    getPublicSettings,
    getSettings,
    getSettingsFilePath,
    updateSettings,
    SettingsSchema,
} from '../config/settings.store';

export const settingsRoute = new Elysia({ prefix: '/api/settings' })

    // ----------------------------------------------------------
    // GET /api/settings
    // Returns current settings with API key masked
    // ----------------------------------------------------------
    .get('/', () => {
        return getPublicSettings();
    })

    // ----------------------------------------------------------
    // GET /api/settings/info
    // Returns debug info about the settings store (file path, etc.)
    // ----------------------------------------------------------
    .get('/info', () => {
        return {
            settingsFilePath: getSettingsFilePath(),
        };
    })

    // ----------------------------------------------------------
    // PATCH /api/settings
    // Accepts a partial settings object, merges and persists it
    // ----------------------------------------------------------
    .patch(
        '/',
        async ({ body }) => {
            const partial = SettingsSchema.partial().parse(body);
            await updateSettings(partial);
            return getPublicSettings();
        },
        {
            body: t.Object({
                llmProvider:        t.Optional(t.Union([t.Literal('ollama'), t.Literal('openrouter')])),
                ollamaHost:         t.Optional(t.String()),
                ollamaModel:        t.Optional(t.String()),
                openrouterApiKey:   t.Optional(t.String()),
                openrouterModel:    t.Optional(t.String()),
                openrouterBaseUrl:  t.Optional(t.String()),
                openrouterSiteUrl:  t.Optional(t.String()),
                openrouterSiteName: t.Optional(t.String()),
                corsOrigin:         t.Optional(t.String()),
                audioEngineUrl:     t.Optional(t.String()),
                tavilyApiKey:       t.Optional(t.String()),
                screenshotSavePath: t.Optional(t.String()),
                defaultFileRoot:    t.Optional(t.String()),
                allowedReadRoots:   t.Optional(t.Array(t.String())),
                allowedWriteRoot:   t.Optional(t.String()),
                appSearchRoots:     t.Optional(t.Array(t.String())),
                systemPrompt:       t.Optional(t.String()),
                temperature:        t.Optional(t.Number()),
                maxTokens:          t.Optional(t.Number()),
            }),
        }
    )

    // ----------------------------------------------------------
    // POST /api/settings/test
    // Probes the currently active provider to check connectivity
    // ----------------------------------------------------------
    .post('/test', async () => {
        const s = getSettings();

        // ── Ollama ────────────────────────────────────────────
        if (s.llmProvider === 'ollama') {
            try {
                const res = await fetch(`${s.ollamaHost}/api/tags`, {
                    signal: AbortSignal.timeout(5000),
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({})) as { models?: unknown[] };
                    const modelCount = Array.isArray(data?.models) ? data.models.length : 0;
                    return {
                        success: true,
                        provider: 'ollama',
                        message: `Connected to Ollama at ${s.ollamaHost} — ${modelCount} model(s) available`,
                    };
                }

                return {
                    success: false,
                    provider: 'ollama',
                    message: `Ollama responded with HTTP ${res.status} ${res.statusText}`,
                };
            } catch (err) {
                return {
                    success: false,
                    provider: 'ollama',
                    message: `Cannot reach Ollama at ${s.ollamaHost}: ${err instanceof Error ? err.message : String(err)}`,
                };
            }
        }

        // ── OpenRouter ────────────────────────────────────────
        if (!s.openrouterApiKey) {
            return {
                success: false,
                provider: 'openrouter',
                message: 'OpenRouter API key is not set. Enter it in the OpenRouter section below.',
            };
        }

        try {
            const res = await fetch(`${s.openrouterBaseUrl}/models`, {
                headers: {
                    'Authorization': `Bearer ${s.openrouterApiKey}`,
                    'HTTP-Referer': s.openrouterSiteUrl,
                    'X-Title': s.openrouterSiteName,
                },
                signal: AbortSignal.timeout(8000),
            });

            if (res.ok) {
                return {
                    success: true,
                    provider: 'openrouter',
                    message: `Connected to OpenRouter — active model: ${s.openrouterModel}`,
                };
            }

            const text = await res.text().catch(() => '');
            return {
                success: false,
                provider: 'openrouter',
                message: `OpenRouter responded with HTTP ${res.status}: ${text.slice(0, 120)}`,
            };
        } catch (err) {
            return {
                success: false,
                provider: 'openrouter',
                message: `Cannot reach OpenRouter: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    })

    // ----------------------------------------------------------
    // GET /api/settings/openrouter-models
    // Proxies the OpenRouter /models list using the stored API key
    // ----------------------------------------------------------
    .get('/openrouter-models', async () => {
        const s = getSettings();

        if (!s.openrouterApiKey) {
            console.log('[OpenRouter Models] No API key configured — returning no_key');
            return { data: [], error: 'no_key' as const };
        }

        const url = `${s.openrouterBaseUrl}/models`;
        console.log(`[OpenRouter Models] Fetching from ${url}`);

        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${s.openrouterApiKey}`,
                    'HTTP-Referer': s.openrouterSiteUrl,
                    'X-Title': s.openrouterSiteName,
                },
                signal: AbortSignal.timeout(10_000),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.error(`[OpenRouter Models] API error ${res.status}: ${text.slice(0, 200)}`);
                return {
                    data: [],
                    error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
                };
            }

            const json = await res.json() as {
                data?: Array<{
                    id: string;
                    name: string;
                    created?: number;
                    description?: string;
                    context_length?: number;
                    architecture?: {
                        modality?: string;
                        input_modalities?: string[];
                        output_modalities?: string[];
                        tokenizer?: string;
                        instruct_type?: string;
                    };
                    pricing?: {
                        prompt: string;
                        completion: string;
                        request?: string;
                        image?: string;
                    };
                    top_provider?: {
                        is_moderated?: boolean;
                        context_length?: number;
                        max_completion_tokens?: number;
                    };
                    supported_parameters?: string[];
                }>;
            };

            const models = json.data ?? [];
            console.log(`[OpenRouter Models] Returned ${models.length} models`);
            return { data: models, error: null };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to fetch models';
            console.error(`[OpenRouter Models] Fetch error: ${msg}`);
            return { data: [], error: msg };
        }
    })

    // ----------------------------------------------------------
    // GET /api/settings/openrouter-credits
    // Proxies the OpenRouter /credits endpoint using the stored API key
    // Returns total_credits purchased, total_usage consumed, and remaining
    // ----------------------------------------------------------
    .get('/openrouter-credits', async () => {
        const s = getSettings();

        if (!s.openrouterApiKey) {
            console.log('[OpenRouter Credits] No API key configured — returning no_key');
            return { data: null, error: 'no_key' as const };
        }

        const url = `${s.openrouterBaseUrl}/credits`;
        console.log(`[OpenRouter Credits] Fetching from ${url}`);

        try {
            const res = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${s.openrouterApiKey}`,
                    'HTTP-Referer': s.openrouterSiteUrl,
                    'X-Title': s.openrouterSiteName,
                },
                signal: AbortSignal.timeout(8_000),
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                console.error(`[OpenRouter Credits] API error ${res.status}: ${text.slice(0, 200)}`);
                return {
                    data: null,
                    error: `HTTP ${res.status}: ${text.slice(0, 200)}`,
                };
            }

            const json = await res.json() as {
                data: {
                    total_credits: number;
                    total_usage: number;
                };
            };

            const { total_credits, total_usage } = json.data;
            const remaining = total_credits - total_usage;

            console.log(`[OpenRouter Credits] total=$${total_credits.toFixed(4)} used=$${total_usage.toFixed(4)} remaining=$${remaining.toFixed(4)}`);

            return {
                data: {
                    total_credits,
                    total_usage,
                    remaining,
                },
                error: null,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to fetch credits';
            console.error(`[OpenRouter Credits] Fetch error: ${msg}`);
            return { data: null, error: msg };
        }
    });
