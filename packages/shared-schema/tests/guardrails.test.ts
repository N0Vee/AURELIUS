import { describe, test, expect } from 'bun:test';
import {
    requestToolExecution,
    getPendingExecution,
    getPendingConfirmations,
    approveExecution,
    rejectExecution,
    markExecuting,
    markCompleted,
    markFailed,
    clearResolved,
} from '../tool.schema';

describe('requestToolExecution', () => {
    test('auto-approves SAFE tools', () => {
        const pending = requestToolExecution({
            toolName: 'get_time',
            arguments: {},
            requestedBy: 'llm',
        });

        expect(pending.status).toBe('approved');
        expect(pending.confirmationMessage).toBeNull();
    });

    test('queues DANGEROUS tools for confirmation', () => {
        const pending = requestToolExecution({
            toolName: 'execute_command',
            arguments: { cmd: 'dir' },
            requestedBy: 'llm',
        });

        expect(pending.status).toBe('pending_confirmation');
        expect(pending.confirmationMessage).toContain('DANGEROUS');
    });

    test('throws for unregistered tools', () => {
        expect(() => requestToolExecution({
            toolName: 'unknown_tool',
            arguments: {},
            requestedBy: 'llm',
        })).toThrow('not registered');
    });

    test('generates unique execution IDs', () => {
        const pending1 = requestToolExecution({
            toolName: 'get_time',
            arguments: {},
            requestedBy: 'llm',
        });

        const pending2 = requestToolExecution({
            toolName: 'get_time',
            arguments: {},
            requestedBy: 'llm',
        });

        expect(pending1.request.id).not.toBe(pending2.request.id);
    });
});

describe('Approval Flow', () => {
    test('can approve pending execution', () => {
        const pending = requestToolExecution({
            toolName: 'execute_command',
            arguments: { cmd: 'echo hello' },
            requestedBy: 'llm',
        });

        expect(pending.status).toBe('pending_confirmation');

        const approved = approveExecution(pending.request.id);

        expect(approved.status).toBe('approved');
        expect(approved.resolvedAt).toBeDefined();
    });

    test('can reject pending execution', () => {
        const pending = requestToolExecution({
            toolName: 'control_media',
            arguments: { action: 'pause' },
            requestedBy: 'llm',
        });

        const rejected = rejectExecution(pending.request.id, 'Not now');

        expect(rejected.status).toBe('rejected');
        expect(rejected.error).toBe('Not now');
    });

    test('getPendingConfirmations returns only pending items', () => {
        const pending = requestToolExecution({
            toolName: 'execute_command',
            arguments: {},
            requestedBy: 'llm',
        });

        const confirmations = getPendingConfirmations();

        expect(confirmations.some(p => p.request.id === pending.request.id)).toBe(true);
    });
});

describe('Execution Lifecycle', () => {
    test('markExecuting changes status', () => {
        const pending = requestToolExecution({
            toolName: 'get_time',
            arguments: {},
            requestedBy: 'user',
        });

        markExecuting(pending.request.id);

        const execution = getPendingExecution(pending.request.id);
        expect(execution?.status).toBe('executing');
    });

    test('markCompleted stores result', () => {
        const pending = requestToolExecution({
            toolName: 'get_time',
            arguments: {},
            requestedBy: 'user',
        });

        markExecuting(pending.request.id);
        markCompleted(pending.request.id, { time: '18:30' });

        const execution = getPendingExecution(pending.request.id);
        expect(execution?.status).toBe('completed');
        expect(execution?.result).toEqual({ time: '18:30' });
    });

    test('markFailed stores error', () => {
        const pending = requestToolExecution({
            toolName: 'get_weather',
            arguments: {},
            requestedBy: 'user',
        });

        markExecuting(pending.request.id);
        markFailed(pending.request.id, 'Network error');

        const execution = getPendingExecution(pending.request.id);
        expect(execution?.status).toBe('failed');
        expect(execution?.error).toBe('Network error');
    });
});

describe('clearResolved', () => {
    test('clears completed and rejected executions', () => {
        const pending = requestToolExecution({
            toolName: 'get_time',
            arguments: {},
            requestedBy: 'user',
        });

        markExecuting(pending.request.id);
        markCompleted(pending.request.id, { time: '18:30' });

        const clearedCount = clearResolved();

        expect(clearedCount).toBeGreaterThanOrEqual(1);
        expect(getPendingExecution(pending.request.id)).toBeUndefined();
    });
});
