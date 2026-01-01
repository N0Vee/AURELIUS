import { z } from 'zod';

// ===== Audio Chunk Schema (WebSocket Streaming) =====
export const AudioChunkSchema = z.object({
    streamId: z.string(),
    chunk: z.string(), // Base64 encoded audio data
    isFinal: z.boolean(),
});
export type AudioChunk = z.infer<typeof AudioChunkSchema>;

// ===== Audio Session Schema =====
export const AudioSessionSchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()),
    startedAt: z.number().default(() => Date.now()),
    endedAt: z.number().optional(),
    durationMs: z.number().optional(),
    sampleRate: z.number().default(16000),
    channels: z.number().default(1),
});
export type AudioSession = z.infer<typeof AudioSessionSchema>;

// ===== VAD (Voice Activity Detection) Event =====
export const VADEventSchema = z.object({
    sessionId: z.string(),
    type: z.enum(['speech_start', 'speech_end', 'silence']),
    timestamp: z.number().default(() => Date.now()),
    confidence: z.number().min(0).max(1).optional(),
});
export type VADEvent = z.infer<typeof VADEventSchema>;

// ===== Transcription Result =====
export const TranscriptionSchema = z.object({
    sessionId: z.string(),
    text: z.string(),
    language: z.string().default('th'), // Thai default
    confidence: z.number().min(0).max(1).optional(),
    isFinal: z.boolean().default(false),
    timestamp: z.number().default(() => Date.now()),
});
export type Transcription = z.infer<typeof TranscriptionSchema>;

// ===== TTS (Text-to-Speech) Request =====
export const TTSRequestSchema = z.object({
    text: z.string(),
    voice: z.string().optional(),
    speed: z.number().min(0.5).max(2.0).default(1.0),
    language: z.string().default('th'),
});
export type TTSRequest = z.infer<typeof TTSRequestSchema>;
