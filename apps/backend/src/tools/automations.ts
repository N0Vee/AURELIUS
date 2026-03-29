import path from 'path';
import { mkdirSync } from 'fs';
import type { ToolDefinition } from './registry';
import type { OpenAITool, OpenAIToolParameter } from '../llm/types';
import { executeTool } from './executor';

// ============================================================
// Data Model
// ============================================================

export interface AutomationStepDef {
    id: string;
    toolName: string;
    label: string;
    args: Record<string, string>;
    condition?: 'always' | 'previous_success' | 'previous_failure';
}

export interface AutomationParameter {
    name: string;
    type: 'string' | 'number' | 'boolean';
    description: string;
    required: boolean;
}

export interface CustomAutomation {
    id: string;
    name: string;
    displayName: string;
    description: string;
    icon?: string;
    parameters: AutomationParameter[];
    steps: AutomationStepDef[];
    createdAt: number;
    updatedAt: number;
    enabled: boolean;
}

/** Omit server-generated fields when creating */
export type CreateAutomationInput = Omit<CustomAutomation, 'id' | 'createdAt' | 'updatedAt'>;

/** Partial update (no id / timestamps) */
export type UpdateAutomationInput = Partial<Omit<CustomAutomation, 'id' | 'createdAt' | 'updatedAt'>>;

// ── Step Execution Result ──────────────────────────────────

interface StepResult {
    stepId: string;
    toolName: string;
    label: string;
    success: boolean;
    result: string;
    skipped: boolean;
}

// ============================================================
// Settings directory resolution (mirrors settings.store.ts)
// ============================================================

function resolveSettingsDir(): string {
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

const DATA_DIR = resolveSettingsDir();
const AUTOMATIONS_FILE = path.join(DATA_DIR, 'automations.json');

// Ensure the data directory exists
try {
    mkdirSync(DATA_DIR, { recursive: true });
} catch {
    // Directory may already exist
}

// ============================================================
// In-memory store
// ============================================================

let _automations: Map<string, CustomAutomation> = new Map();

// ============================================================
// Persistence helpers
// ============================================================

async function loadFromDisk(): Promise<CustomAutomation[]> {
    try {
        const file = Bun.file(AUTOMATIONS_FILE);
        if (await file.exists()) {
            const raw = (await file.json()) as unknown;
            if (Array.isArray(raw)) {
                console.log(`[Automations] Loaded ${raw.length} automation(s) from disk`);
                return raw as CustomAutomation[];
            }
        }
    } catch (err) {
        console.warn('[Automations] Could not read automations.json:', err);
    }
    return [];
}

async function saveToDisk(): Promise<void> {
    const list = Array.from(_automations.values());
    try {
        await Bun.write(AUTOMATIONS_FILE, JSON.stringify(list, null, 2));
        console.log(`[Automations] Persisted ${list.length} automation(s) to ${AUTOMATIONS_FILE}`);
    } catch (err) {
        console.error('[Automations] Failed to persist automations.json:', err);
    }
}

// ============================================================
// ID generation
// ============================================================

function generateId(): string {
    return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================
// Registry integration
//
// The registry will export register() and unregister().
// We import them here so automations appear as normal tools.
// ============================================================

// Lazy import to avoid circular dependency issues at module load.
// registry.ts must export `register` and `unregister`.
let _register: ((def: ToolDefinition) => void) | null = null;
let _unregister: ((name: string) => void) | null = null;

async function ensureRegistry(): Promise<{
    register: (def: ToolDefinition) => void;
    unregister: (name: string) => void;
}> {
    if (!_register || !_unregister) {
        // Dynamic import so we don't create a hard circular dep at parse time
        const registry = await import('./registry');
        _register = registry.register;
        _unregister = registry.unregister;
    }
    return { register: _register!, unregister: _unregister! };
}

// ── Build an OpenAI tool definition from an automation ──────

function buildOpenAITool(automation: CustomAutomation): OpenAITool {
    const properties: Record<string, OpenAIToolParameter> = {};
    const required: string[] = [];

    for (const param of automation.parameters) {
        properties[param.name] = {
            type: param.type,
            description: param.description,
        };
        if (param.required) {
            required.push(param.name);
        }
    }

    return {
        type: 'function',
        function: {
            name: automation.name,
            description: automation.description,
            parameters: {
                type: 'object',
                properties,
                required: required.length > 0 ? required : undefined,
            },
        },
    };
}

function buildToolDefinition(automation: CustomAutomation): ToolDefinition {
    return {
        name: automation.name,
        displayName: automation.displayName,
        description: automation.description,
        permissionLevel: 'SENSITIVE',
        openAITool: buildOpenAITool(automation),
    };
}

// ============================================================
// Template resolution
// ============================================================

/**
 * Resolve template strings in step args.
 *
 * Supported patterns:
 *   {{input.paramName}}        → value from inputArgs
 *   {{steps.stepId.result}}    → result string from a previous step
 */
function resolveTemplateArgs(
    args: Record<string, string>,
    inputArgs: Record<string, unknown>,
    stepResults: Map<string, StepResult>,
): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
        resolved[key] = resolveTemplateValue(value, inputArgs, stepResults);
    }

    return resolved;
}

