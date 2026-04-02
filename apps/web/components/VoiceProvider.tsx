'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { resolveAudioEngineEndpoints, type AudioEngineEndpoints } from '@/lib/audio-engine';
import { resolveSettingsApiUrl } from '@/lib/backend-api';

const DEFAULT_AUDIO_ENGINE_URL = 'ws://localhost:8000/ws/audio';
const AUDIO_RUNTIME_POLL_MS = 5000;
const HEALTH_TIMEOUT_MS = 2000;
const DEFAULT_AUDIO_CONNECTING_MESSAGE = 'Starting audio...';
const DEFAULT_AUDIO_WARMUP_MESSAGE = 'Preparing speech models...';

type VoiceConnectionStatus = 'connecting' | 'connected' | 'disconnected';
type AudioContextConstructor = typeof AudioContext;
type WindowWithWebkitAudioContext = Window & {
    webkitAudioContext?: AudioContextConstructor;
};

interface AudioRuntimeHealth {
    reachable: boolean;
    ready: boolean;
    state: string;
    message: string | null;
    error: string | null;
}

async function resolveAudioRuntime(): Promise<AudioEngineEndpoints> {
    let configuredAudioUrl = DEFAULT_AUDIO_ENGINE_URL;

    try {
        const settingsUrl = await resolveSettingsApiUrl();
        const res = await fetch(settingsUrl, {
            method: 'GET',
            cache: 'no-store',
        });

        if (res.ok) {
            const payload = await res.json() as { audioEngineUrl?: string };
            if (typeof payload.audioEngineUrl === 'string' && payload.audioEngineUrl.trim().length > 0) {
                configuredAudioUrl = payload.audioEngineUrl.trim();
            }
        }
    } catch { }

    return resolveAudioEngineEndpoints(configuredAudioUrl);
}

async function fetchAudioRuntimeHealth(healthUrl: string): Promise<AudioRuntimeHealth> {
    try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

        try {
            const res = await fetch(healthUrl, {
                method: 'GET',
                cache: 'no-store',
                signal: controller.signal,
            });

            if (!res.ok) {
                return {
                    reachable: true,
                    ready: false,
                    state: 'error',
                    message: `Audio service returned HTTP ${res.status}.`,
                    error: null,
                };
            }

            const payload = await res.json().catch(() => null) as {
                ready?: boolean;
                state?: string;
                message?: string | null;
                error?: string | null;
            } | null;

            return {
                reachable: true,
                ready: payload?.ready === true,
                state: payload?.state ?? (payload?.ready ? 'ready' : 'starting'),
                message: payload?.message ?? null,
                error: payload?.error ?? null,
            };
        } finally {
            window.clearTimeout(timeout);
        }
    } catch {
        return {
            reachable: false,
            ready: false,
            state: 'starting',
            message: DEFAULT_AUDIO_CONNECTING_MESSAGE,
            error: null,
        };
    }
}

// ── Voice confirmation keywords ───────────────────────────────────────────────

const APPROVE_KW = ['yes', 'confirm', 'approve', 'go ahead', 'do it', 'sure', 'yeah', 'yep', 'okay', 'ok', 'proceed', 'continue', 'ใช่', 'ตกลง', 'ทำเลย', 'อนุมัติ', 'ได้เลย'];
const REJECT_KW = ['no', 'reject', 'cancel', "don't", 'stop', 'nope', 'skip', 'deny', 'ไม่', 'ยกเลิก', 'ไม่ทำ', 'ปฏิเสธ'];

export function detectVoiceDecision(text: string): 'approve' | 'reject' | null {
    const lower = text.toLowerCase().trim().replace(/[.,!?]+$/, '');
    for (const kw of REJECT_KW) if (lower === kw || lower.startsWith(kw + ' ')) return 'reject';
    for (const kw of APPROVE_KW) if (lower === kw || lower.startsWith(kw + ' ')) return 'approve';
    return null;
}

// ── Toggle beep ───────────────────────────────────────────────────────────────

function playBeep(up: boolean) {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        const t = ctx.currentTime;
        osc.frequency.setValueAtTime(up ? 880 : 1320, t);
        osc.frequency.setValueAtTime(up ? 1320 : 880, t + 0.08);
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
        osc.start(t);
        osc.stop(t + 0.15);
        osc.onended = () => ctx.close();
    } catch { }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface VoiceContextType {
    isConnected: boolean;
    connectionStatus: VoiceConnectionStatus;
    connectionMessage: string | null;
    isRecording: boolean;
    isSpeaking: boolean;
    startRecording: () => void;
    stopRecording: () => void;
    toggleRecording: () => void;
    speakText: (text: string) => void;
    setSessionId: (id: string) => void;
    onTranscription: (callback: (text: string) => void) => void;
    onToolConfirm: (callback: (approved: boolean) => void) => void;
}

