import { z } from 'zod';

const portSchema = z.coerce.number().int().positive();

type EnvSource = Record<string, string | undefined>;

// In development, generic PORT is often injected by unrelated tools.
// Keep the backend stable on 4243 unless an explicit backend-specific env var
// is provided. In production, still honor PORT for hosting platforms.
export function resolveBackendPort(source: EnvSource): number {
    return portSchema.parse(
        source.AURELIUS_BACKEND_PORT
        ?? source.BACKEND_PORT
        ?? (source.NODE_ENV === 'production' ? source.PORT : undefined)
        ?? '4243',
    );
}

const envSchema = z.object({
    PORT: portSchema.default(4243),
    HOST: z.string().default('0.0.0.0'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // LLM Provider Selection
    LLM_PROVIDER: z.enum(['ollama', 'openrouter']).default('ollama'),

    // Ollama
    OLLAMA_HOST: z.string().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('qwen2.5:7b'),

    // OpenRouter
    OPENROUTER_API_KEY: z.string().optional(),
    OPENROUTER_MODEL: z.string().default('meta-llama/llama-3.1-8b-instruct:free'),
    OPENROUTER_BASE_URL: z.string().default('https://openrouter.ai/api/v1'),
    OPENROUTER_SITE_URL: z.string().default('http://localhost:4242'),
    OPENROUTER_SITE_NAME: z.string().default('Aurelius'),

    // Audio Engine (Phase 2)
    AUDIO_ENGINE_URL: z.string().default('ws://localhost:8000/ws'),

    // Tavily Web Search
    TAVILY_API_KEY: z.string().optional(),

    // CORS
    CORS_ORIGIN: z.string().default('http://localhost:4242'),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse({
    ...process.env,
    PORT: resolveBackendPort(process.env),
});