function resolveTemplateValue(
    template: string,
    inputArgs: Record<string, unknown>,
    stepResults: Map<string, StepResult>,
): unknown {
    // Check if the entire value is a single template expression
    const singleMatch = template.match(/^\{\{(.+?)\}\}$/);
    if (singleMatch) {
        const resolved = lookupTemplateRef(singleMatch[1].trim(), inputArgs, stepResults);
        // Return the raw value (preserves type for non-string values)
        if (resolved !== undefined) return resolved;
        return template; // Leave unresolved templates as-is
    }

    // Replace all {{…}} occurrences within a larger string
    return template.replace(/\{\{(.+?)\}\}/g, (_match, ref: string) => {
        const resolved = lookupTemplateRef(ref.trim(), inputArgs, stepResults);
        return resolved !== undefined ? String(resolved) : _match;
    });
}

function lookupTemplateRef(
    ref: string,
    inputArgs: Record<string, unknown>,
    stepResults: Map<string, StepResult>,
): unknown | undefined {
    // {{input.xxx}}
    if (ref.startsWith('input.')) {
        const paramName = ref.slice('input.'.length);
        return inputArgs[paramName];
    }

    // {{steps.stepId.result}}
    if (ref.startsWith('steps.')) {
        const parts = ref.slice('steps.'.length).split('.');
        if (parts.length >= 2) {
            const stepId = parts[0];
            const field = parts[1]; // currently only 'result' is supported
            const sr = stepResults.get(stepId);
            if (sr && field === 'result') return sr.result;
        }
    }

    return undefined;
}

// ============================================================
// Condition evaluation
// ============================================================

function shouldRunStep(
    step: AutomationStepDef,
    previousResult: StepResult | undefined,
): boolean {
    const condition = step.condition ?? 'always';

    if (condition === 'always') return true;

    if (!previousResult) {
        // No previous step — only run if condition is 'always'
        return false;
    }

    if (condition === 'previous_success') return previousResult.success;
    if (condition === 'previous_failure') return !previousResult.success;

    return true;
}

// ============================================================
// Public API
// ============================================================

/**
 * Load automations from disk and register enabled ones in the tool registry.
 * Call once at server startup, after initSettings().
 */
export async function initAutomations(): Promise<void> {
    console.log(`[Automations] Data file: ${AUTOMATIONS_FILE}`);

    const list = await loadFromDisk();
    _automations.clear();

    for (const auto of list) {
        _automations.set(auto.id, auto);
    }

    await registerAutomationTools();
    console.log(`[Automations] Initialized — ${_automations.size} automation(s) loaded`);
}

/**
 * Return all automations as an array.
 */
export function getAutomations(): CustomAutomation[] {
    return Array.from(_automations.values());
}

/**
 * Return a single automation by ID, or undefined if not found.
 */
export function getAutomation(id: string): CustomAutomation | undefined {
    return _automations.get(id);
}

/**
 * Return a single automation by its tool name (e.g. "custom_research_and_save").
 * Used by the executor to delegate unknown tool names to custom automations.
 */
export function getAutomationByName(name: string): CustomAutomation | undefined {
    for (const automation of _automations.values()) {
        if (automation.name === name) return automation;
    }
    return undefined;
}

/**
 * Create a new automation, persist to disk, and register it in the tool registry.
 */
export async function createAutomation(data: CreateAutomationInput): Promise<CustomAutomation> {
    const now = Date.now();
    const automation: CustomAutomation = {
        ...data,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
    };

    _automations.set(automation.id, automation);
    await saveToDisk();

    // Register in tool registry if enabled
    if (automation.enabled) {
        const { register } = await ensureRegistry();
        register(buildToolDefinition(automation));
        console.log(`[Automations] Registered tool: ${automation.name}`);
    }

    console.log(`[Automations] Created automation "${automation.displayName}" (${automation.id})`);
    return automation;
}

