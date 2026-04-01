'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';

const WS_URL = 'ws://localhost:8000/ws/audio';

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
    isConnected: false, isRecording: false, isSpeaking: false,
    startRecording: () => { }, stopRecording: () => { },
    toggleRecording: () => { }, speakText: () => { },
    setSessionId: () => { }, onTranscription: () => { }, onToolConfirm: () => { },
});

export function useVoice() { return useContext(VoiceContext); }

// ── Provider ──────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: ReactNode }) {
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    const ws = useRef<WebSocket | null>(null);
    const audioCtx = useRef<AudioContext | null>(null);
    const worklet = useRef<AudioWorkletNode | null>(null);
    const micStream = useRef<MediaStream | null>(null);
    const sessionId = useRef('default');
    const buf = useRef<string[]>([]);
    const pendingFlush = useRef(false);

    // External callbacks
    const transcriptionCb = useRef<((text: string) => void) | null>(null);
    const toolConfirmCb = useRef<((approved: boolean) => void) | null>(null);

    // ── TTS ────────────────────────────────────────────────────────────────

    const speakText = useCallback(async (text: string) => {
        if (!text.trim()) return;
        try {
            const hasThai = /[\u0E00-\u0E7F]/.test(text);
            const voice = hasThai ? 'th-TH-PremwadeeNeural' : 'en-US-JennyNeural';
            const res = await fetch('http://localhost:8000/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice }),
            });
            if (res.ok) {
                const blob = await res.blob();
                new Audio(URL.createObjectURL(blob)).play();
            }
        } catch { }
    }, []);

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

    const connect = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;
        ws.current = new WebSocket(WS_URL);
        ws.current.onopen = () => setIsConnected(true);
        ws.current.onclose = () => { setIsConnected(false); setIsRecording(false); };
        ws.current.onerror = () => { };
        ws.current.onmessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'vad') setIsSpeaking(msg.speech_detected);
                    else if (msg.type === 'transcription' && msg.text) handleTranscription(msg.text);
                } catch { }
            }
        };
    }, [handleTranscription]);

    useEffect(() => {
        connect();
        const interval = setInterval(() => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) connect();
        }, 5000);
        return () => clearInterval(interval);
    }, [connect]);

    // ── Recording ──────────────────────────────────────────────────────────

    const startRecording = useCallback(async () => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        if (micStream.current) return;

        try {
            if (audioCtx.current) { await audioCtx.current.close(); audioCtx.current = null; }

            audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
    }, []);

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

    // ── F8 global shortcut ─────────────────────────────────────────────────

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        const setup = async () => {
            try {
                const { listen } = await import('@tauri-apps/api/event');
                unlisten = await listen('voice-toggle', () => toggleRecording());
            } catch {
                const handler = (e: KeyboardEvent) => {
                    if (e.code === 'F8' && !e.repeat) {
                        const tag = (e.target as HTMLElement).tagName;
                        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;
                        e.preventDefault();
                        toggleRecording();
                    }
                };
                window.addEventListener('keydown', handler);
                return () => window.removeEventListener('keydown', handler);
            }
        };
        setup();
        return () => { if (unlisten) unlisten(); };
    }, [toggleRecording]);

    // ── Callback registration ──────────────────────────────────────────────

    const setSessionId = useCallback((id: string) => { sessionId.current = id; }, []);
    const onTranscription = useCallback((cb: (text: string) => void) => { transcriptionCb.current = cb; }, []);
    const onToolConfirm = useCallback((cb: (approved: boolean) => void) => { toolConfirmCb.current = cb; }, []);

    return (
        <VoiceContext.Provider value={{
            isConnected, isRecording, isSpeaking,
            startRecording, stopRecording, toggleRecording,
            speakText, setSessionId, onTranscription, onToolConfirm,
        }}>
            {children}
        </VoiceContext.Provider>
    );
}
