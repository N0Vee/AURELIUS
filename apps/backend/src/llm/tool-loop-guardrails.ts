import { isToolResultFailure, summarizeToolValue } from '../tools/tool-result';

interface ToolResultLike {
    toolName?: string;
    input?: unknown;
    output?: unknown;
}

interface StepLike {
    toolResults?: ToolResultLike[];
}

const MAX_RECENT_TOOL_RESULTS = 4;

export function buildStepToolLoopSystemContext(
    steps: StepLike[],
): string | undefined {
    const recentResults = steps
        .flatMap((step) => Array.isArray(step.toolResults) ? step.toolResults : [])
        .slice(-MAX_RECENT_TOOL_RESULTS);

    if (recentResults.length === 0) {
        return undefined;
    }

    const recentLines = recentResults.map((result, index) => {
        const toolName = result.toolName || 'unknown_tool';
        const inputSummary = summarizeToolValue(result.input, 120);
        const outputSummary = summarizeToolValue(result.output, 220);
        const status = isToolResultFailure(result.output) ? 'FAILED' : 'SUCCESS';

        return `${index + 1}. ${toolName}(${inputSummary}) => ${status}: ${outputSummary}`;
    });

    return [
        '=== CURRENT TOOL LOOP CHECK (MANDATORY) ===',
        'Before calling another tool, evaluate the latest tool results first.',
        'Recent tool results:',
        ...recentLines.map((line) => `- ${line}`),
        'Rules:',
        '- If a SUCCESS result already completed the user request, respond with text now and call no more tools.',
        '- NEVER repeat the same tool with the same target or equivalent input after a SUCCESS result.',
        '- Only retry after a FAILED result when you are changing the target/input or switching to a more appropriate tool.',
        '- Do NOT use verification tools after a clear SUCCESS result.',
        '- Wasteful patterns to avoid: write_file -> read_file/list_directory, open_file -> open_file/run_command, web_search -> web_search again with the same query.',
        '- If the latest result is FAILED and you cannot fix it with one more specific tool call, tell the user what failed.',
    ].join('\n');
}