const VoiceContext = createContext<VoiceContextType>({
    isConnected: false, connectionStatus: 'connecting', connectionMessage: DEFAULT_AUDIO_CONNECTING_MESSAGE, isRecording: false, isSpeaking: false,
    startRecording: () => { }, stopRecording: () => { },
    toggleRecording: () => { }, speakText: () => { },
    setSessionId: () => { }, onTranscription: () => { }, onToolConfirm: () => { },
});

export function useVoice() { return useContext(VoiceContext); }

// ── Provider ──────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: ReactNode }) {
    const [isConnected, setIsConnected] = useState(false);
    const [connectionStatus, setConnectionStatus] = useState<VoiceConnectionStatus>('connecting');
    const [connectionMessage, setConnectionMessage] = useState<string | null>(DEFAULT_AUDIO_CONNECTING_MESSAGE);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const ws = useRef<WebSocket | null>(null);
    const connectPromise = useRef<Promise<void> | null>(null);
    const audioRuntime = useRef<AudioEngineEndpoints | null>(null);
    const audioCtx = useRef<AudioContext | null>(null);
    const worklet = useRef<AudioWorkletNode | null>(null);
    const micStream = useRef<MediaStream | null>(null);
    const sessionId = useRef('default');
    const buf = useRef<string[]>([]);
    const pendingFlush = useRef(false);

    // External callbacks
    const transcriptionCb = useRef<((text: string) => void) | null>(null);
    const toolConfirmCb = useRef<((approved: boolean) => void) | null>(null);

    const ensureAudioRuntime = useCallback(async () => {
        const nextRuntime = await resolveAudioRuntime();
        const previousRuntime = audioRuntime.current;

        if (previousRuntime?.websocketUrl && previousRuntime.websocketUrl !== nextRuntime.websocketUrl) {
            ws.current?.close();
            ws.current = null;
        }

        audioRuntime.current = nextRuntime;
        return nextRuntime;
    }, []);

    // ── TTS ────────────────────────────────────────────────────────────────

    const speakText = useCallback(async (text: string) => {
        if (!text.trim()) return;
        try {
            const runtime = audioRuntime.current ?? await ensureAudioRuntime();
            const hasThai = /[\u0E00-\u0E7F]/.test(text);
            const voice = hasThai ? 'th-TH-PremwadeeNeural' : 'en-US-JennyNeural';
            const res = await fetch(runtime.ttsUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice }),
            });
            if (res.ok) {
                const blob = await res.blob();
                new Audio(URL.createObjectURL(blob)).play();
            }
        } catch { }
    }, [ensureAudioRuntime]);

    // ── Transcription handler ──────────────────────────────────────────────

    const handleTranscription = useCallback((text: string) => {
        if (!text.trim()) return;

        // Check for voice confirmation
        const decision = detectVoiceDecision(text);
        if (decision && toolConfirmCb.current) {
            toolConfirmCb.current(decision === 'approve');
            return;
        }

        // If recording just stopped, send immediately
        if (pendingFlush.current) {
            pendingFlush.current = false;
            transcriptionCb.current?.(text);
            return;
        }

        // Otherwise buffer
        buf.current.push(text);
    }, []);

    // ── WebSocket ──────────────────────────────────────────────────────────

    const connect = useCallback(async () => {
        if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) return;
        if (connectPromise.current) return connectPromise.current;

        connectPromise.current = (async () => {
            setConnectionStatus('connecting');
            setConnectionMessage(DEFAULT_AUDIO_CONNECTING_MESSAGE);

            const runtime = await ensureAudioRuntime();
            const health = await fetchAudioRuntimeHealth(runtime.healthUrl);

            if (!health.reachable) {
                setIsConnected(false);
                setConnectionStatus('connecting');
                setConnectionMessage(DEFAULT_AUDIO_CONNECTING_MESSAGE);
                return;
            }

            if (health.state === 'error') {
                setIsConnected(false);
                setConnectionStatus('disconnected');
                setConnectionMessage(health.error ?? health.message ?? 'Audio engine failed to start.');
                return;
            }

            if (!health.ready) {
                setIsConnected(false);
                setConnectionStatus('connecting');
                setConnectionMessage(health.message ?? DEFAULT_AUDIO_WARMUP_MESSAGE);
                return;
            }

            const socket = new WebSocket(runtime.websocketUrl);
            ws.current = socket;

            socket.onopen = () => {
                if (ws.current !== socket) {
                    return;
                }

                setIsConnected(true);
                setConnectionStatus('connected');
                setConnectionMessage(null);
            };

            socket.onclose = () => {
                if (ws.current === socket) {
                    ws.current = null;
                }

                setIsConnected(false);
                setIsRecording(false);
                setConnectionStatus('disconnected');
                setConnectionMessage('Audio disconnected.');
            };

            socket.onerror = () => {
                setIsConnected(false);
                setConnectionStatus('disconnected');
                setConnectionMessage('Audio connection error.');
            };

            socket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        if (msg.type === 'vad') setIsSpeaking(msg.speech_detected);
                        else if (msg.type === 'transcription' && msg.text) handleTranscription(msg.text);
                    } catch { }
                }
            };
        })().finally(() => {
            connectPromise.current = null;
        });

        return connectPromise.current;
    }, [ensureAudioRuntime, handleTranscription]);

    useEffect(() => {
        void connect();
        const interval = setInterval(() => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
                void connect();
            }
        }, AUDIO_RUNTIME_POLL_MS);

        return () => {
            clearInterval(interval);
            ws.current?.close();
            ws.current = null;
            if (micStream.current) {
                micStream.current.getTracks().forEach((track) => track.stop());
                micStream.current = null;
            }
            if (worklet.current) {
                worklet.current.disconnect();
                worklet.current = null;
            }
            if (audioCtx.current) {
                void audioCtx.current.close();
                audioCtx.current = null;
            }
        };
    }, [connect]);

    // ── Recording ──────────────────────────────────────────────────────────

    const startRecording = useCallback(async () => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            await connect();
        }
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        if (micStream.current) return;

        try {
            if (audioCtx.current) { await audioCtx.current.close(); audioCtx.current = null; }

            const AudioContextImpl = window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
            if (!AudioContextImpl) return;

            audioCtx.current = new AudioContextImpl();
            const url = `/audio-processor.js?t=${Date.now()}_${Math.random()}`;
            await audioCtx.current.audioWorklet.addModule(url);
            if (audioCtx.current.state === 'suspended') await audioCtx.current.resume();

            const ctx = audioCtx.current;
            micStream.current = await navigator.mediaDevices.getUserMedia({
                audio: { channelCount: 1, sampleRate: 48000, echoCancellation: true, noiseSuppression: true },
            });

            const source = ctx.createMediaStreamSource(micStream.current);
            worklet.current = new AudioWorkletNode(ctx, 'audio-processor');
            worklet.current.port.onmessage = (e) => {
                if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(e.data.buffer);
            };
            source.connect(worklet.current);
            worklet.current.connect(ctx.destination);

            ws.current.send(JSON.stringify({ type: 'recording', active: true, sampleRate: ctx.sampleRate }));
            setIsRecording(true);
            playBeep(true);
        } catch { }
    }, [connect]);

    const stopRecording = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'recording', active: false }));
        }
        if (micStream.current) { micStream.current.getTracks().forEach(t => t.stop()); micStream.current = null; }
        if (worklet.current) { worklet.current.disconnect(); worklet.current = null; }
        setIsRecording(false);
        setIsSpeaking(false);
        playBeep(false);
        pendingFlush.current = true;
    }, []);

    const toggleRecording = useCallback(() => {
        if (isRecording) stopRecording();
        else startRecording();
    }, [isRecording, startRecording, stopRecording]);

    // ── F8 keyboard shortcut ───────────────────────────────────────────────

    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.code !== 'F8' || e.repeat) {
                return;
            }

            const target = e.target as HTMLElement | null;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
                return;
            }

            e.preventDefault();
            toggleRecording();
        };

        window.addEventListener('keydown', handleKeydown);
        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    }, [toggleRecording]);

    // ── Callback registration ──────────────────────────────────────────────

    const setSessionId = useCallback((id: string) => { sessionId.current = id; }, []);
    const onTranscription = useCallback((cb: (text: string) => void) => { transcriptionCb.current = cb; }, []);
    const onToolConfirm = useCallback((cb: (approved: boolean) => void) => { toolConfirmCb.current = cb; }, []);

    return (
        <VoiceContext.Provider value={{
            isConnected, connectionStatus, connectionMessage, isRecording, isSpeaking,
            startRecording, stopRecording, toggleRecording,
            speakText, setSessionId, onTranscription, onToolConfirm,
        }}>
            {children}
        </VoiceContext.Provider>
    );
}
