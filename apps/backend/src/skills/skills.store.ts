import path from 'path';
import { mkdirSync, existsSync } from 'fs';
import { parseSkillContent } from '@aurelius/shared-schema';
import type { Skill, ParsedSkill } from '@aurelius/shared-schema';

// ============================================================
// Constants
// ============================================================

/** Built-in skill names — cannot be deleted, only edited */
const BUILT_IN_SKILL_NAMES = new Set(['coder', 'writer', 'focus']);

// ============================================================
// Directory resolution (mirrors settings.store.ts)
// ============================================================

function resolveDataDir(): string {
    if (process.env.AURELIUS_DATA_DIR) {
        return process.env.AURELIUS_DATA_DIR;
    }

    const appData =
        process.env.APPDATA ||
        (process.env.HOME
            ? path.join(process.env.HOME, '.config')
            : '.');

    return path.join(appData, 'Aurelius');
}

const DATA_DIR        = resolveDataDir();
const SKILLS_DIR      = path.join(DATA_DIR, 'skills');
const ACTIVE_SKILL_FILE = path.join(DATA_DIR, 'active-skill.json');

// Ensure directories exist
try { mkdirSync(DATA_DIR,   { recursive: true }); } catch { /* already exists */ }
try { mkdirSync(SKILLS_DIR, { recursive: true }); } catch { /* already exists */ }

// ============================================================
// Built-in skill content
// ============================================================

const BUILT_IN_SKILLS: Record<string, string> = {
    coder: `---
name: coder
displayName: Code Assistant
icon: 💻
description: TypeScript-first coding mode — strict types, code before prose
temperature: 0.2
---

# Code Assistant

You are in focused coding mode. Follow these rules strictly.

## Coding Rules
- Always use TypeScript with strict types — never use \`any\`
- Lead with the code block, explanation comes after
- Keep explanations under 3 sentences unless the user asks for more
- Prefer functional patterns over classes
- Use existing libraries over reinventing solutions
- Add inline comments only for non-obvious logic

## Output Style
- Code first, prose second — the user wants working code, not a lecture
- If multiple approaches exist, pick the best one and note why in one sentence
- Use proper type annotations at all times

## Tool Use
- Use run_command, read_file, and write_file freely for coding tasks
- Read the actual file before modifying it whenever possible
`,

    writer: `---
name: writer
displayName: Writer
icon: ✍️
description: Creative writing mode — expressive, elaborate, no unsolicited tool use
temperature: 0.8
---

# Writer

You are in creative writing mode. Follow these rules.

## Writing Rules
- Be expressive, elaborate, and creative
- Match the tone the user establishes — formal, casual, poetic, or humorous
- Do not truncate or rush — give full, complete responses
- Use varied sentence structure and rich vocabulary

## Output Style
- Prose over bullet points
- No preamble — dive straight into the writing
- When editing the user's text, preserve their voice and style

## Tool Use
- Only use tools if the user explicitly asks (e.g. "save this to a file")
- Never proactively search the web or run commands
`,

    focus: `---
name: focus
displayName: Focus Mode
icon: 🧘
description: Minimal mode — direct answers only, no tools, no filler
temperature: 0.5
---

# Focus Mode

You are in focus mode. Be direct and minimal.

## Rules
- Answer questions directly and concisely
- Do NOT use any tools unless the user explicitly requests it
- No preamble, no "Great question!", no filler phrases
- One clear answer per response — stop when done

## Output Style
- Short when possible, complete when necessary
- Plain language — avoid markdown headers unless the content genuinely needs structure
- No unsolicited suggestions or follow-up questions
`,
};

// ============================================================
// Helpers
// ============================================================

function skillFilePath(name: string): string {
    return path.join(SKILLS_DIR, `${name}.md`);
}

async function readSkillFile(name: string): Promise<string | null> {
    try {
        const file = Bun.file(skillFilePath(name));
        if (!(await file.exists())) return null;
        return await file.text();
    } catch {
        return null;
    }
}

async function writeSkillFile(name: string, content: string): Promise<void> {
    await Bun.write(skillFilePath(name), content);
}

async function deleteSkillFile(name: string): Promise<void> {
    const filePath = skillFilePath(name);
    if (existsSync(filePath)) {
        await Bun.file(filePath).delete?.().catch(() => {
            // Bun.file().delete() may not exist in all versions — fall back
        });
        // Bun doesn't have a delete method on file objects in all versions
        // Use the fs module as fallback
        const { unlink } = await import('fs/promises');
        await unlink(filePath).catch(() => { /* ignore if already gone */ });
    }
}

async function listSkillFiles(): Promise<string[]> {
    try {
        const { readdir } = await import('fs/promises');
        const files = await readdir(SKILLS_DIR);
        return files
            .filter(f => f.endsWith('.md'))
            .map(f => f.replace(/\.md$/, ''));
    } catch {
        return [];
    }
}

