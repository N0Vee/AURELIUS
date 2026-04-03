const API_BASE_CANDIDATES = [
    'http://127.0.0.1:4243',
    'http://localhost:4243',
];

const BACKEND_PROBE_TIMEOUT_MS = 2000;

let resolvedBackendApiBasePromise: Promise<string> | null = null;

async function probeBackendBase(base: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), BACKEND_PROBE_TIMEOUT_MS);

        try {
            const res = await fetch(`${base}/health`, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });

            return res.ok;
        } finally {
            window.clearTimeout(timeout);
        }
    } catch {
        return false;
    }
}

export async function resolveBackendApiBase(forceRefresh = false): Promise<string> {
    if (!forceRefresh && resolvedBackendApiBasePromise) {
        return resolvedBackendApiBasePromise;
    }

    resolvedBackendApiBasePromise = (async () => {
        try {
            return await Promise.any(
                API_BASE_CANDIDATES.map(async (base) => {
                    if (await probeBackendBase(base)) {
                        return base;
                    }

                    throw new Error(`Backend probe failed for ${base}`);
                }),
            );
        } catch {
            return API_BASE_CANDIDATES[0];
        }
    })();

    return resolvedBackendApiBasePromise;
}

export async function resolveSettingsApiUrl(forceRefresh = false): Promise<string> {
    const base = await resolveBackendApiBase(forceRefresh);
    return `${base}/api/settings`;
}