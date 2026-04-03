export const TOOL_SUCCESS_PREFIX = '[SUCCESS]';
export const TOOL_FAILURE_PREFIX = '[FAILED]';
const TOOL_RESULT_PREFIX_RE = /^\[(?:SUCCESS|FAILED)\]\s*/;

function stringifyToolValue(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value == null) return '';

    try {
        const json = JSON.stringify(value, null, 2);
        return json ?? String(value);
    } catch {
        return String(value);
    }
}

export function summarizeToolValue(value: unknown, maxLength = 240): string {
    const text = stringifyToolValue(value)
        .replace(/\s+/g, ' ')
        .trim();

    if (!text) return '(empty)';
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}…`;
}

export function isToolResultFailure(value: unknown): boolean {
    const text = stringifyToolValue(value).trim();

    if (!text) return false;

    return text.startsWith(TOOL_FAILURE_PREFIX) || /^Error(?:\b|:)/.test(text);
}

export function stripToolResultPrefix(value: unknown): string {
    return stringifyToolValue(value)
        .replace(TOOL_RESULT_PREFIX_RE, '')
        .trim();
}

export function normalizeToolResult(value: unknown): string {
    const text = stringifyToolValue(value).trim();

    if (!text) {
        return `${TOOL_SUCCESS_PREFIX} Tool completed successfully.`;
    }

    if (
        text.startsWith(TOOL_SUCCESS_PREFIX)
        || text.startsWith(TOOL_FAILURE_PREFIX)
    ) {
        return text;
    }

    return `${isToolResultFailure(text) ? TOOL_FAILURE_PREFIX : TOOL_SUCCESS_PREFIX} ${text}`;
}