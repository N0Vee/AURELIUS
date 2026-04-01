/**
 * Output sanitization middleware for the Vercel AI SDK.
 *
 * Ports the v1 `sanitizeOutputChunk` / `shouldDropPromptLeakLine` logic
 * from `openrouter.client.ts` into an SDK-compatible `LanguageModelMiddleware`.
 *
 * Applied to every `text-delta` stream part and to the final `text`
 * field in `doGenerate` results.  Removes:
 *  1. Non-ASCII / non-Thai unicode artefacts (model confusion garbage).
 *  2. Lines that leak the hidden system prompt (personality rules, language rules, etc.).
 */
import type { LanguageModelMiddleware } from 'ai';

// ── Prompt leak detection ─────────────────────────────────────────────────────

const LEAK_PATTERNS = [
    'use thai polite particles',
    'refer to yourself as',
    'address aum as',
    'be concise and natural',
    'be concise.',
    'reply in english only',
    'reply in thai only',
    'answer only in thai',
    'answer only in english',
    'thai speech rules',
    'language absolute rule',
    'personality & tone',
    'response format',
    'tools',
    'polite particle',
    'self-reference',
];

function shouldDropPromptLeakLine(line: string): boolean {
    const normalized = line.trim().replace(/\s+/g, ' ').toLowerCase();
    if (!normalized) return false;
    return LEAK_PATTERNS.some((p) => normalized.includes(p));
}

// ── Chunk sanitization ────────────────────────────────────────────────────────

function sanitizeOutputChunk(raw: string): string {
    // Keep only Thai, basic ASCII, and zero-width joiners
    const clean = raw.replace(
        /[^\u0E00-\u0E7F\u0000-\u007F\u200B-\u200D\uFEFF]/g,
        '',
    );
    if (!clean) return '';
    const lines = clean.split('\n');
    const kept = lines.filter((l) => !shouldDropPromptLeakLine(l));
    return kept.join('\n');
}

// ── Middleware ─────────────────────────────────────────────────────────────────

export const sanitizeMiddleware: LanguageModelMiddleware = {
    specificationVersion: 'v3',

    wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate();

        // Sanitize each text block in the result
        if (result.content) {
            result.content = result.content.map((part) => {
                if (part.type === 'text') {
                    return { ...part, text: sanitizeOutputChunk(part.text) };
                }
                return part;
            });
        }

        return result;
    },

    wrapStream: async ({ doStream }) => {
        const result = await doStream();

        return {
            ...result,
            stream: result.stream.pipeThrough(
                new TransformStream({
                    transform(chunk, controller) {
                        if (chunk.type === 'text-delta') {
                            const clean = sanitizeOutputChunk(chunk.delta);
                            if (clean) {
                                controller.enqueue({ ...chunk, delta: clean });
                            }
                            // Drop empty chunks after sanitization
                        } else {
                            controller.enqueue(chunk);
                        }
                    },
                }),
            ),
        };
    },
};
