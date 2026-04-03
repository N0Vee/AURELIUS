import { describe, expect, test } from 'bun:test';
import {
    executeAutomation,
    resolveTemplateArgs,
    streamAutomationSteps,
    type CustomAutomation,
    type StepResult,
} from './automations';

function createAutomationWithFailureBranch(condition: 'previous_failure' | 'previous_success'): CustomAutomation {
    const now = Date.now();

    return {
        id: `auto_test_${condition}`,
        name: `test_${condition}`,
        displayName: `Test ${condition}`,
        description: 'Checks that automation step failures are recognized from normalized tool output.',
        parameters: [],
        steps: [
            {
                id: 'step_read_missing',
                toolName: 'read_file',
                label: 'Read missing file',
                args: {
                    path: 'C:\\__aurelius_missing__\\does-not-exist.txt',
                },
                condition: 'always',
            },
            {
                id: 'step_conditional',
                toolName: 'wait',
                label: `Run on ${condition}`,
                args: {
                    ms: '0',
                },
                condition,
            },
        ],
        createdAt: now,
        updatedAt: now,
        enabled: true,
    };
}

describe('automation execution with normalized tool results', () => {
    test('reuses previous step results without normalized status prefixes', () => {
        const stepResults = new Map<string, StepResult>([
            [
                'step_get_href',
                {
                    stepId: 'step_get_href',
                    toolName: 'browser_execute_js',
                    label: 'Extract First Song href',
                    success: true,
                    result: '[SUCCESS] https://music.youtube.com/watch?v=8cCLpR5SkgA',
                    skipped: false,
                },
            ],
        ]);

        const resolved = resolveTemplateArgs(
            {
                url: '{{steps.step_get_href.result}}',
            },
            {},
            stepResults,
        );

        expect(resolved).toEqual({
            url: 'https://music.youtube.com/watch?v=8cCLpR5SkgA',
        });
    });

    test('treats [FAILED] tool outputs as failed steps for branching and summary', async () => {
        const summary = await executeAutomation(createAutomationWithFailureBranch('previous_failure'), {});

        expect(summary).toContain('Step 1: Read missing file [FAILED]');
        expect(summary).toContain('[FAILED]');
        expect(summary).toContain('Step 2: Run on previous_failure [SUCCESS]');
        expect(summary).toContain('**Summary:** 1 succeeded, 1 failed, 0 skipped');
    });

    test('skips previous_success steps when the prior tool returned a normalized failure', async () => {
        const summary = await executeAutomation(createAutomationWithFailureBranch('previous_success'), {});

        expect(summary).toContain('Step 1: Read missing file [FAILED]');
        expect(summary).toContain('Step 2: Run on previous_success [SKIPPED]');
        expect(summary).toContain('**Summary:** 0 succeeded, 1 failed, 1 skipped');
    });

    test('streaming step events expose normalized tool failures and skips correctly', async () => {
        const events = await collectAutomationEvents(createAutomationWithFailureBranch('previous_success'));

        expect(events).toHaveLength(3);

        expect(events[0]).toMatchObject({
            type: 'step_done',
            toolName: 'read_file',
            success: false,
            skipped: false,
        });

        expect(events[1]).toMatchObject({
            type: 'step_done',
            toolName: 'wait',
            success: false,
            skipped: true,
        });

        expect(events[2]).toMatchObject({
            type: 'done',
        });
    });
});

async function collectAutomationEvents(automation: CustomAutomation) {
    const events = [];

    for await (const event of streamAutomationSteps(automation, {})) {
        events.push(event);
    }

    return events;
}