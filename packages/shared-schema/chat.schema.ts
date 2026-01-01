import { z } from 'zod';

// ===== Message Roles =====
export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// ===== Chat Message Schema =====
export const ChatMessageSchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()),
    role: MessageRoleSchema,
    content: z.string(),
    tool_calls: z.array(z.lazy(() => ToolCallSchema)).optional(),
    audio_url: z.string().optional(),
    timestamp: z.number().default(() => Date.now()),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ===== Tool Call Schema (inline to avoid circular) =====
export const ToolCallSchema = z.object({
    id: z.string(),
    name: z.string(),
    arguments: z.string(), // JSON string
});
export type ToolCall = z.infer<typeof ToolCallSchema>;
