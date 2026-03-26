type Decision = 'approved' | 'rejected';

const _pending = new Map<string, (d: Decision) => void>();

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns a Promise that resolves when the user approves or rejects the tool call.
 * Automatically resolves with 'timeout' after TIMEOUT_MS if no response.
 */
export async function waitForConfirmation(
    id: string
): Promise<Decision | 'timeout'> {
    const confirmationPromise = new Promise<Decision>((resolve) => {
        _pending.set(id, resolve);
    });

    const timeoutPromise = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), TIMEOUT_MS)
    );

    const result = await Promise.race([confirmationPromise, timeoutPromise]);

    if (result === 'timeout') {
        _pending.delete(id);
    }

    return result;
}

/**
 * Called by the tools route when the user clicks Approve or Reject.
 * Returns false if no pending confirmation exists for that id.
 */
export function resolveConfirmation(id: string, decision: Decision): boolean {
    const resolve = _pending.get(id);
    if (!resolve) return false;
    resolve(decision);
    _pending.delete(id);
    return true;
}

/**
 * Returns how many confirmations are currently waiting for a response.
 */
export function getPendingCount(): number {
    return _pending.size;
}
