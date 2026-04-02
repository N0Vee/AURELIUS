const API_BASE_CANDIDATES = [
    'http://127.0.0.1:4243',
    'http://localhost:4243',
];

let resolvedBackendApiBasePromise: Promise<string> | null = null;

async function probeBackendBase(base: string): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 2000);

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
        for (const base of API_BASE_CANDIDATES) {
            if (await probeBackendBase(base)) {
                return base;
            }
        }

        return API_BASE_CANDIDATES[0];
    })();

    return resolvedBackendApiBasePromise;
}

export async function resolveSettingsApiUrl(forceRefresh = false): Promise<string> {
    const base = await resolveBackendApiBase(forceRefresh);
    return `${base}/api/settings`;
}