import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Re-export SDK type guards so consumers get proper type narrowing
export { isToolUIPart as isToolPart, getToolName } from 'ai';

const TOOL_RESULT_PREFIX_RE = /^\[(?:SUCCESS|FAILED)\]\s*/;

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function formatToolOutput(output: unknown): string {
    const text = typeof output === 'string'
        ? output
        : output != null
            ? JSON.stringify(output)
            : '';

    return text.replace(TOOL_RESULT_PREFIX_RE, '').trim();
}

export function isFailedToolOutput(output: unknown): boolean {
    const text = typeof output === 'string'
        ? output
        : output != null
            ? JSON.stringify(output)
            : '';

    return text.startsWith('[FAILED]') || /^Error(?:\b|:)/.test(text);
}
