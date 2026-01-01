import { z } from 'zod';

const envSchema = z.object({
    PORT: z.coerce.number().default(3001),
    HOST: z.string().default('localhost'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

    // Ollama
    OLLAMA_HOST: z.string().default('http://localhost:11434'),
    OLLAMA_MODEL: z.string().default('llama3.1'),

    // Audio Engine (Phase 2)
    AUDIO_ENGINE_URL: z.string().default('ws://localhost:8000/ws'),

    // CORS
    CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