/**
 * Update an existing automation, persist to disk, and re-register in the tool registry.
 */
export async function updateAutomation(
    id: string,
    data: UpdateAutomationInput,
): Promise<CustomAutomation | undefined> {
    const existing = _automations.get(id);
    if (!existing) return undefined;

    const oldName = existing.name;

    const updated: CustomAutomation = {
        ...existing,
        ...data,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: Date.now(),
    };

    _automations.set(id, updated);
    await saveToDisk();

    // Unregister old name if it changed
    const { register, unregister } = await ensureRegistry();
    if (oldName !== updated.name) {
        unregister(oldName);
        console.log(`[Automations] Unregistered old tool name: ${oldName}`);
    }

    // Re-register if enabled, unregister if disabled
    if (updated.enabled) {
        register(buildToolDefinition(updated));
        console.log(`[Automations] Re-registered tool: ${updated.name}`);
    } else {
        unregister(updated.name);
        console.log(`[Automations] Disabled tool: ${updated.name}`);
    }

    console.log(`[Automations] Updated automation "${updated.displayName}" (${id})`);
    return updated;
}

/**
 * Delete an automation, persist to disk, and unregister from the tool registry.
 */
export async function deleteAutomation(id: string): Promise<boolean> {
    const existing = _automations.get(id);
    if (!existing) return false;

    _automations.delete(id);
    await saveToDisk();

    // Unregister from tool registry
    await unregisterAutomationTool(existing.name);

    console.log(`[Automations] Deleted automation "${existing.displayName}" (${id})`);
    return true;
}

/**
 * Execute an automation by running its steps sequentially.
 *
 * Returns a formatted summary of all step results.
 */
export async function executeAutomation(
    automation: CustomAutomation,
    inputArgs: Record<string, unknown>,
): Promise<string> {
    console.log(`[Automations] Executing "${automation.displayName}" with ${automation.steps.length} step(s)`);

    const stepResults = new Map<string, StepResult>();
    let previousResult: StepResult | undefined;

    for (const step of automation.steps) {
        // ── Condition check ──
        if (!shouldRunStep(step, previousResult)) {
            const skipped: StepResult = {
                stepId: step.id,
                toolName: step.toolName,
                label: step.label,
                success: false,
                result: `Skipped (condition: ${step.condition ?? 'always'})`,
                skipped: true,
            };
            stepResults.set(step.id, skipped);
            console.log(`[Automations]   ⏭ Step "${step.label}" skipped (condition: ${step.condition})`);
            previousResult = skipped;
            continue;
        }

        // ── Resolve template args ──
        const resolvedArgs = resolveTemplateArgs(step.args, inputArgs, stepResults);
        console.log(`[Automations]   ▶ Step "${step.label}" → ${step.toolName}(${JSON.stringify(resolvedArgs)})`);

        // ── Execute tool ──
        let result: string;
        let success: boolean;

        try {
            result = await executeTool(step.toolName, resolvedArgs);
            success = true;
            console.log(`[Automations]   ✔ Step "${step.label}" succeeded`);
        } catch (err) {
            result = err instanceof Error ? err.message : String(err);
            success = false;
            console.warn(`[Automations]   ✘ Step "${step.label}" failed: ${result}`);
        }

        const stepResult: StepResult = {
            stepId: step.id,
            toolName: step.toolName,
            label: step.label,
            success,
            result,
            skipped: false,
        };

        stepResults.set(step.id, stepResult);
        previousResult = stepResult;
    }

    // ── Format summary ──
    return formatExecutionSummary(automation, stepResults);
}

// ── Step event types emitted by the streaming generator ──────────────────────

export type AutomationStepEvent =
    | {
          type: 'step_done';
          stepIndex: number;
          totalSteps: number;
          toolName: string;
          displayName: string;
          result: string;
          success: boolean;
          skipped: boolean;
      }
    | {
          type: 'done';
          summary: string;
      };

/**
 * Streaming variant of executeAutomation.
 *
 * Yields an `AutomationStepEvent` for each step as it completes, then a
 * final `done` event with the full formatted summary.  Callers (e.g. the
 * SSE agent loop) can forward each `step_done` event to the frontend as an
 * individual `tool_auto` card so the user sees every step in real-time
 * instead of the automation running as a silent black box.
 */
