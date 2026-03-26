import { z } from 'zod';

const envSchema = z.object({
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('localhost'),
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
    OPENROUTER_SITE_URL: z.string().default('http://localhost:3000'),
    OPENROUTER_SITE_NAME: z.string().default('AURELIUS'),

    // Audio Engine (Phase 2)
    AUDIO_ENGINE_URL: z.string().default('ws://localhost:8000/ws'),

    // Tavily Web Search
    TAVILY_API_KEY: z.string().optional(),

    // CORS
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
