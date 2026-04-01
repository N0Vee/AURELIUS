/**
 * Convert the tool registry into Vercel AI SDK `tool()` definitions.
 *
 * Strategy:
 *  - SAFE tools → server-side `execute` (auto-run inside `streamText`)
 *  - SENSITIVE / DANGEROUS tools → NO `execute` (the client handles
 *    confirmation via `addToolResult` after calling the `/v2/chat/tools/execute`
 *    REST endpoint).
 */
import { jsonSchema } from 'ai';
import type { ToolSet } from 'ai';
import { getAllTools, canAutoExecute } from './registry';
import { executeTool } from './executor';

/**
 * Build a Record<string, CoreTool> suitable for `streamText({ tools })`.
 *
 * @param filterBrowser  When true, omits all `browser_*` tools
 *                       (used when the Zen browser extension is disconnected).
 */
export function getAITools(options?: {
    filterBrowser?: boolean;
}): ToolSet {
    const allDefs = getAllTools();
    // Use Record<string, unknown> internally — tool() is an identity fn
    // and TS overload resolution fights with jsonSchema + execute combos.
    const tools: Record<string, unknown> = {};

    for (const def of allDefs) {
        if (options?.filterBrowser && def.name.startsWith('browser_')) continue;

        const params = def.openAITool.function.parameters;

        const schema = jsonSchema<Record<string, unknown>>(
            params as Parameters<typeof jsonSchema>[0],
        );

        if (canAutoExecute(def)) {
            // SAFE → auto-execute on server during streamText steps
            tools[def.name] = {
                description: def.openAITool.function.description,
                inputSchema: schema,
                execute: async (args: Record<string, unknown>) =>
                    executeTool(def.name, args),
            };
        } else {
            // SENSITIVE / DANGEROUS → no execute; client must approve first
            tools[def.name] = {
                description: def.openAITool.function.description,
                inputSchema: schema,
            };
        }
    }

    return tools as ToolSet;
}

/**
 * Thin helper: returns the permission level for a tool by name.
 * Used by the frontend to decide what UI to show (auto-card vs confirm-card).
 */
export function getToolPermission(
    name: string,
): 'SAFE' | 'SENSITIVE' | 'DANGEROUS' | null {
    const allDefs = getAllTools();
    const def = allDefs.find((d) => d.name === name);
    if (!def) return null;
    return def.permissionLevel as 'SAFE' | 'SENSITIVE' | 'DANGEROUS';
}

/**
 * Return display metadata for every registered tool.
 * Fetched once by the frontend to enrich tool-invocation bubbles.
 */
export function getAllToolMetadata(): Record<
    string,
    { displayName: string; description: string; permission: string }
> {
    const allDefs = getAllTools();
    const meta: Record<string, { displayName: string; description: string; permission: string }> = {};
    for (const def of allDefs) {
        meta[def.name] = {
            displayName: def.displayName,
            description: def.openAITool.function.description,
            permission: def.permissionLevel,
        };
    }
    return meta;
}
