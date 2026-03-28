import { Elysia, t } from 'elysia';
import {
    getAutomations,
    getAutomation,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    executeAutomation,
} from '../tools/automations';
import type { CreateAutomationInput, UpdateAutomationInput } from '../tools/automations';

// ============================================================
// Elysia body schemas
// ============================================================

const AutomationParameterSchema = t.Object({
    name: t.String(),
    type: t.Union([t.Literal('string'), t.Literal('number'), t.Literal('boolean')]),
    description: t.String(),
    required: t.Boolean(),
});

const AutomationStepSchema = t.Object({
    id: t.String(),
    toolName: t.String(),
    label: t.String(),
    args: t.Record(t.String(), t.String()),
    condition: t.Optional(
        t.Union([
            t.Literal('always'),
            t.Literal('previous_success'),
            t.Literal('previous_failure'),
        ]),
    ),
});

const CreateAutomationBody = t.Object({
    name: t.String(),
    displayName: t.String(),
    description: t.String(),
    icon: t.Optional(t.String()),
    parameters: t.Array(AutomationParameterSchema),
    steps: t.Array(AutomationStepSchema),
    enabled: t.Boolean(),
});

const UpdateAutomationBody = t.Object({
    name: t.Optional(t.String()),
    displayName: t.Optional(t.String()),
    description: t.Optional(t.String()),
    icon: t.Optional(t.String()),
    parameters: t.Optional(t.Array(AutomationParameterSchema)),
    steps: t.Optional(t.Array(AutomationStepSchema)),
    enabled: t.Optional(t.Boolean()),
});

const TestRunBody = t.Object({
    args: t.Record(t.String(), t.String()),
});

// ============================================================
// Route
// ============================================================

export const automationsRoute = new Elysia({ prefix: '/api/automations' })

    // ----------------------------------------------------------
    // GET /api/automations
    // List all automations
    // ----------------------------------------------------------
    .get('/', () => {
        return getAutomations();
    })

    // ----------------------------------------------------------
    // GET /api/automations/:id
    // Get a single automation by ID
    // ----------------------------------------------------------
    .get('/:id', ({ params }) => {
        const automation = getAutomation(params.id);
        if (!automation) {
            return new Response(
                JSON.stringify({ error: 'Automation not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } },
            );
        }
        return automation;
    })

    // ----------------------------------------------------------
    // POST /api/automations
    // Create a new automation
    // ----------------------------------------------------------
    .post(
        '/',
        async ({ body }) => {
            const input: CreateAutomationInput = {
                name: body.name,
                displayName: body.displayName,
                description: body.description,
                icon: body.icon,
                parameters: body.parameters,
                steps: body.steps,
                enabled: body.enabled,
            };

            const automation = await createAutomation(input);
            return automation;
        },
        { body: CreateAutomationBody },
    )

    // ----------------------------------------------------------
    // PATCH /api/automations/:id
    // Update an existing automation
    // ----------------------------------------------------------
    .patch(
        '/:id',
        async ({ params, body }) => {
            const data: UpdateAutomationInput = {};

            if (body.name !== undefined) data.name = body.name;
            if (body.displayName !== undefined) data.displayName = body.displayName;
            if (body.description !== undefined) data.description = body.description;
            if (body.icon !== undefined) data.icon = body.icon;
            if (body.parameters !== undefined) data.parameters = body.parameters;
            if (body.steps !== undefined) data.steps = body.steps;
            if (body.enabled !== undefined) data.enabled = body.enabled;

            const updated = await updateAutomation(params.id, data);
            if (!updated) {
                return new Response(
                    JSON.stringify({ error: 'Automation not found' }),
                    { status: 404, headers: { 'Content-Type': 'application/json' } },
                );
            }
            return updated;
        },
        { body: UpdateAutomationBody },
    )

    // ----------------------------------------------------------
    // DELETE /api/automations/:id
    // Delete an automation
    // ----------------------------------------------------------
    .delete('/:id', async ({ params }) => {
        const deleted = await deleteAutomation(params.id);
        if (!deleted) {
            return new Response(
                JSON.stringify({ error: 'Automation not found' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } },
            );
        }
        return { success: true };
    })

    // ----------------------------------------------------------
    // POST /api/automations/:id/test
    // Test-run an automation with the provided args
    // ----------------------------------------------------------
    .post(
        '/:id/test',
        async ({ params, body }) => {
            const automation = getAutomation(params.id);
            if (!automation) {
                return new Response(
                    JSON.stringify({ error: 'Automation not found' }),
                    { status: 404, headers: { 'Content-Type': 'application/json' } },
                );
            }

            try {
                const result = await executeAutomation(automation, body.args);
                return { success: true, result };
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return { success: false, error: message };
            }
        },
        { body: TestRunBody },
    );
