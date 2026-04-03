import { describe, expect, test } from 'bun:test';
import { buildStepToolLoopSystemContext } from './tool-loop-guardrails';

describe('buildStepToolLoopSystemContext', () => {
    test('summarizes recent successful tool results and warns against repeats', () => {
        const context = buildStepToolLoopSystemContext([
            {
                toolResults: [
                    {
                        toolName: 'write_file',
                        input: { path: 'C:\\temp\\note.txt' },
                        output: '[SUCCESS] Wrote "C:\\temp\\note.txt" successfully.',
                    },
                ],
            },
        ]);

        expect(context).toContain('write_file');
        expect(context).toContain('SUCCESS');
        expect(context).toContain('NEVER repeat the same tool');
        expect(context).toContain('write_file -> read_file/list_directory');
    });

    test('marks error-like tool outputs as failed', () => {
        const context = buildStepToolLoopSystemContext([
            {
                toolResults: [
                    {
                        toolName: 'open_file',
                        input: { path: 'C:\\temp\\missing.txt' },
                        output: 'Error: File not found at "C:\\temp\\missing.txt".',
                    },
                ],
            },
        ]);

        expect(context).toContain('FAILED');
        expect(context).toContain('tell the user what failed');
    });
});