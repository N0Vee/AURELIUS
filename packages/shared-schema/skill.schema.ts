import { z } from 'zod';

// ============================================================
// Skill Schema
// Inspired by Anthropic's SKILL.md format — a markdown file
// with YAML frontmatter that defines AI behavioral overlays.
// ============================================================

export const SkillSchema = z.object({
    /** Unique slug — also used as the filename (e.g. "coder" → coder.md) */
    name: z.string().min(1),

    /** Human-readable display name shown in the UI */
    displayName: z.string().min(1),

    /** Single emoji icon */
    icon: z.string().default('🎯'),

    /** One-sentence description of what this skill does and when to use it */
    description: z.string().default(''),

    /** Full raw SKILL.md text including YAML frontmatter + markdown body */
    content: z.string(),

    /** Built-in skills are seeded automatically and cannot be deleted */
    isBuiltIn: z.boolean().default(false),

    createdAt: z.number().default(() => Date.now()),
    updatedAt: z.number().default(() => Date.now()),
});

export type Skill = z.infer<typeof SkillSchema>;

// ============================================================
// ParsedSkill — result of parsing a SKILL.md file
// This is what gets injected into the LLM context
// ============================================================

export const ParsedSkillSchema = z.object({
    name: z.string(),
    displayName: z.string(),
    icon: z.string(),
    description: z.string(),

    /** The markdown body below the frontmatter — the actual instructions */
    body: z.string(),

    /**
     * Optional temperature override from frontmatter.
     * When set, this overrides the global temperature setting for this skill.
     */
    temperature: z.number().min(0).max(2).optional(),
});

export type ParsedSkill = z.infer<typeof ParsedSkillSchema>;

// ============================================================
// Frontmatter parser
// Parses simple key: value YAML frontmatter from a SKILL.md file.
//
// Expected format:
//   ---
//   name: coder
//   displayName: Code Assistant
//   icon: 💻
//   description: TypeScript-first coding mode
//   temperature: 0.2          (optional)
//   ---
//
//   # Code Assistant
//   You are in coding mode...
// ============================================================

export function parseFrontmatter(content: string): {
    frontmatter: Record<string, string>;
    body: string;
} {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

    if (!match) {
        return { frontmatter: {}, body: content.trim() };
    }

    const frontmatterText = match[1];
    const body = match[2].trim();

    const frontmatter: Record<string, string> = {};

    for (const line of frontmatterText.split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;

        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();

        if (key) {
            frontmatter[key] = value;
        }
    }

    return { frontmatter, body };
}

/**
 * Parse a raw SKILL.md string into a ParsedSkill.
 * Returns null if the content is missing required fields.
 */
export function parseSkillContent(content: string): ParsedSkill | null {
    const { frontmatter, body } = parseFrontmatter(content);

    const name = frontmatter['name'];
    const displayName = frontmatter['displayName'] || frontmatter['display_name'];

    if (!name || !displayName) return null;

    const temperatureRaw = frontmatter['temperature'];
    const temperature = temperatureRaw !== undefined
        ? parseFloat(temperatureRaw)
        : undefined;

    return {
        name,
        displayName,
        icon: frontmatter['icon'] || '🎯',
        description: frontmatter['description'] || '',
        body,
        temperature: temperature !== undefined && !isNaN(temperature)
            ? Math.min(2, Math.max(0, temperature))
            : undefined,
    };
}