function buildSkillObject(name: string, content: string): Skill | null {
    const parsed = parseSkillContent(content);
    if (!parsed) return null;

    return {
        name,
        displayName: parsed.displayName,
        icon: parsed.icon,
        description: parsed.description,
        content,
        isBuiltIn: BUILT_IN_SKILL_NAMES.has(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

// ============================================================
// Active skill persistence
// ============================================================

async function readActiveSkillName(): Promise<string | null> {
    try {
        const file = Bun.file(ACTIVE_SKILL_FILE);
        if (!(await file.exists())) return null;
        const data = await file.json() as { name?: string | null };
        return data.name ?? null;
    } catch {
        return null;
    }
}

async function writeActiveSkillName(name: string | null): Promise<void> {
    await Bun.write(ACTIVE_SKILL_FILE, JSON.stringify({ name }, null, 2));
}

// ============================================================
// Public API
// ============================================================

/**
 * Called at server startup.
 * Seeds built-in skills into the skills directory if they don't already exist.
 */
export async function initSkills(): Promise<void> {
    console.log(`[Skills] Skills directory: ${SKILLS_DIR}`);

    let seeded = 0;

    for (const [name, content] of Object.entries(BUILT_IN_SKILLS)) {
        const filePath = skillFilePath(name);
        if (!existsSync(filePath)) {
            await Bun.write(filePath, content);
            seeded++;
            console.log(`[Skills] Seeded built-in skill: ${name}`);
        }
    }

    if (seeded === 0) {
        const names = await listSkillFiles();
        console.log(`[Skills] Loaded ${names.length} skill(s): ${names.join(', ') || '(none)'}`);
    }
}

/**
 * List all skills (metadata only — no full content for performance).
 */
export async function getSkills(): Promise<Omit<Skill, 'content'>[]> {
    const names = await listSkillFiles();
    const skills: Omit<Skill, 'content'>[] = [];

    for (const name of names) {
        const content = await readSkillFile(name);
        if (!content) continue;

        const skill = buildSkillObject(name, content);
        if (!skill) continue;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { content: _omit, ...meta } = skill;
        skills.push(meta);
    }

    // Sort: built-in first, then alphabetical
    return skills.sort((a, b) => {
        if (a.isBuiltIn && !b.isBuiltIn) return -1;
        if (!a.isBuiltIn && b.isBuiltIn) return 1;
        return a.displayName.localeCompare(b.displayName);
    });
}

/**
 * Get a single skill including full content.
 */
export async function getSkill(name: string): Promise<Skill | null> {
    const content = await readSkillFile(name);
    if (!content) return null;
    return buildSkillObject(name, content);
}

/**
 * Create a new skill from raw SKILL.md content.
 * Parses the frontmatter to extract the name and metadata.
 */
export async function createSkill(content: string): Promise<Skill> {
    const parsed = parseSkillContent(content);

    if (!parsed) {
        throw new Error(
            'Invalid SKILL.md: missing required frontmatter fields (name, displayName).',
        );
    }

    const { name } = parsed;

    if (existsSync(skillFilePath(name))) {
        throw new Error(`A skill named "${name}" already exists.`);
    }

    await writeSkillFile(name, content);

    return {
        name,
        displayName: parsed.displayName,
        icon: parsed.icon,
        description: parsed.description,
        content,
        isBuiltIn: BUILT_IN_SKILL_NAMES.has(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

/**
 * Update a skill's content.
 * The name in the frontmatter must match the existing skill name.
 */
export async function updateSkill(name: string, content: string): Promise<Skill> {
    if (!existsSync(skillFilePath(name))) {
        throw new Error(`Skill "${name}" not found.`);
    }

    const parsed = parseSkillContent(content);

    if (!parsed) {
        throw new Error(
            'Invalid SKILL.md: missing required frontmatter fields (name, displayName).',
        );
    }

    if (parsed.name !== name) {
        throw new Error(
            `Cannot rename a skill via update. ` +
            `Frontmatter name "${parsed.name}" does not match "${name}".`,
        );
    }

    await writeSkillFile(name, content);

    return {
        name,
        displayName: parsed.displayName,
        icon: parsed.icon,
        description: parsed.description,
        content,
        isBuiltIn: BUILT_IN_SKILL_NAMES.has(name),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}

/**
 * Delete a skill by name.
 * Built-in skills cannot be deleted.
 */
export async function deleteSkill(name: string): Promise<void> {
    if (BUILT_IN_SKILL_NAMES.has(name)) {
        throw new Error(`Built-in skill "${name}" cannot be deleted.`);
    }

    if (!existsSync(skillFilePath(name))) {
        throw new Error(`Skill "${name}" not found.`);
    }

    await deleteSkillFile(name);

    // If this was the active skill, clear it
    const active = await readActiveSkillName();
    if (active === name) {
        await writeActiveSkillName(null);
    }
}

/**
 * Get the currently active skill as a ParsedSkill ready for injection.
 * Returns null if no skill is active or the skill file is missing.
 */
export async function getActiveSkill(): Promise<ParsedSkill | null> {
    const name = await readActiveSkillName();
    if (!name) return null;

    const content = await readSkillFile(name);
    if (!content) {
        // Active skill file was deleted — clear it
        await writeActiveSkillName(null);
        return null;
    }

    return parseSkillContent(content);
}

/**
 * Get the active skill name (for API responses).
 */
export async function getActiveSkillName(): Promise<string | null> {
    return readActiveSkillName();
}

/**
 * Set the active skill by name. Pass null to deactivate.
 */
export async function setActiveSkill(name: string | null): Promise<void> {
    if (name !== null && !existsSync(skillFilePath(name))) {
        throw new Error(`Skill "${name}" not found.`);
    }

    await writeActiveSkillName(name);

    console.log(name
        ? `[Skills] Active skill set to: ${name}`
        : '[Skills] Active skill cleared.',
    );
}
