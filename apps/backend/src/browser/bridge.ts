// ============================================================
// Aurelius Browser Control — bridge.ts
// Elysia WebSocket server that the Zen Browser extension
// connects to. Exposes sendBrowserCommand() for tool executor.
// ============================================================

import { Elysia } from 'elysia';

// ── Types ────────────────────────────────────────────────────

interface PendingCommand {
    resolve: (data: string) => void;
    reject:  (err: Error)   => void;
    timer:   ReturnType<typeof setTimeout>;
}

interface ExtensionMessage {
    id?:     string;
    success?: boolean;
    data?:   unknown;
    error?:  string;
    type?:   string;
}

// ── State ────────────────────────────────────────────────────

const COMMAND_TIMEOUT_MS = 30_000;

let _extensionWs: { send(data: string): void } | null = null;
const _pending = new Map<string, PendingCommand>();

// ── Public API ───────────────────────────────────────────────

export function isBrowserConnected(): boolean {
    return _extensionWs !== null;
}

export async function sendBrowserCommand(
    action: string,
    params: Record<string, unknown> = {},
): Promise<string> {
    if (!_extensionWs) {
        throw new Error(
            'Browser extension is not connected. ' +
            'Make sure the Aurelius extension is installed and enabled in Zen Browser.',
        );
    }

    const id = crypto.randomUUID();
    const payload = JSON.stringify({ type: 'command', id, action, params });

    console.log(`[BrowserBridge] ── SEND ──────────────────────────────────`);
    console.log(`[BrowserBridge]   action  : ${action}`);
    console.log(`[BrowserBridge]   id      : ${id}`);
    console.log(`[BrowserBridge]   params  : ${JSON.stringify(params)}`);
    console.log(`[BrowserBridge]   payload : ${payload.slice(0, 200)}`);
    console.log(`[BrowserBridge]   pending : ${_pending.size} command(s) already waiting`);

    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
            _pending.delete(id);
            console.error(`[BrowserBridge] ✖ TIMEOUT — command "${action}" (id: ${id}) did not receive a response within ${COMMAND_TIMEOUT_MS / 1000}s`);
            console.error(`[BrowserBridge]   pending map size after timeout: ${_pending.size}`);
            reject(new Error(`Browser command "${action}" timed out after ${COMMAND_TIMEOUT_MS / 1000}s`));
        }, COMMAND_TIMEOUT_MS);

        _pending.set(id, {
            resolve: (data) => {
                console.log(`[BrowserBridge] ✔ RESOLVED — action "${action}" (id: ${id})`);
                console.log(`[BrowserBridge]   result preview: ${String(data).slice(0, 120)}`);
                resolve(data);
            },
            reject,
            timer,
        });

        console.log(`[BrowserBridge]   registered in pending map. Map size: ${_pending.size}`);

        try {
            _extensionWs!.send(payload);
            console.log(`[BrowserBridge]   ws.send() called successfully`);
        } catch (err) {
            clearTimeout(timer);
            _pending.delete(id);
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[BrowserBridge] ✖ ws.send() threw: ${msg}`);
            reject(new Error(`Failed to send command to extension: ${msg}`));
        }
    });
}

// ── Message handler ──────────────────────────────────────────

function handleMessage(raw: unknown): void {
    // ── Step 1: log the raw value type ──
    const rawType = raw === null ? 'null'
        : raw instanceof Uint8Array ? 'Uint8Array'
        : Array.isArray(raw) ? 'Array'
        : typeof raw;

    console.log(`[BrowserBridge] ── RECV ──────────────────────────────────`);
    console.log(`[BrowserBridge]   raw type : ${rawType}`);

    if (rawType === 'Uint8Array') {
        console.log(`[BrowserBridge]   raw byte length : ${(raw as Uint8Array).byteLength}`);
    } else if (rawType === 'string') {
        console.log(`[BrowserBridge]   raw string preview : ${(raw as string).slice(0, 200)}`);
    } else if (rawType === 'object') {
        console.log(`[BrowserBridge]   raw object keys : ${Object.keys(raw as object).join(', ')}`);
        console.log(`[BrowserBridge]   raw object preview : ${JSON.stringify(raw).slice(0, 200)}`);
    }

    // ── Step 2: normalise to ExtensionMessage ──
    let msg: ExtensionMessage;

    if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && !(raw instanceof Uint8Array)) {
        // Elysia already parsed the JSON for us
        console.log(`[BrowserBridge]   parse path : already-object (Elysia auto-parsed)`);
        msg = raw as ExtensionMessage;
    } else {
        // Decode to string then JSON.parse
        let text: string;
        if (raw instanceof Uint8Array) {
            text = new TextDecoder().decode(raw);
            console.log(`[BrowserBridge]   parse path : Uint8Array → TextDecoder → "${text.slice(0, 120)}"`);
        } else {
            text = String(raw);
            console.log(`[BrowserBridge]   parse path : String() → "${text.slice(0, 120)}"`);
        }

        try {
            msg = JSON.parse(text) as ExtensionMessage;
            console.log(`[BrowserBridge]   JSON.parse succeeded`);
        } catch (err) {
            console.warn(`[BrowserBridge] ✖ JSON.parse failed — raw value was: "${text.slice(0, 200)}"`);
            console.warn(`[BrowserBridge]   parse error: ${err instanceof Error ? err.message : String(err)}`);
            return;
        }
    }

    // ── Step 3: log parsed message shape ──
    console.log(`[BrowserBridge]   msg.type    : ${msg.type ?? '(none)'}`);
    console.log(`[BrowserBridge]   msg.id      : ${msg.id ?? '(none)'}`);
    console.log(`[BrowserBridge]   msg.success : ${msg.success ?? '(none)'}`);
    console.log(`[BrowserBridge]   msg.error   : ${msg.error ?? '(none)'}`);
    console.log(`[BrowserBridge]   msg.data type   : ${msg.data === undefined ? 'undefined' : typeof msg.data}`);
    console.log(`[BrowserBridge]   msg.data preview: ${JSON.stringify(msg.data ?? '').slice(0, 120)}`);

    // ── Step 4: handle handshake ──
    if (msg.type === 'connected') {
        console.log(`[BrowserBridge] ✔ Handshake received from extension:`, JSON.stringify(msg));
        return;
    }

    // ── Step 5: match to pending command ──
    const { id } = msg;

    if (!id) {
        console.warn(`[BrowserBridge] ✖ Message has no id — cannot match to a pending command`);
        console.warn(`[BrowserBridge]   full message: ${JSON.stringify(msg).slice(0, 200)}`);
        return;
    }

    console.log(`[BrowserBridge]   looking up pending id "${id}" in map (size: ${_pending.size})`);
    console.log(`[BrowserBridge]   pending ids: [${Array.from(_pending.keys()).join(', ')}]`);

    const pending = _pending.get(id);
    if (!pending) {
        console.warn(`[BrowserBridge] ✖ No pending command found for id "${id}" — response arrived too late or was a duplicate`);
        return;
    }

    console.log(`[BrowserBridge]   found pending command for id "${id}" — resolving`);

    clearTimeout(pending.timer);
    _pending.delete(id);

    // ── Step 6: resolve or reject ──
    if (msg.success === false) {
        const errMsg = msg.error ?? 'Unknown error from browser extension';
        console.error(`[BrowserBridge] ✖ Extension reported error for id "${id}": ${errMsg}`);
        pending.reject(new Error(errMsg));
        return;
    }

    const data = msg.data;
    const result =
        data === undefined || data === null ? '' :
        typeof data === 'string' ? data :
        JSON.stringify(data, null, 2);

    console.log(`[BrowserBridge] ✔ Resolving pending "${id}" with ${result.length} chars`);
    pending.resolve(result);
}

// ── Pending cleanup ──────────────────────────────────────────

function rejectAllPending(reason: string): void {
    if (_pending.size > 0) {
        console.warn(`[BrowserBridge] Rejecting ${_pending.size} pending command(s): ${reason}`);
    }
    for (const [id, pending] of _pending) {
        clearTimeout(pending.timer);
        console.warn(`[BrowserBridge]   rejected pending id: ${id}`);
        pending.reject(new Error(reason));
        _pending.delete(id);
    }
}

// ── Elysia WebSocket route ───────────────────────────────────

export const browserBridgeRoute = new Elysia()
    .ws('/browser/ws', {
        open(ws) {
            console.log(`[BrowserBridge] ── OPEN ──────────────────────────────────`);
            if (_extensionWs) {
                console.warn(`[BrowserBridge]   replacing existing connection`);
                rejectAllPending('Browser extension reconnected — previous commands cancelled');
            }
            _extensionWs = ws;
            console.log(`[BrowserBridge] ✔ Extension connected`);
        },

        message(_ws, raw) {
            handleMessage(raw);
        },

        close() {
            console.log(`[BrowserBridge] ── CLOSE ─────────────────────────────────`);
            console.log(`[BrowserBridge]   Extension disconnected`);
            _extensionWs = null;
            rejectAllPending('Browser extension disconnected');
        },
    });
