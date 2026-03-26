import { z } from 'zod';
import { env } from './env';
import { CONSTANTS } from './constants';
import path from 'path';

// Persisted at apps/backend/settings.json
// import.meta.dir = apps/backend/src/config  →  ../.. = apps/backend
const SETTINGS_FILE = path.resolve(import.meta.dir, '../..', 'settings.json');

// ============================================================
// Schema
// ============================================================
export const SettingsSchema = z.object({
    // LLM
    llmProvider: z.enum(['ollama', 'openrouter']),

    // Ollama
    ollamaHost: z.string().min(1),
    ollamaModel: z.string().min(1),

    // OpenRouter
    openrouterApiKey: z.string(),
    openrouterModel: z.string().min(1),
    openrouterBaseUrl: z.string().min(1),
    openrouterSiteUrl: z.string(),
    openrouterSiteName: z.string(),

    // Network
    corsOrigin: z.string().min(1),

    // Audio Engine (Phase 2)
    audioEngineUrl: z.string(),

    // Prompt & Model Behavior
    systemPrompt: z.string(),
    temperature: z.number().min(0).max(2),
    maxTokens: z.number().int().min(1).max(32768),
});

export type Settings = z.infer<typeof SettingsSchema>;

/** Settings shape returned to the client — API key is masked */
export type PublicSettings = Omit<Settings, 'openrouterApiKey'> & {
    openrouterApiKey: string;      // '***' when set, '' when not set
    openrouterApiKeySet: boolean;
};

// ============================================================
// Defaults — sourced from .env / process.env at startup
// ============================================================
function envDefaults(): Settings {
    return {
        llmProvider: env.LLM_PROVIDER,
        ollamaHost: env.OLLAMA_HOST,
        ollamaModel: env.OLLAMA_MODEL,
        openrouterApiKey: env.OPENROUTER_API_KEY ?? '',
        openrouterModel: env.OPENROUTER_MODEL,
        openrouterBaseUrl: env.OPENROUTER_BASE_URL,
        openrouterSiteUrl: env.OPENROUTER_SITE_URL,
        openrouterSiteName: env.OPENROUTER_SITE_NAME,
        corsOrigin: env.CORS_ORIGIN,
        audioEngineUrl: env.AUDIO_ENGINE_URL,
        systemPrompt: CONSTANTS.SYSTEM_PROMPT,
        temperature: CONSTANTS.TEMPERATURE,
        maxTokens: CONSTANTS.MAX_TOKENS,
    };
}

// ============================================================
// In-memory store
// ============================================================
let _settings: Settings = envDefaults();

// ============================================================
// Public API
// ============================================================

/**
 * Load settings.json on server startup.
 * Values in settings.json override env defaults.
 * Must be awaited before the server starts accepting requests.
 */
export async function initSettings(): Promise<void> {
    try {
        const file = Bun.file(SETTINGS_FILE);
        if (await file.exists()) {
            const raw = (await file.json()) as unknown;
            const result = SettingsSchema.partial().safeParse(raw);
            if (result.success) {
                _settings = { ...envDefaults(), ...result.data };
                console.log('[Settings] Loaded from settings.json');
            } else {
                console.warn(
                    '[Settings] settings.json failed validation — using env defaults.\n',
                    result.error.flatten()
                );
            }
        } else {
            console.log('[Settings] No settings.json found — using env defaults');
        }
    } catch (err) {
        console.warn('[Settings] Could not read settings.json:', err);
    }
}

/**
 * Get the current in-memory settings.
 * Called at request time so runtime changes are always reflected.
 */
export function getSettings(): Settings {
    return _settings;
}

/**
 * Merge a partial update into the in-memory settings and persist to settings.json.
 *
 * Special rule: if `openrouterApiKey === '***'` (the masked sentinel),
 * the existing key is kept unchanged so the UI doesn't accidentally wipe it.
 */
export async function updateSettings(partial: Partial<Settings>): Promise<Settings> {
    if ('openrouterApiKey' in partial && partial.openrouterApiKey === '***') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { openrouterApiKey: _ignored, ...rest } = partial;
        partial = rest;
    }

    _settings = { ..._settings, ...partial };

    await Bun.write(SETTINGS_FILE, JSON.stringify(_settings, null, 2));
    console.log('[Settings] Persisted to settings.json');

    return _settings;
}

/**
 * Return settings safe to send to the browser.
 * The OpenRouter API key is replaced with '***' if it has a value.
 */
export function getPublicSettings(): PublicSettings {
    const s = getSettings();
    return {
        ...s,
        openrouterApiKey: s.openrouterApiKey ? '***' : '',
        openrouterApiKeySet: Boolean(s.openrouterApiKey),
    };
}
