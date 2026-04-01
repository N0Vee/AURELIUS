import { generateCompletion } from '../llm/ai-provider';
import { saveMemory } from './memory.store';
import { embedAndCacheMemory } from './memory.search';
import type { ChatMessage } from '@aurelius/shared-schema';
import type { MemoryType, MemoryLifecycle } from '@aurelius/shared-schema';

// ============================================================
// Extraction Prompt
// ============================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze conversations and extract information worth remembering for future sessions.

Extract ONLY:
1. Personal facts about the user (name, job, location, skills, relationships)
2. Explicit user preferences (likes/dislikes, tools, languages, style, habits)
3. Ongoing tasks or goals explicitly mentioned
4. Important facts the user wants saved

Rules:
- Write each memory as a clear, self-contained statement (e.g., "User prefers TypeScript over JavaScript")
- Skip generic conversation content — only extract genuinely memorable information
- "long_term" for stable facts/preferences, "short_term" for current tasks

Return ONLY a valid JSON array. If nothing memorable, return [].

Example output:
[
  {"type":"preference","content":"User prefers TypeScript with strict mode over plain JavaScript","lifecycle":"long_term"},
  {"type":"fact","content":"User is a full-stack developer working on a personal AI assistant app","lifecycle":"long_term"},
  {"type":"task","content":"User is implementing a hybrid memory system with semantic search","lifecycle":"short_term"}
]`;

interface ExtractedMemory {
    type: MemoryType;
    content: string;
    lifecycle: MemoryLifecycle;
}

// ============================================================
// Deduplication — skip if very similar content already exists
// ============================================================

import { getMemoriesRaw } from './memory.store';

function isDuplicate(content: string): boolean {
    const existing = getMemoriesRaw();
    const normalized = content.toLowerCase().trim();
    for (const entry of existing.values()) {
        const existingNorm = entry.content.toLowerCase().trim();
        // Simple overlap check: if 80%+ of words match, treat as duplicate
        const aWords = new Set(normalized.split(/\W+/).filter(w => w.length > 3));
        const bWords = new Set(existingNorm.split(/\W+/).filter(w => w.length > 3));
        if (aWords.size === 0) continue;
        let overlap = 0;
        for (const word of aWords) {
            if (bWords.has(word)) overlap++;
        }
        if (overlap / aWords.size >= 0.8) return true;
    }
    return false;
}

// ============================================================
// Public API
// ============================================================

/**
 * Analyze the last N messages of a conversation and extract
 * memorable facts/preferences/tasks. Saves them to the memory store.
 *
 * Called fire-and-forget at the end of each agentLoop.
 */
export async function extractAndSaveMemories(
    messages: ChatMessage[],
): Promise<number> {
    // Only consider user + assistant text messages
    // Skip system-reminders, tool results, and non-conversational content
    const relevant = messages
        .filter(m => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 10)
        .filter(m => {
            const content = m.content.toLowerCase();
            // Skip system-reminders and opencode messages
            if (content.includes('<system-reminder>') || content.includes('</system-reminder>')) return false;
            if (content.includes('operational mode has changed')) return false;
            if (content.includes('read-only mode') || content.includes('build mode')) return false;
            if (content.includes('tool output') || content.includes('tool execution')) return false;
            // Skip very short or generic responses
            if (content.length < 20) return false;
            if (['ok', 'yes', 'no', 'sure', 'thanks', 'done', 'okay'].includes(content.trim())) return false;
            // Skip responses that are just status messages
            if (content.startsWith('running') || content.startsWith('executing')) return false;
            return true;
        })
        .slice(-24); // Cap to last 24 messages for cost efficiency

    if (relevant.length < 2) return 0;

    const conversationText = relevant
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.trim()}`)
        .join('\n\n');

    const extractionMessages: ChatMessage[] = [{
        id: crypto.randomUUID(),
        role: 'user',
        content: `Extract memorable information from this conversation:\n\n${conversationText}`,
        timestamp: Date.now(),
    }];

    try {
        const response = await generateCompletion(
            extractionMessages,
            EXTRACTION_SYSTEM_PROMPT,
        );

        // Pull out the JSON array from the response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
            console.log('[MemoryExtractor] Nothing extractable found');
            return 0;
        }

        const extracted: ExtractedMemory[] = JSON.parse(jsonMatch[0]);
        if (!Array.isArray(extracted) || extracted.length === 0) return 0;

        let saved = 0;
        for (const item of extracted) {
            if (!item.content?.trim() || !item.type) continue;
            if (isDuplicate(item.content)) {
                console.log(`[MemoryExtractor] Skipping duplicate: "${item.content.slice(0, 60)}"`);
                continue;
            }

            const entry = await saveMemory({
                type:      item.type,
                content:   item.content.trim(),
                lifecycle: item.lifecycle ?? 'short_term',
                metadata:  { source: 'auto_extracted' },
            });

            // Embed asynchronously — don't delay the caller
            embedAndCacheMemory(entry).catch(console.warn);
            saved++;
        }

        if (saved > 0) {
            console.log(`[MemoryExtractor] Auto-extracted ${saved} new memories`);
        }
        return saved;

    } catch (err) {
        console.warn('[MemoryExtractor] Extraction failed:', err);
        return 0;
    }
}
