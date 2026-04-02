export interface AudioEngineEndpoints {
    rawUrl: string;
    websocketUrl: string;
    ttsUrl: string;
    healthUrl: string;
}

const DEFAULT_AUDIO_ENGINE_URL = 'ws://localhost:8000/ws/audio';
const AUDIO_STREAM_SUFFIX = '/ws/audio';
const LEGACY_AUDIO_STREAM_SUFFIX = '/ws';

function normalizeBasePath(pathname: string): string {
    if (!pathname || pathname === '/') {
        return '';
    }

    const trimmed = pathname.replace(/\/+$/, '');

    if (trimmed.endsWith(AUDIO_STREAM_SUFFIX)) {
        return trimmed.slice(0, -AUDIO_STREAM_SUFFIX.length);
    }

    if (trimmed.endsWith(LEGACY_AUDIO_STREAM_SUFFIX)) {
        return trimmed.slice(0, -LEGACY_AUDIO_STREAM_SUFFIX.length);
    }

    return trimmed;
}

function joinPath(basePath: string, suffix: string): string {
    const normalizedBase = basePath && basePath !== '/' ? basePath.replace(/\/+$/, '') : '';
    const normalizedSuffix = suffix.startsWith('/') ? suffix : `/${suffix}`;

    return normalizedBase ? `${normalizedBase}${normalizedSuffix}` : normalizedSuffix;
}

function toHttpProtocol(protocol: string): string {
    if (protocol === 'ws:') {
        return 'http:';
    }

    if (protocol === 'wss:') {
        return 'https:';
    }

    return protocol;
}

function toWebSocketProtocol(protocol: string): string {
    if (protocol === 'http:') {
        return 'ws:';
    }

    if (protocol === 'https:') {
        return 'wss:';
    }

    return protocol;
}

export function resolveAudioEngineEndpoints(audioEngineUrl: string): AudioEngineEndpoints {
    let parsedUrl: URL;

    try {
        parsedUrl = new URL(audioEngineUrl || DEFAULT_AUDIO_ENGINE_URL);
    } catch {
        parsedUrl = new URL(DEFAULT_AUDIO_ENGINE_URL);
    }

    const basePath = normalizeBasePath(parsedUrl.pathname);
    const httpProtocol = toHttpProtocol(parsedUrl.protocol);
    const wsProtocol = toWebSocketProtocol(parsedUrl.protocol);

    const healthUrl = new URL(parsedUrl.toString());
    healthUrl.protocol = httpProtocol;
    healthUrl.pathname = joinPath(basePath, '/health');
    healthUrl.search = '';
    healthUrl.hash = '';

    const ttsUrl = new URL(parsedUrl.toString());
    ttsUrl.protocol = httpProtocol;
    ttsUrl.pathname = joinPath(basePath, '/api/tts');
    ttsUrl.search = '';
    ttsUrl.hash = '';

    const websocketUrl = new URL(parsedUrl.toString());
    websocketUrl.protocol = wsProtocol;
    websocketUrl.pathname = joinPath(basePath, AUDIO_STREAM_SUFFIX);
    websocketUrl.search = '';
    websocketUrl.hash = '';

    return {
        rawUrl: parsedUrl.toString(),
        websocketUrl: websocketUrl.toString(),
        ttsUrl: ttsUrl.toString(),
        healthUrl: healthUrl.toString(),
    };
}