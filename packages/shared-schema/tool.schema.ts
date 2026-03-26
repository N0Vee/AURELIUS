import { z } from 'zod';

// ============================================================
// Permission Tiers
// ============================================================

export const PermissionLevelSchema = z.enum(['SAFE', 'SENSITIVE', 'DANGEROUS']);
export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

// ============================================================
// Pending Tool Call
// Sent via SSE → frontend when the guard needs user confirmation
// ============================================================

export const PendingToolCallSchema = z.object({
    id: z.string(),
    toolName: z.string(),
    displayName: z.string(),
    description: z.string(),
    permissionLevel: PermissionLevelSchema,
    args: z.record(z.string(), z.unknown()),
    timestamp: z.number().default(() => Date.now()),
});

export type PendingToolCall = z.infer<typeof PendingToolCallSchema>;
