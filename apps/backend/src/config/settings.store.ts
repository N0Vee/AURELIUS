import { z } from 'zod';
import { env } from './env';
import { CONSTANTS } from './constants';
import path from 'path';
import os from 'os';
import { mkdirSync, existsSync, copyFileSync } from 'fs';

// ============================================================
// Settings file path resolution
// ============================================================
// Always use the OS app-data directory as the single source of truth.
// This ensures dev mode (`bun run dev:backend`), Tauri dev (`dev:desktop`),
// and the compiled sidecar all read/write from the same location.
//
// In a compiled Bun binary (bun build --compile), import.meta.dir
// resolves to a virtual path like "B:\~BUN\root" which is not writable,
// so we can never rely on it for persistent storage.

function resolveSettingsDir(): string {
    // Allow explicit override via env var
    if (process.env.AURELIUS_DATA_DIR) {
        return process.env.AURELIUS_DATA_DIR;
    }

    // Use standard OS app data directory
    const appData =
        process.env.APPDATA ||                          // Windows: C:\Users\<user>\AppData\Roaming
        (process.env.HOME
            ? path.join(process.env.HOME, '.config')    // Linux/macOS fallback
            : '.');

    return path.join(appData, 'Aurelius');
}

/**
 * Try to locate the legacy dev settings file at apps/backend/settings.json.
 * Returns the path if it exists, or null.
 */
function findLegacySettingsFile(): string | null {
    // Only possible in non-compiled mode (import.meta.dir is real)
    if (import.meta.dir.includes('~BUN')) return null;

    try {
        // import.meta.dir = apps/backend/src/config → ../.. = apps/backend
        const legacyPath = path.resolve(import.meta.dir, '..', '..', 'settings.json');
        if (existsSync(legacyPath)) {
            return legacyPath;
        }
    } catch {
        // Ignore — can't access legacy path
    }

    return null;
}

const SETTINGS_DIR = resolveSettingsDir();
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// Ensure the settings directory exists (sync, runs once at module load)
try {
    mkdirSync(SETTINGS_DIR, { recursive: true });
} catch {
    // Ignore — directory may already exist or we'll error later when reading/writing
}

// ============================================================
// One-time migration: copy legacy apps/backend/settings.json → appdata
// ============================================================
if (!existsSync(SETTINGS_FILE)) {
    const legacyPath = findLegacySettingsFile();
    if (legacyPath) {
        try {
            copyFileSync(legacyPath, SETTINGS_FILE);
            console.log(`[Settings] Migrated legacy settings from ${legacyPath} → ${SETTINGS_FILE}`);
        } catch (err) {
            console.warn('[Settings] Could not migrate legacy settings.json:', err);
        }
    }
}

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
    const home = os.homedir();
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
        screenshotSavePath: path.join(home, 'Pictures', 'Aurelius'),
        defaultFileRoot: path.join(home, 'Documents'),
        allowedReadRoots: [
            path.join(home, 'Desktop'),
            path.join(home, 'Documents'),
            path.join(home, 'Downloads'),
            path.join(home, 'Pictures'),
            path.join(home, 'Videos'),
        ],
        allowedWriteRoot: path.join(home, 'Documents', 'Aurelius'),
        appSearchRoots: [
            'C:\\Program Files',
            'C:\\Program Files (x86)',
            path.join(home, 'AppData', 'Local'),
            path.join(home, 'AppData', 'Roaming'),
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
    console.log(`[Settings] Data directory : ${SETTINGS_DIR}`);
    console.log(`[Settings] Settings file  : ${SETTINGS_FILE}`);

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
            console.log('[Settings] No settings.json found — creating with env defaults');
            try {
                await Bun.write(SETTINGS_FILE, JSON.stringify(envDefaults(), null, 2));
                console.log('[Settings] Created default settings.json');
            } catch (writeErr) {
                console.warn('[Settings] Could not write default settings.json:', writeErr);
            }
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
 * Get the resolved path of the settings file (for debugging / UI display).
 */
export function getSettingsFilePath(): string {
    return SETTINGS_FILE;
}

/**
 * Merge a partial update into the in-memory settings and persist to settings.json.
 *
 * Special rule: if `openrouterApiKey === '***'` (the masked sentinel),
 * the existing key is kept unchanged so the UI doesn't accidentally wipe it.
 * Same for `tavilyApiKey`.
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

    try {
        await Bun.write(SETTINGS_FILE, JSON.stringify(_settings, null, 2));
        console.log(`[Settings] Persisted to ${SETTINGS_FILE}`);
    } catch (err) {
        console.error('[Settings] Failed to persist settings.json:', err);
    }

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
