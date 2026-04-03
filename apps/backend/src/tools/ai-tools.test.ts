import { afterEach, describe, expect, test } from 'bun:test';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { getAITools } from './ai-tools';
import { canAutoExecute, getAllTools } from './registry';
import { getSettings } from '../config/settings.store';

type AIToolShape = {
    needsApproval?: boolean;
    execute?: (args: Record<string, unknown>) => unknown;
};

const cleanupPaths = new Set<string>();

afterEach(async () => {
    await Promise.all(
        Array.from(cleanupPaths, async (targetPath) => {
            await rm(targetPath, { recursive: true, force: true });
        }),
    );
    cleanupPaths.clear();
});

describe('getAITools', () => {
    test('keeps safe tools auto-executable and non-safe tools approval-gated', () => {
        const tools = getAITools() as Record<string, AIToolShape>;
        const defs = getAllTools();

        const safeDefs = defs.filter(canAutoExecute);
        const gatedDefs = defs.filter((def) => !canAutoExecute(def));

        expect(safeDefs.length).toBeGreaterThan(0);
        expect(gatedDefs.length).toBeGreaterThan(0);

        for (const def of safeDefs) {
            const tool = tools[def.name];

            expect(tool).toBeDefined();
            expect(typeof tool.execute).toBe('function');
            expect(tool.needsApproval).toBeUndefined();
        }

        for (const def of gatedDefs) {
            const tool = tools[def.name];

            expect(tool).toBeDefined();
            expect(typeof tool.execute).toBe('function');
            expect(tool.needsApproval).toBe(true);
        }
    });

    test('executes representative safe, sensitive, and dangerous tools', async () => {
        const tools = getAITools() as Record<string, AIToolShape>;
        const safeTool = tools.wait;
        const sensitiveTool = tools.read_file;
        const dangerousTool = tools.write_file;

        expect(safeTool).toBeDefined();
        expect(sensitiveTool).toBeDefined();
        expect(dangerousTool).toBeDefined();

        expect(safeTool?.needsApproval).toBeUndefined();
        expect(sensitiveTool?.needsApproval).toBe(true);
        expect(dangerousTool?.needsApproval).toBe(true);

        const safeResult = await safeTool?.execute?.({ ms: 0 });
        expect(safeResult).toBe('[SUCCESS] Waited 0 ms.');

        const settings = getSettings();
        const testDir = join(settings.allowedWriteRoot, `tool-tests-${Date.now()}-${process.pid}`);
        const testFile = join(testDir, 'approval-roundtrip.txt');
        const fileContent = 'approval flow regression test';

        cleanupPaths.add(testDir);
        await mkdir(testDir, { recursive: true });

        const dangerousResult = await dangerousTool?.execute?.({
            path: testFile,
            content: fileContent,
        });

        expect(typeof dangerousResult).toBe('string');
        expect(dangerousResult).toContain('[SUCCESS]');
        expect(dangerousResult).toContain('Wrote');
        expect(dangerousResult).toContain(testFile);

        const sensitiveResult = await sensitiveTool?.execute?.({ path: testFile });

        expect(typeof sensitiveResult).toBe('string');
        expect(sensitiveResult).toContain('[SUCCESS]');
        expect(sensitiveResult).toContain(`Contents of "${testFile}":`);
        expect(sensitiveResult).toContain(fileContent);
    });
});
