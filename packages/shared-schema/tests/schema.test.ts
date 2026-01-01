import { describe, test, expect } from 'bun:test';
import {
    ChatMessageSchema,
    ToolCallSchema,
    MessageRoleSchema,
} from '../chat.schema';
import {
    AudioChunkSchema,
    AudioSessionSchema,
    VADEventSchema,
    TranscriptionSchema,
} from '../audio.schema';
import {
    ToolResultSchema,
    ToolDefinitionSchema,
    PermissionLevel,
} from '../tool.schema';

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

    test('validates assistant message with tool calls', () => {
        const message = {
            role: 'assistant',
            content: 'Let me check the time for you.',
            tool_calls: [
                { id: 'call_1', name: 'get_time', arguments: '{}' }
            ],
        };

        const result = ChatMessageSchema.parse(message);

        expect(result.tool_calls).toHaveLength(1);
        expect(result.tool_calls![0].name).toBe('get_time');
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
    test('validates tool call structure', () => {
        const toolCall = {
            id: 'call_abc123',
            name: 'get_weather',
            arguments: '{"city": "Bangkok"}',
        };

        const result = ToolCallSchema.parse(toolCall);

        expect(result.name).toBe('get_weather');
        expect(JSON.parse(result.arguments)).toEqual({ city: 'Bangkok' });
    });
});

describe('ToolResultSchema', () => {
    test('validates successful tool result', () => {
        const result = {
            tool_call_id: 'call_abc123',
            name: 'get_weather',
            result: { temp: 32, condition: 'sunny' },
        };

        const parsed = ToolResultSchema.parse(result);

        expect(parsed.isError).toBe(false);
        expect(parsed.result.temp).toBe(32);
    });

    test('validates error tool result', () => {
        const result = {
            tool_call_id: 'call_abc123',
            name: 'get_weather',
            result: null,
            isError: true,
        };

        const parsed = ToolResultSchema.parse(result);

        expect(parsed.isError).toBe(true);
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
