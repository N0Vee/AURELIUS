import { Elysia, t } from 'elysia';
import {
    getPublicSettings,
    getSettings,
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
    });
