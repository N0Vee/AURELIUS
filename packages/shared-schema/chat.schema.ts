import { z } from 'zod';

// ===== Message Roles =====
export const MessageRoleSchema = z.enum(['system', 'user', 'assistant', 'tool']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// ===== Tool Call Schema (OpenAI function calling format) =====
export const ToolCallSchema = z.object({
    id: z.string(),
    type: z.literal('function'),
    function: z.object({
        name: z.string(),
        arguments: z.string(), // JSON string
    }),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

// ===== Chat Message Schema =====
export const ChatMessageSchema = z.object({
    id: z.string().uuid().default(() => crypto.randomUUID()),
    role: MessageRoleSchema,
    content: z.string(),
    tool_calls: z.array(ToolCallSchema).optional(),   // set by assistant when calling a tool
    tool_call_id: z.string().optional(),              // set on role:'tool' result messages
    audio_url: z.string().optional(),
    timestamp: z.number().default(() => Date.now()),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
