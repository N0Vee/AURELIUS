import { describe, expect, test } from 'bun:test';
import {
    isToolResultFailure,
    normalizeToolResult,
    stripToolResultPrefix,
    summarizeToolValue,
} from './tool-result';

describe('tool result helpers', () => {
    test('prefixes successful results', () => {
        expect(normalizeToolResult('Opened file successfully.')).toBe(
            '[SUCCESS] Opened file successfully.',
        );
    });

    test('prefixes failures that use Error text', () => {
        expect(normalizeToolResult('Error: File not found.')).toBe(
            '[FAILED] Error: File not found.',
        );
    });

    test('preserves existing prefixes', () => {
        expect(normalizeToolResult('[SUCCESS] Already normalized.')).toBe(
            '[SUCCESS] Already normalized.',
        );
    });

    test('detects failure results consistently', () => {
        expect(isToolResultFailure('[FAILED] Command failed.')).toBe(true);
        expect(isToolResultFailure('Error: Missing file.')).toBe(true);
        expect(isToolResultFailure('[SUCCESS] Done.')).toBe(false);
    });

    test('strips status prefixes for chained tool values', () => {
        expect(stripToolResultPrefix('[SUCCESS] https://music.youtube.com/watch?v=abc123')).toBe(
            'https://music.youtube.com/watch?v=abc123',
        );

        expect(stripToolResultPrefix('[FAILED] Error: Missing file.')).toBe(
            'Error: Missing file.',
        );
    });

    test('summarizes structured values on one line', () => {
        const summary = summarizeToolValue({
            path: 'C:\\temp\\demo.txt',
            success: true,
        });

        expect(summary).toContain('demo.txt');
        expect(summary).toContain('success');
        expect(summary.includes('\n')).toBe(false);
    });
});