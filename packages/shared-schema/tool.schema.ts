import { z } from 'zod';

// ===== Permission Levels =====
export const PermissionLevel = z.enum(['SAFE', 'SENSITIVE', 'DANGEROUS']);
export type PermissionLevel = z.infer<typeof PermissionLevel>;

// ===== Tool Definition Schema =====
export const ToolDefinitionSchema = z.object({
    name: z.string(),
    description: z.string(),
    permissionLevel: PermissionLevel,
    requiresConfirmation: z.boolean(),
});
export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ===== Tool Result Schema =====
export const ToolResultSchema = z.object({
    tool_call_id: z.string(),
    name: z.string(),
    result: z.any(),
    isError: z.boolean().default(false),
});
export type ToolResult = z.infer<typeof ToolResultSchema>;

// ===== Permission Validation Functions =====

export function requiresUserConfirmation(tool: ToolDefinition): boolean {
    if (tool.permissionLevel === 'DANGEROUS') return true;
    if (tool.permissionLevel === 'SENSITIVE') return tool.requiresConfirmation;
    return false;
}

export function canAutoExecute(tool: ToolDefinition): boolean {
    return !requiresUserConfirmation(tool);
}

export function getConfirmationMessage(tool: ToolDefinition): string | null {
    if (tool.permissionLevel === 'DANGEROUS') {
        return `⚠️ DANGEROUS: "${tool.name}" requires explicit confirmation. ${tool.description}`;
    }
    if (tool.permissionLevel === 'SENSITIVE' && tool.requiresConfirmation) {
        return `⚡ SENSITIVE: "${tool.name}" needs your approval. ${tool.description}`;
    }
    return null;
}

// ===== Tool Registry =====

const toolRegistry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
    const validated = ToolDefinitionSchema.parse(tool);
    toolRegistry.set(validated.name, validated);
}

export function getTool(name: string): ToolDefinition | undefined {
    return toolRegistry.get(name);
}

export function getAllTools(): ToolDefinition[] {
    return Array.from(toolRegistry.values());
}

export function getToolsByPermission(level: PermissionLevel): ToolDefinition[] {
    return getAllTools().filter(t => t.permissionLevel === level);
}

// ===== Pre-defined Tools =====

// SAFE
registerTool({
    name: 'get_time',
    description: 'Get current system time',
    permissionLevel: 'SAFE',
    requiresConfirmation: false,
});

registerTool({
    name: 'get_weather',
    description: 'Get weather information',
    permissionLevel: 'SAFE',
    requiresConfirmation: false,
});

// SENSITIVE
registerTool({
    name: 'write_file',
    description: 'Write content to a file',
    permissionLevel: 'SENSITIVE',
    requiresConfirmation: true,
});

registerTool({
    name: 'read_file',
    description: 'Read content from a file',
    permissionLevel: 'SENSITIVE',
    requiresConfirmation: false,
});

// DANGEROUS
registerTool({
    name: 'execute_command',
    description: 'Execute a system command',
    permissionLevel: 'DANGEROUS',
    requiresConfirmation: true,
});

registerTool({
    name: 'control_media',
    description: 'Control media playback (Spotify, YouTube, etc.)',
    permissionLevel: 'DANGEROUS',
    requiresConfirmation: true,
});

// ===== Execution Request Schema =====

export const ExecutionRequestSchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()),
    toolName: z.string(),
    arguments: z.record(z.string(), z.any()),
    requestedBy: z.enum(['llm', 'user', 'system']),
    timestamp: z.number().default(() => Date.now()),
});
export type ExecutionRequest = z.infer<typeof ExecutionRequestSchema>;

// ===== Execution Status =====

export const ExecutionStatus = z.enum([
    'pending_confirmation',
    'approved',
    'rejected',
    'executing',
    'completed',
    'failed',
]);
export type ExecutionStatus = z.infer<typeof ExecutionStatus>;

// ===== Pending Execution =====

export const PendingExecutionSchema = z.object({
    request: ExecutionRequestSchema,
    tool: z.custom<ToolDefinition>(),
    status: ExecutionStatus,
    confirmationMessage: z.string().nullable(),
    result: z.any().optional(),
    error: z.string().optional(),
    resolvedAt: z.number().optional(),
});
export type PendingExecution = z.infer<typeof PendingExecutionSchema>;

// ===== Execution Queue =====

const pendingQueue = new Map<string, PendingExecution>();

export function requestToolExecution(
    request: Omit<ExecutionRequest, 'id' | 'timestamp'>
): PendingExecution {
    const validated = ExecutionRequestSchema.parse(request);
    const tool = getTool(validated.toolName);

    if (!tool) {
        throw new Error(`Tool "${validated.toolName}" is not registered`);
    }

    const needsConfirmation = requiresUserConfirmation(tool);
    const confirmationMessage = getConfirmationMessage(tool);

    const pending: PendingExecution = {
        request: validated,
        tool,
        status: needsConfirmation ? 'pending_confirmation' : 'approved',
        confirmationMessage,
    };

    pendingQueue.set(validated.id, pending);
    return pending;
}

export function getPendingExecution(id: string): PendingExecution | undefined {
    return pendingQueue.get(id);
}

export function getPendingConfirmations(): PendingExecution[] {
    return Array.from(pendingQueue.values()).filter(
        (p) => p.status === 'pending_confirmation'
    );
}

export function approveExecution(id: string): PendingExecution {
    const pending = pendingQueue.get(id);
    if (!pending) throw new Error(`Execution ${id} not found`);
    if (pending.status !== 'pending_confirmation') {
        throw new Error(`Execution ${id} is not pending confirmation`);
    }
    pending.status = 'approved';
    pending.resolvedAt = Date.now();
    return pending;
}

export function rejectExecution(id: string, reason?: string): PendingExecution {
    const pending = pendingQueue.get(id);
    if (!pending) throw new Error(`Execution ${id} not found`);
    if (pending.status !== 'pending_confirmation') {
        throw new Error(`Execution ${id} is not pending confirmation`);
    }
    pending.status = 'rejected';
    pending.error = reason ?? 'User rejected execution';
    pending.resolvedAt = Date.now();
    return pending;
}

export function markExecuting(id: string): void {
    const pending = pendingQueue.get(id);
    if (!pending || pending.status !== 'approved') {
        throw new Error(`Cannot execute ${id}: not approved`);
    }
    pending.status = 'executing';
}

export function markCompleted(id: string, result: unknown): void {
    const pending = pendingQueue.get(id);
    if (!pending) return;
    pending.status = 'completed';
    pending.result = result;
    pending.resolvedAt = Date.now();
}

export function markFailed(id: string, error: string): void {
    const pending = pendingQueue.get(id);
    if (!pending) return;
    pending.status = 'failed';
    pending.error = error;
    pending.resolvedAt = Date.now();
}

export function clearResolved(): number {
    let cleared = 0;
    for (const [id, pending] of pendingQueue) {
        if (['completed', 'failed', 'rejected'].includes(pending.status)) {
            pendingQueue.delete(id);
            cleared++;
        }
    }
    return cleared;
}
