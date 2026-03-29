import { Elysia, t } from 'elysia';
import {
    getSkills,
    getSkill,
    createSkill,
    updateSkill,
    deleteSkill,
    getActiveSkill,
    getActiveSkillName,
    setActiveSkill,
} from '../skills/skills.store';
import { chatCompletion } from '../llm/provider';
import type { ChatMessage } from '@aurelius/shared-schema';

// ============================================================
// Skills Route
// ============================================================

export const skillsRoute = new Elysia({ prefix: '/api/skills' })

    // ── GET /api/skills ─────────────────────────────────────────
    // List all skills (metadata only, no full content)
    .get('/', async () => {
        try {
            const skills = await getSkills();
            return skills;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to list skills';
            throw new Error(message);
        }
    })

    // ── GET /api/skills/active ───────────────────────────────────
    // Get the currently active skill as a ParsedSkill
    .get('/active', async () => {
        try {
            const skill = await getActiveSkill();
            return { skill };
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to get active skill';
            throw new Error(message);
        }
    })

    // ── PUT /api/skills/active ───────────────────────────────────
    // Set or clear the active skill
    .put(
        '/active',
        async ({ body }) => {
            try {
                const { name } = body;
                await setActiveSkill(name ?? null);
                const skill = await getActiveSkill();
                return { skill };
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to set active skill';
                throw new Error(message);
            }
        },
        {
            body: t.Object({
                name: t.Union([t.String(), t.Null()]),
            }),
        },
    )

    // ── POST /api/skills/generate ────────────────────────────────
    // Ask the LLM to generate a SKILL.md from a description.
    // Returns { content: string } — NOT saved automatically.
    .post(
        '/generate',
        async ({ body }) => {
            const { description } = body;

            const systemPrompt = `You are a skill creator for an AI assistant named Aurelius.
Aurelius is a personal AI assistant that runs locally on Windows.

Your job is to generate a SKILL.md file that defines a behavioral overlay for Aurelius.
The skill changes how Aurelius responds — its tone, format, and focus — without replacing its core personality.

Output ONLY raw SKILL.md content in this EXACT format (no code fences, no explanation):

---
name: [lowercase-slug-with-hyphens]
displayName: [Human Readable Name]
icon: [single emoji]
description: [one sentence: what this skill does and when to use it]
temperature: [optional float 0.0–1.0, only include if a specific temp makes sense]
---

# [Display Name]

[Instructions in imperative form for how Aurelius should behave]

## Output Style
[How to format responses in this mode]

## Rules
[Specific behavioral rules to follow]

Guidelines for writing good skills:
- Use imperative form: "Do X", "Prefer Y", "Never Z"
- Be specific and actionable — vague instructions are useless
- 80–200 words in the body is ideal
- Focus on what makes this skill DIFFERENT from default behavior
- Do NOT repeat Aurelius's base behavior (language matching, tool selection rules, etc.)
- temperature: use 0.1–0.3 for precise/technical tasks, 0.7–0.9 for creative tasks, omit for general use`;

            const messages: ChatMessage[] = [
                {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: `Create a SKILL.md for this use case: ${description}`,
                    timestamp: Date.now(),
                },
            ];

            try {
                let content = await chatCompletion(
                    messages,
                    undefined,
                    systemPrompt,
                );

                // Strip code fences if the LLM wrapped the output anyway
                content = content
                    .replace(/^```[a-z]*\n?/i, '')
                    .replace(/\n?```$/i, '')
                    .trim();

                return { content };
            } catch (err) {
                const message = err instanceof Error ? err.message : 'LLM generation failed';
                throw new Error(message);
            }
        },
        {
            body: t.Object({
                description: t.String({ minLength: 1 }),
            }),
        },
    )

    // ── GET /api/skills/:name ────────────────────────────────────
    // Get a single skill including full content
    .get(
        '/:name',
        async ({ params }) => {
            try {
                const skill = await getSkill(params.name);
                if (!skill) {
                    throw new Error(`Skill "${params.name}" not found.`);
                }
                return skill;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to get skill';
                throw new Error(message);
            }
        },
        {
            params: t.Object({ name: t.String() }),
        },
    )

    // ── POST /api/skills ─────────────────────────────────────────
    // Create a new skill from raw SKILL.md content
    .post(
        '/',
        async ({ body }) => {
            try {
                const skill = await createSkill(body.content);
                return skill;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to create skill';
                throw new Error(message);
            }
        },
        {
            body: t.Object({
                content: t.String({ minLength: 1 }),
            }),
        },
    )

    // ── PUT /api/skills/:name ────────────────────────────────────
    // Update a skill's content
    .put(
        '/:name',
        async ({ params, body }) => {
            try {
                const skill = await updateSkill(params.name, body.content);
                return skill;
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to update skill';
                throw new Error(message);
            }
        },
        {
            params: t.Object({ name: t.String() }),
            body: t.Object({
                content: t.String({ minLength: 1 }),
            }),
        },
    )

    // ── DELETE /api/skills/:name ─────────────────────────────────
    // Delete a skill (built-in skills cannot be deleted)
    .delete(
        '/:name',
        async ({ params }) => {
            try {
                await deleteSkill(params.name);
                return { success: true };
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to delete skill';
                throw new Error(message);
            }
        },
        {
            params: t.Object({ name: t.String() }),
        },
    );
