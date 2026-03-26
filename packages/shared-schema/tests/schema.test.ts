import { describe, test, expect } from 'bun:test';
import {
    ChatMessageSchema,
    ToolCallSchema,
    MessageRoleSchema,
} from '../chat.schema';
import { PermissionLevelSchema, PendingToolCallSchema } from '../tool.schema';
import {
    AudioChunkSchema,
    AudioSessionSchema,
    VADEventSchema,
    TranscriptionSchema,
} from '../audio.schema';

describe('ChatMessageSchema', () => {
    test('validates a complete message', () => {
        const message = {
            role: 'user',
            content: 'Hello, AURELIUS!',
        };

        const result = ChatMessageSchema.parse(message);

        expect(result.role).toBe('user');
        expect(result.content).toBe('Hello, AURELIUS!');
        expect(result.id).toBeDefined();
        expect(result.timestamp).toBeDefined();
    });

    test('rejects invalid role', () => {
        const message = {
            role: 'invalid_role',
            content: 'Test',
        };

        expect(() => ChatMessageSchema.parse(message)).toThrow();
    });
});

describe('MessageRoleSchema', () => {
    test('accepts valid roles', () => {
        expect(MessageRoleSchema.parse('system')).toBe('system');
        expect(MessageRoleSchema.parse('user')).toBe('user');
        expect(MessageRoleSchema.parse('assistant')).toBe('assistant');
        expect(MessageRoleSchema.parse('tool')).toBe('tool');
    });

    test('rejects invalid role', () => {
        expect(() => MessageRoleSchema.parse('admin')).toThrow();
    });
});

describe('ToolCallSchema', () => {
    test('validates a tool call in OpenAI format', () => {
        const tc = {
            id: 'call_abc123',
            type: 'function',
            function: { name: 'get_time', arguments: '{}' },
        };
        const result = ToolCallSchema.parse(tc);
        expect(result.id).toBe('call_abc123');
        expect(result.function.name).toBe('get_time');
    });

    test('rejects wrong type literal', () => {
        expect(() => ToolCallSchema.parse({
            id: 'x', type: 'tool', function: { name: 'f', arguments: '{}' },
        })).toThrow();
    });
});

describe('ChatMessageSchema — tool messages', () => {
    test('validates assistant message with tool_calls', () => {
        const msg = {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_time', arguments: '{}' } }],
        };
        const result = ChatMessageSchema.parse(msg);
        expect(result.tool_calls).toHaveLength(1);
        expect(result.tool_calls![0].function.name).toBe('get_time');
    });

    test('validates tool result message', () => {
        const msg = { role: 'tool', content: '12:30 PM', tool_call_id: 'call_1' };
        const result = ChatMessageSchema.parse(msg);
        expect(result.role).toBe('tool');
        expect(result.tool_call_id).toBe('call_1');
    });
});

describe('PermissionLevelSchema', () => {
    test('accepts valid levels', () => {
        expect(PermissionLevelSchema.parse('SAFE')).toBe('SAFE');
        expect(PermissionLevelSchema.parse('SENSITIVE')).toBe('SENSITIVE');
        expect(PermissionLevelSchema.parse('DANGEROUS')).toBe('DANGEROUS');
    });

    test('rejects invalid level', () => {
        expect(() => PermissionLevelSchema.parse('UNKNOWN')).toThrow();
    });
});

describe('PendingToolCallSchema', () => {
    test('validates a pending tool call', () => {
        const pending = {
            id: crypto.randomUUID(),
            toolName: 'open_app',
            displayName: 'Open Application',
            description: 'Opens a Windows app',
            permissionLevel: 'DANGEROUS',
            args: { app: 'notepad' },
        };
        const result = PendingToolCallSchema.parse(pending);
        expect(result.permissionLevel).toBe('DANGEROUS');
        expect(result.args).toEqual({ app: 'notepad' });
        expect(result.timestamp).toBeDefined();
    });
});

describe('AudioChunkSchema', () => {
    test('validates audio chunk for streaming', () => {
        const chunk = {
            streamId: 'stream_123',
            chunk: 'SGVsbG8gV29ybGQ=',
            isFinal: false,
        };

        const result = AudioChunkSchema.parse(chunk);

        expect(result.streamId).toBe('stream_123');
        expect(result.isFinal).toBe(false);
    });

    test('validates final audio chunk', () => {
        const chunk = {
            streamId: 'stream_123',
            chunk: '',
            isFinal: true,
        };

        const result = AudioChunkSchema.parse(chunk);

        expect(result.isFinal).toBe(true);
    });
});

describe('AudioSessionSchema', () => {
    test('validates audio session with defaults', () => {
        const session = AudioSessionSchema.parse({});

        expect(session.id).toBeDefined();
        expect(session.sampleRate).toBe(16000);
        expect(session.channels).toBe(1);
    });
});

describe('VADEventSchema', () => {
    test('validates VAD speech start event', () => {
        const event = {
            sessionId: 'session_123',
            type: 'speech_start',
        };

        const result = VADEventSchema.parse(event);

        expect(result.type).toBe('speech_start');
        expect(result.timestamp).toBeDefined();
    });
});

describe('TranscriptionSchema', () => {
    test('validates transcription with Thai default', () => {
        const transcription = {
            sessionId: 'session_123',
            text: 'สวัสดีครับ',
        };

        const result = TranscriptionSchema.parse(transcription);

        expect(result.language).toBe('th');
        expect(result.isFinal).toBe(false);
    });
});
