import { describe, test, expect } from 'bun:test';
import {
    PermissionLevel,
    ToolDefinitionSchema,
    requiresUserConfirmation,
    canAutoExecute,
    getConfirmationMessage,
    getTool,
    getToolsByPermission,
    type ToolDefinition,
} from '../tool.schema';

describe('PermissionLevel', () => {
    test('accepts valid permission levels', () => {
        expect(PermissionLevel.parse('SAFE')).toBe('SAFE');
        expect(PermissionLevel.parse('SENSITIVE')).toBe('SENSITIVE');
        expect(PermissionLevel.parse('DANGEROUS')).toBe('DANGEROUS');
    });

    test('rejects invalid permission level', () => {
        expect(() => PermissionLevel.parse('UNKNOWN')).toThrow();
    });
});

describe('ToolDefinitionSchema', () => {
    test('validates a complete tool definition', () => {
        const tool = {
            name: 'test_tool',
            description: 'A test tool',
            permissionLevel: 'SAFE',
            requiresConfirmation: false,
        };

        const result = ToolDefinitionSchema.parse(tool);

        expect(result.name).toBe('test_tool');
        expect(result.permissionLevel).toBe('SAFE');
    });
});

describe('requiresUserConfirmation', () => {
    test('SAFE tools never require confirmation', () => {
        const tool: ToolDefinition = {
            name: 'safe_tool',
            description: 'Safe',
            permissionLevel: 'SAFE',
            requiresConfirmation: true,
        };

        expect(requiresUserConfirmation(tool)).toBe(false);
    });

    test('SENSITIVE tools respect requiresConfirmation flag', () => {
        const toolWithConfirm: ToolDefinition = {
            name: 'sensitive_tool',
            description: 'Sensitive',
            permissionLevel: 'SENSITIVE',
            requiresConfirmation: true,
        };

        const toolWithoutConfirm: ToolDefinition = {
            name: 'sensitive_tool_2',
            description: 'Sensitive',
            permissionLevel: 'SENSITIVE',
            requiresConfirmation: false,
        };

        expect(requiresUserConfirmation(toolWithConfirm)).toBe(true);
        expect(requiresUserConfirmation(toolWithoutConfirm)).toBe(false);
    });

    test('DANGEROUS tools always require confirmation', () => {
        const tool: ToolDefinition = {
            name: 'dangerous_tool',
            description: 'Dangerous',
            permissionLevel: 'DANGEROUS',
            requiresConfirmation: false,
        };

        expect(requiresUserConfirmation(tool)).toBe(true);
    });
});

describe('canAutoExecute', () => {
    test('returns true for SAFE tools', () => {
        const tool: ToolDefinition = {
            name: 'safe_tool',
            description: 'Safe',
            permissionLevel: 'SAFE',
            requiresConfirmation: false,
        };

        expect(canAutoExecute(tool)).toBe(true);
    });

    test('returns false for DANGEROUS tools', () => {
        const tool: ToolDefinition = {
            name: 'dangerous_tool',
            description: 'Dangerous',
            permissionLevel: 'DANGEROUS',
            requiresConfirmation: true,
        };

        expect(canAutoExecute(tool)).toBe(false);
    });
});

describe('getConfirmationMessage', () => {
    test('returns null for SAFE tools', () => {
        const tool: ToolDefinition = {
            name: 'safe_tool',
            description: 'Safe tool',
            permissionLevel: 'SAFE',
            requiresConfirmation: false,
        };

        expect(getConfirmationMessage(tool)).toBeNull();
    });

    test('returns warning message for DANGEROUS tools', () => {
        const tool: ToolDefinition = {
            name: 'execute_command',
            description: 'Execute system command',
            permissionLevel: 'DANGEROUS',
            requiresConfirmation: true,
        };

        const message = getConfirmationMessage(tool);

        expect(message).toContain('DANGEROUS');
        expect(message).toContain('execute_command');
    });
});

describe('Tool Registry', () => {
    test('can retrieve registered tools', () => {
        const timeTool = getTool('get_time');
        const commandTool = getTool('execute_command');

        expect(timeTool).toBeDefined();
        expect(timeTool!.permissionLevel).toBe('SAFE');

        expect(commandTool).toBeDefined();
        expect(commandTool!.permissionLevel).toBe('DANGEROUS');
    });

    test('returns undefined for unregistered tools', () => {
        const unknown = getTool('unknown_tool');
        expect(unknown).toBeUndefined();
    });

    test('can filter tools by permission level', () => {
        const safeTools = getToolsByPermission('SAFE');
        const dangerousTools = getToolsByPermission('DANGEROUS');

        expect(safeTools.length).toBeGreaterThan(0);
        expect(safeTools.every(t => t.permissionLevel === 'SAFE')).toBe(true);

        expect(dangerousTools.length).toBeGreaterThan(0);
        expect(dangerousTools.every(t => t.permissionLevel === 'DANGEROUS')).toBe(true);
    });
});
