'use client';

import { useState, useEffect, useCallback } from 'react';
// ============================================================
// Local types (mirrors shared-schema/skill.schema.ts)
// ============================================================

export interface Skill {
    name: string;
    displayName: string;
    icon: string;
    description: string;
    content?: string;
    isBuiltIn: boolean;
    createdAt: number;
    updatedAt: number;
}

export interface ParsedSkill {
    name: string;
    displayName: string;
    icon: string;
    description: string;
    body: string;
    temperature?: number;
}

// ============================================================
// API base resolution (mirrors useAutomations.ts pattern)
// ============================================================

const API_BASE_CANDIDATES = [
    'http://127.0.0.1:3001',
    'http://localhost:3001',
];

async function probeApiBase(base: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);
        try {
            const res = await fetch(`${base}/health`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });
            return res.ok;
        } finally {
            window.clearTimeout(timeout);
        }
    } catch {
        return false;
    }
}

async function resolveApiBase(): Promise<string> {
    for (const base of API_BASE_CANDIDATES) {
        if (await probeApiBase(base)) {
            return `${base}/api/skills`;
        }
    }
    return `${API_BASE_CANDIDATES[0]}/api/skills`;
}

// ============================================================
// Hook
// ============================================================

export function useSkills() {
    const [skills, setSkills]           = useState<Skill[]>([]);
    const [activeSkill, setActiveSkillState] = useState<ParsedSkill | null>(null);
    const [isLoading, setIsLoading]     = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [apiBase, setApiBase]         = useState<string | null>(null);

    // ----------------------------------------------------------
    // Resolve API base on mount
    // ----------------------------------------------------------
    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            const resolved = await resolveApiBase();
            if (!cancelled) setApiBase(resolved);
        };
        void init();
        return () => { cancelled = true; };
    }, []);

    // ----------------------------------------------------------
    // Fetch all skills
    // ----------------------------------------------------------
    const fetchSkills = useCallback(async () => {
        if (!apiBase) return;
        setIsLoading(true);
        setError(null);
        try {
            const [skillsRes, activeRes] = await Promise.all([
                fetch(apiBase),
                fetch(`${apiBase}/active`),
            ]);

            if (!skillsRes.ok) throw new Error(`Server responded with HTTP ${skillsRes.status}`);

            const data: Skill[] = await skillsRes.json();
            setSkills(data);

            if (activeRes.ok) {
                const activeData: { skill: ParsedSkill | null } = await activeRes.json();
                setActiveSkillState(activeData.skill);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load skills');
        } finally {
            setIsLoading(false);
        }
    }, [apiBase]);

    useEffect(() => {
        if (!apiBase) return;
        void fetchSkills();
    }, [apiBase, fetchSkills]);

    // ----------------------------------------------------------
    // Create skill (POST) — body is raw SKILL.md content string
    // ----------------------------------------------------------
    const createSkill = useCallback(
        async (content: string): Promise<Skill | null> => {
            if (!apiBase) return null;
            try {
                const res = await fetch(apiBase, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Create failed with HTTP ${res.status}`);
                }
                const created: Skill = await res.json();
                await fetchSkills();
                return created;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create skill');
                return null;
            }
        },
        [apiBase, fetchSkills],
    );

    // ----------------------------------------------------------
    // Update skill (PUT /:name) — body is raw SKILL.md content string
    // ----------------------------------------------------------
    const updateSkill = useCallback(
        async (name: string, content: string): Promise<boolean> => {
            if (!apiBase) return false;
            try {
                const res = await fetch(`${apiBase}/${name}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Update failed with HTTP ${res.status}`);
                }
                const updated: Skill = await res.json();
                setSkills(prev => prev.map(s => s.name === name ? updated : s));
                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to update skill');
                return false;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Delete skill (DELETE /:name)
    // ----------------------------------------------------------
    const deleteSkill = useCallback(
        async (name: string): Promise<boolean> => {
            if (!apiBase) return false;
            try {
                const res = await fetch(`${apiBase}/${name}`, { method: 'DELETE' });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Delete failed with HTTP ${res.status}`);
                }
                setSkills(prev => prev.filter(s => s.name !== name));
                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to delete skill');
                return false;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Set active skill (PUT /active)
    // Pass null to deactivate
    // ----------------------------------------------------------
    const setActiveSkill = useCallback(
        async (name: string | null): Promise<boolean> => {
            if (!apiBase) return false;
            try {
                const res = await fetch(`${apiBase}/active`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Set active failed with HTTP ${res.status}`);
                }
                const data: { skill: ParsedSkill | null } = await res.json();
                setActiveSkillState(data.skill);
                return true;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to set active skill');
                return false;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Generate skill content from description via LLM
    // Returns raw SKILL.md content string — does NOT save automatically
    // ----------------------------------------------------------
    const generateSkill = useCallback(
        async (description: string): Promise<string | null> => {
            if (!apiBase) return null;
            try {
                const res = await fetch(`${apiBase}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ description }),
                });
                if (!res.ok) {
                    const text = await res.text().catch(() => '');
                    throw new Error(text || `Generate failed with HTTP ${res.status}`);
                }
                const data: { content: string } = await res.json();
                return data.content;
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to generate skill');
                return null;
            }
        },
        [apiBase],
    );

    // ----------------------------------------------------------
    // Public API
    // ----------------------------------------------------------
    return {
        skills,
        activeSkill,
        isLoading: isLoading || !apiBase,
        error,
        createSkill,
        updateSkill,
        deleteSkill,
        setActiveSkill,
        generateSkill,
        refetch: fetchSkills,
    };
}