export async function* streamAutomationSteps(
    automation: CustomAutomation,
    inputArgs: Record<string, unknown>,
): AsyncGenerator<AutomationStepEvent> {
    console.log(`[Automations] Streaming "${automation.displayName}" with ${automation.steps.length} step(s)`);

    const stepResults = new Map<string, StepResult>();
    let previousResult: StepResult | undefined;
    const totalSteps = automation.steps.length;

    for (let i = 0; i < totalSteps; i++) {
        const step = automation.steps[i];

        // ── Condition check ──────────────────────────────────────────────
        if (!shouldRunStep(step, previousResult)) {
            const skipped: StepResult = {
                stepId: step.id,
                toolName: step.toolName,
                label: step.label,
                success: false,
                result: `Skipped (condition: ${step.condition ?? 'always'})`,
                skipped: true,
            };
            stepResults.set(step.id, skipped);
            console.log(`[Automations]   ⏭ Step "${step.label}" skipped`);
            previousResult = skipped;

            yield {
                type: 'step_done',
                stepIndex: i,
                totalSteps,
                toolName: step.toolName,
                displayName: step.label || step.toolName,
                result: skipped.result,
                success: false,
                skipped: true,
            };
            continue;
        }

        // ── Resolve template args ────────────────────────────────────────
        const resolvedArgs = resolveTemplateArgs(step.args, inputArgs, stepResults);
        console.log(`[Automations]   ▶ Step "${step.label}" → ${step.toolName}(${JSON.stringify(resolvedArgs)})`);

        // ── Execute tool ─────────────────────────────────────────────────
        let result: string;
        let success: boolean;

        try {
            result = await executeTool(step.toolName, resolvedArgs);
            success = true;
            console.log(`[Automations]   ✔ Step "${step.label}" succeeded`);
        } catch (err) {
            result = err instanceof Error ? err.message : String(err);
            success = false;
            console.warn(`[Automations]   ✘ Step "${step.label}" failed: ${result}`);
        }

        const stepResult: StepResult = {
            stepId: step.id,
            toolName: step.toolName,
            label: step.label,
            success,
            result,
            skipped: false,
        };

        stepResults.set(step.id, stepResult);
        previousResult = stepResult;

        // ── Yield step completion event ──────────────────────────────────
        yield {
            type: 'step_done',
            stepIndex: i,
            totalSteps,
            toolName: step.toolName,
            displayName: step.label || step.toolName,
            result,
            success,
            skipped: false,
        };
    }

    // ── Final summary ────────────────────────────────────────────────────
    yield {
        type: 'done',
        summary: formatExecutionSummary(automation, stepResults),
    };
}

/**
 * Register all enabled automations as tools in the tool registry.
 */
export async function registerAutomationTools(): Promise<void> {
    const { register } = await ensureRegistry();

    let count = 0;
    for (const automation of _automations.values()) {
        if (automation.enabled) {
            register(buildToolDefinition(automation));
            count++;
        }
    }

    if (count > 0) {
        console.log(`[Automations] Registered ${count} automation tool(s) in registry`);
    }
}

/**
 * Unregister a single automation tool from the registry by name.
 */
export async function unregisterAutomationTool(name: string): Promise<void> {
    const { unregister } = await ensureRegistry();
    unregister(name);
    console.log(`[Automations] Unregistered tool: ${name}`);
}

// ============================================================
// Formatting helpers
// ============================================================

function formatExecutionSummary(
    automation: CustomAutomation,
    stepResults: Map<string, StepResult>,
): string {
    const lines: string[] = [];

    lines.push(`## Automation: ${automation.displayName}`);
    lines.push('');

    let stepIndex = 0;
    for (const step of automation.steps) {
        stepIndex++;
        const sr = stepResults.get(step.id);
        if (!sr) continue;

        const icon = sr.skipped ? '⏭' : sr.success ? '✔' : '✘';
        const status = sr.skipped ? 'SKIPPED' : sr.success ? 'SUCCESS' : 'FAILED';

        lines.push(`### Step ${stepIndex}: ${sr.label} [${status}] ${icon}`);
        lines.push(`Tool: \`${sr.toolName}\``);
        lines.push('');
        lines.push(sr.result);
        lines.push('');
    }

    const allResults = Array.from(stepResults.values());
    const successCount = allResults.filter(r => r.success && !r.skipped).length;
    const failCount = allResults.filter(r => !r.success && !r.skipped).length;
    const skipCount = allResults.filter(r => r.skipped).length;

    lines.push('---');
    lines.push(`**Summary:** ${successCount} succeeded, ${failCount} failed, ${skipCount} skipped`);

    return lines.join('\n');
}
