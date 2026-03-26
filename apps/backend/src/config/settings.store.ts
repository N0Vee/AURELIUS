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

    // Tools
    tavilyApiKey: z.string(),
    screenshotSavePath: z.string(),
    defaultFileRoot: z.string(),
    allowedReadRoots: z.array(z.string()),
    allowedWriteRoot: z.string(),
    appSearchRoots: z.array(z.string()),
});

export type Settings = z.infer<typeof SettingsSchema>;

/** Settings shape returned to the client — API keys are masked */
export type PublicSettings = Omit<Settings, 'openrouterApiKey' | 'tavilyApiKey'> & {
    openrouterApiKey: string;      // '***' when set, '' when not set
    openrouterApiKeySet: boolean;
    tavilyApiKey: string;          // '***' when set, '' when not set
    tavilyApiKeySet: boolean;
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
        tavilyApiKey: env.TAVILY_API_KEY ?? '',
        screenshotSavePath: 'C:\\Users\\UsEr\\Pictures\\AURELIUS',
        defaultFileRoot: 'C:\\Users\\UsEr\\Documents',
        allowedReadRoots: [
            'C:\\Users\\UsEr\\Desktop',
            'C:\\Users\\UsEr\\Documents',
            'C:\\Users\\UsEr\\Downloads',
            'C:\\Users\\UsEr\\Pictures',
            'C:\\Users\\UsEr\\Videos',
        ],
        allowedWriteRoot: 'C:\\Users\\UsEr\\Documents\\AURELIUS',
        appSearchRoots: [
            'C:\\Program Files',
            'C:\\Program Files (x86)',
            'C:\\Users\\UsEr\\AppData\\Local',
            'C:\\Users\\UsEr\\AppData\\Roaming',
        ],
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

    if ('tavilyApiKey' in partial && partial.tavilyApiKey === '***') {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tavilyApiKey: _ignored, ...rest } = partial;
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
        tavilyApiKey: s.tavilyApiKey ? '***' : '',
        tavilyApiKeySet: Boolean(s.tavilyApiKey),
        screenshotSavePath: s.screenshotSavePath,
        defaultFileRoot: s.defaultFileRoot,
        allowedReadRoots: s.allowedReadRoots,
        allowedWriteRoot: s.allowedWriteRoot,
        appSearchRoots: s.appSearchRoots,
    };
}
