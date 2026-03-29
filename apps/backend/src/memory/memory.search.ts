import { getSettings } from '../config/settings.store';
import { getMemoriesRaw, updateMemoryEmbedding } from './memory.store';
import type { MemoryEntry } from '@aurelius/shared-schema';
import { isExpired } from '@aurelius/shared-schema';

// ============================================================
// Cosine Similarity
// ============================================================

function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot   += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// Ollama Embeddings
// ============================================================

export async function getOllamaEmbedding(text: string): Promise<number[] | null> {
    const settings = getSettings();
    try {
        const response = await fetch(`${settings.ollamaHost}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: settings.ollamaModel,
                prompt: text,
            }),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) return null;
        const data = await response.json() as { embedding?: number[] };
        return data.embedding ?? null;
    } catch {
        return null;
    }
}

// ============================================================
// Keyword Fallback (TF-IDF inspired)
// ============================================================

function keywordScore(query: string, content: string): number {
    const qTokens  = query.toLowerCase().split(/\W+/).filter(t => t.length >= 3);
    const cLower   = content.toLowerCase();
    if (qTokens.length === 0) return 0;
    let hits = 0;
    for (const token of qTokens) {
        if (cLower.includes(token)) hits++;
    }
    return hits / qTokens.length;
}

// ============================================================
// Public Search API
// ============================================================

export interface MemorySearchResult {
    entry: MemoryEntry;
    similarity: number;
}

export async function searchMemories(
    query: string,
    limit     = 5,
    minSimilarity = 0.25,
): Promise<MemorySearchResult[]> {
    const raw = getMemoriesRaw();
    if (raw.size === 0) return [];

    const active = Array.from(raw.values()).filter(
        e => e.lifecycle !== 'archived' && !isExpired(e),
    );
    if (active.length === 0) return [];

    const settings = getSettings();

    // ── Try Ollama semantic search ────────────────────────────
    if (settings.llmProvider === 'ollama') {
        const queryEmbedding = await getOllamaEmbedding(query);

        if (queryEmbedding && queryEmbedding.length > 0) {
            const results: MemorySearchResult[] = [];

            for (const entry of active) {
                let emb = entry.embedding;

                // Lazily embed entries that don't have a vector yet
                if (!emb || emb.length === 0) {
                    const fresh = await getOllamaEmbedding(entry.content);
                    if (fresh && fresh.length > 0) {
                        emb = fresh;
                        // Cache without blocking the caller
                        updateMemoryEmbedding(entry.id, fresh).catch(console.warn);
                    }
                }

                if (emb && emb.length > 0) {
                    results.push({ entry, similarity: cosineSimilarity(queryEmbedding, emb) });
                }
            }

            return results
                .filter(r => r.similarity >= minSimilarity)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, limit);
        }
    }

    // ── Keyword fallback (OpenRouter or Ollama embedding failure) ─
    const results = active.map(entry => ({
        entry,
        similarity: keywordScore(query, entry.content),
    }));

    return results
        .filter(r => r.similarity > 0)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
}

/**
 * Generate and cache embedding for a single memory entry.
 * Called fire-and-forget after saving a new memory.
 */
export async function embedAndCacheMemory(entry: MemoryEntry): Promise<void> {
    const settings = getSettings();
    if (settings.llmProvider !== 'ollama') return;
    const embedding = await getOllamaEmbedding(entry.content);
    if (embedding && embedding.length > 0) {
        await updateMemoryEmbedding(entry.id, embedding);
    }
}
