'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';

const WS_URL = 'ws://localhost:8000/ws/audio';
const API_BASES = ['http://127.0.0.1:4243', 'http://localhost:4243'];

// ── Types ─────────────────────────────────────────────────────────────────────

interface VoiceMessage {
    id: string;
    role: 'user' | 'assistant' | 'tool_auto' | 'tool_confirm';
    content: string;
    toolName?: string;
    displayName?: string;
    permissionLevel?: 'SAFE' | 'SENSITIVE' | 'DANGEROUS';
    args?: Record<string, unknown>;
    pendingId?: string;
    status?: 'pending' | 'approved' | 'rejected';
    timestamp: number;
}

interface ToolConfirmData {
    id: string;
    toolName: string;
    displayName: string;
    description: string;
    permissionLevel: 'SAFE' | 'SENSITIVE' | 'DANGEROUS';
    args: Record<string, unknown>;
}

// ── Voice confirmation keywords ───────────────────────────────────────────────

const APPROVE_KEYWORDS = [
    'yes', 'confirm', 'approve', 'go ahead', 'do it', 'sure', 'yeah', 'yep',
    'okay', 'ok', 'proceed', 'continue',
    'ใช่', 'ตกลง', 'ทำเลย', 'อนุมัติ', 'ได้เลย',
];
const REJECT_KEYWORDS = [
    'no', 'reject', 'cancel', "don't", 'stop', 'nope', 'skip', 'deny',
    'ไม่', 'ยกเลิก', 'ไม่ทำ', 'ปฏิเสธ',
];

function detectVoiceDecision(text: string): 'approve' | 'reject' | null {
    const lower = text.toLowerCase().trim();
    for (const kw of REJECT_KEYWORDS) {
        if (lower === kw || lower.startsWith(kw + ' ')) return 'reject';
    }
    for (const kw of APPROVE_KEYWORDS) {
        if (lower === kw || lower.startsWith(kw + ' ')) return 'approve';
    }
    return null;
}

// ── Toggle sounds ─────────────────────────────────────────────────────────────

function playToggleOn() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        osc.onended = () => ctx.close();
    } catch { }
}

function playToggleOff() {
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(1320, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
        osc.onended = () => ctx.close();
    } catch { }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface VoiceContextType {
    isConnected: boolean;
    isRecording: boolean;
    isSpeaking: boolean;
    isStreaming: boolean;
    messages: VoiceMessage[];
    pendingToolConfirm: ToolConfirmData | null;
    startRecording: () => void;
    stopRecording: () => void;
    toggleRecording: () => void;
    setSessionId: (id: string) => void;
}

const VoiceContext = createContext<VoiceContextType>({
    isConnected: false,
    isRecording: false,
    isSpeaking: false,
    isStreaming: false,
    messages: [],
    pendingToolConfirm: null,
    startRecording: () => { },
    stopRecording: () => { },
    toggleRecording: () => { },
    setSessionId: () => { },
});

export function useVoice() {
    return useContext(VoiceContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function VoiceProvider({ children }: { children: ReactNode }) {
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [messages, setMessages] = useState<VoiceMessage[]>([]);
    const [pendingToolConfirm, setPendingToolConfirm] = useState<ToolConfirmData | null>(null);

    const ws = useRef<WebSocket | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const workletNode = useRef<AudioWorkletNode | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const sessionId = useRef<string>('default');
    const pendingConfirmRef = useRef<ToolConfirmData | null>(null);
    const transcriptionBuffer = useRef<string[]>([]);
    const isPendingFlush = useRef(false);

    // Keep ref in sync
    useEffect(() => {
        pendingConfirmRef.current = pendingToolConfirm;
    }, [pendingToolConfirm]);

    // ── Audio context ──────────────────────────────────────────────────────

    const initAudioContext = async () => {
        if (!audioContext.current) {
            try {
                audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                const sampleRate = audioContext.current.sampleRate;
                const state = audioContext.current.state;
                const isTauri = (window as any).__TAURI__ !== undefined;
                
                console.log(`[VoiceProvider] AudioContext sampleRate: ${sampleRate}Hz`);
                console.log(`[VoiceProvider] AudioContext state: ${state}`);
                console.log(`[VoiceProvider] Running in Tauri: ${isTauri}`);
                console.log(`[VoiceProvider] UserAgent: ${navigator.userAgent.substring(0, 100)}`);
                
                // Force reload audio worklet with unique cache buster
                const workletUrl = `/audio-processor.js?t=${Date.now()}_${Math.random()}`;
                console.log(`[VoiceProvider] Loading worklet from: ${workletUrl}`);
                
                await audioContext.current.audioWorklet.addModule(workletUrl);
                console.log('[VoiceProvider] AudioWorklet loaded successfully');
            } catch (err) {
                console.error('[VoiceProvider] Failed to init AudioContext:', err);
            }
        }
        if (audioContext.current && audioContext.current.state === 'suspended') {
            await audioContext.current.resume();
        }
    };

    // ── TTS ────────────────────────────────────────────────────────────────

    const speakText = useCallback(async (text: string) => {
        if (!text.trim()) return;
        try {
            const hasThai = /[\u0E00-\u0E7F]/.test(text);
            const voice = hasThai ? 'th-TH-PremwadeeNeural' : 'en-US-JennyNeural';
            const response = await fetch('http://localhost:8000/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice }),
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.play();
            }
        } catch (e) {
            console.error('[VoiceProvider] TTS error:', e);
        }
    }, []);

    // ── LLM stream runner ──────────────────────────────────────────────────

    const runLLM = useCallback(async (userText: string) => {
        // Build history from current messages (only user/assistant)
        const history = messages
            .filter((m): m is VoiceMessage & { role: 'user' | 'assistant' } =>
                m.role === 'user' || m.role === 'assistant')
            .map(m => ({ role: m.role, content: m.content }));

        // Add new user message
        history.push({ role: 'user', content: userText });

        // Add to messages
        const userMsg: VoiceMessage = {
            id: crypto.randomUUID(),
            role: 'user',
            content: userText,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMsg]);

        // Create assistant placeholder
        const assistantMsgId = crypto.randomUUID();
        const assistantMsg: VoiceMessage = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, assistantMsg]);
        setIsStreaming(true);

        let fullContent = '';

        for (const apiBase of API_BASES) {
            try {
                const response = await fetch(`${apiBase}/chat/stream`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: history,
                        session_id: sessionId.current,
                        voice_mode: true,
                    }),
                });

                if (!response.ok || !response.body) continue;

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let sseBuffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    sseBuffer += decoder.decode(value, { stream: true });
                    const blocks = sseBuffer.split('\n\n');
                    sseBuffer = blocks.pop() || '';

                    for (const block of blocks) {
                        const lines = block.split('\n');
                        let eventType = '';
                        let dataStr = '';

                        for (const line of lines) {
                            if (line.startsWith('event: ')) eventType = line.slice(7).trim();
                            if (line.startsWith('data: ')) dataStr = line.slice(6).trim();
                        }

                        if (!eventType || !dataStr) continue;

                        try {
                            const data = JSON.parse(dataStr);

                            if (eventType === 'chunk') {
                                fullContent += data.content || '';
                                setMessages(prev => prev.map(m =>
                                    m.id === assistantMsgId
                                        ? { ...m, content: fullContent }
                                        : m
                                ));
                            }
                            else if (eventType === 'tool_auto') {
                                const toolMsg: VoiceMessage = {
                                    id: crypto.randomUUID(),
                                    role: 'tool_auto',
                                    content: data.result || '',
                                    toolName: data.toolName,
                                    displayName: data.displayName || data.toolName,
                                    timestamp: Date.now(),
                                };
                                setMessages(prev => [...prev, toolMsg]);
                            }
                            else if (eventType === 'tool_confirm') {
                                const confirmData: ToolConfirmData = {
                                    id: data.id,
                                    toolName: data.toolName,
                                    displayName: data.displayName || data.toolName,
                                    description: data.description || '',
                                    permissionLevel: data.permissionLevel || 'DANGEROUS',
                                    args: data.args || {},
                                };
                                const confirmMsg: VoiceMessage = {
                                    id: crypto.randomUUID(),
                                    role: 'tool_confirm',
                                    content: data.description || data.displayName || data.toolName,
                                    toolName: data.toolName,
                                    displayName: data.displayName || data.toolName,
                                    permissionLevel: data.permissionLevel || 'DANGEROUS',
                                    args: data.args || {},
                                    pendingId: data.id,
                                    status: 'pending',
                                    timestamp: Date.now(),
                                };
                                setMessages(prev => [...prev, confirmMsg]);
                                setPendingToolConfirm(confirmData);

                                // Speak the confirmation request
                                speakText(`${data.displayName || data.toolName}. Should I proceed?`);
                            }
                            else if (eventType === 'tool_executed') {
                                setMessages(prev => prev.map(m =>
                                    m.pendingId === data.pendingId
                                        ? { ...m, status: 'approved' as const }
                                        : m
                                ));
                                setPendingToolConfirm(null);
                            }
                            else if (eventType === 'tool_rejected') {
                                setMessages(prev => prev.map(m =>
                                    m.pendingId === data.pendingId
                                        ? { ...m, status: 'rejected' as const }
                                        : m
                                ));
                                setPendingToolConfirm(null);
                            }
                            else if (eventType === 'done') {
                                // done
                            }
                            else if (eventType === 'error') {
                                console.error('[VoiceProvider] LLM error:', data.error);
                            }
                        } catch { }
                    }
                }

                // Stream complete — speak the response
                setIsStreaming(false);

                // Strip markdown formatting for TTS
                const ttsText = fullContent
                    .replace(/```[\s\S]*?```/g, 'Code block. Check the app for details.')
                    .replace(/`([^`]+)`/g, '$1')
                    .replace(/\*\*([^*]+)\*\*/g, '$1')
                    .replace(/\*([^*]+)\*/g, '$1')
                    .replace(/#{1,6}\s/g, '')
                    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                    .replace(/^\s*[-*]\s/gm, '')
                    .trim();

                if (ttsText) {
                    speakText(ttsText);
                }

                return; // Success — don't try next base

            } catch (e) {
                console.error(`[VoiceProvider] ${apiBase} failed:`, e);
                continue;
            }
        }

        // All bases failed
        setIsStreaming(false);
        setMessages(prev => prev.map(m =>
            m.id === assistantMsgId
                ? { ...m, content: 'Failed to connect to the backend.' }
                : m
        ));
    }, [messages, speakText]);

    // ── Tool confirmation ──────────────────────────────────────────────────

    const confirmTool = useCallback(async (approved: boolean) => {
        const confirm = pendingConfirmRef.current;
        if (!confirm) return;

        const endpoint = approved ? 'approve' : 'reject';
        setPendingToolConfirm(null);

        // Update message status optimistically
        setMessages(prev => prev.map(m =>
            m.pendingId === confirm.id
                ? { ...m, status: approved ? 'approved' as const : 'rejected' as const }
                : m
        ));

        // Call API
        for (const apiBase of API_BASES) {
            try {
                const res = await fetch(`${apiBase}/api/tools/${confirm.id}/${endpoint}`, { method: 'POST' });
                if (res.ok) return;
            } catch {
                continue;
            }
        }
    }, []);

    // ── Transcription handler ──────────────────────────────────────────────

    const handleTranscription = useCallback((text: string) => {
        if (!text.trim()) return;

        // If there's a pending tool confirm, check if this is a voice decision
        if (pendingConfirmRef.current) {
            const decision = detectVoiceDecision(text);
            if (decision === 'approve') {
                console.log('[VoiceProvider] Voice approved tool call');
                confirmTool(true);
                return;
            }
            if (decision === 'reject') {
                console.log('[VoiceProvider] Voice rejected tool call');
                confirmTool(false);
                return;
            }
        }

        // Buffer transcription — will be sent when recording stops
        transcriptionBuffer.current.push(text);
        console.log('[VoiceProvider] Buffered transcription:', text);
    }, [confirmTool]);

    // Flush buffer and send to LLM
    const flushTranscriptionBuffer = useCallback(() => {
        if (transcriptionBuffer.current.length === 0) return;
        const fullText = transcriptionBuffer.current.join(' ');
        transcriptionBuffer.current = [];
        console.log('[VoiceProvider] Flushing transcription:', fullText);
        runLLM(fullText);
    }, [runLLM]);

    // Flush on transcription arrival when not recording
    const flushIfReady = useCallback(() => {
        if (!isRecording && transcriptionBuffer.current.length > 0) {
            flushTranscriptionBuffer();
        }
    }, [isRecording, flushTranscriptionBuffer]);

    // When transcription arrives while not recording, flush immediately
    const handleTranscriptionWithFlush = useCallback((text: string) => {
        if (!text.trim()) return;

        // If there's a pending tool confirm, check if this is a voice decision
        if (pendingConfirmRef.current) {
            const decision = detectVoiceDecision(text);
            if (decision === 'approve') {
                console.log('[VoiceProvider] Voice approved tool call');
                confirmTool(true);
                return;
            }
            if (decision === 'reject') {
                console.log('[VoiceProvider] Voice rejected tool call');
                confirmTool(false);
                return;
            }
        }

        // If we're waiting for a flush (recording just stopped), send immediately
        if (isPendingFlush.current) {
            isPendingFlush.current = false;
            console.log('[VoiceProvider] Flushing transcription:', text);
            runLLM(text);
            return;
        }

        // Buffer transcription — will be sent when recording stops
        transcriptionBuffer.current.push(text);
        console.log('[VoiceProvider] Buffered transcription:', text);
    }, [confirmTool, runLLM]);

    // ── WebSocket connection ───────────────────────────────────────────────

    const connect = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;
        console.log('[VoiceProvider] Connecting to', WS_URL);
        ws.current = new WebSocket(WS_URL);

        ws.current.onopen = () => {
            console.log('[VoiceProvider] Connected');
            setIsConnected(true);
        };

        ws.current.onclose = (event) => {
            console.log('[VoiceProvider] Disconnected', event.code);
            setIsConnected(false);
            setIsRecording(false);
        };

        ws.current.onerror = (event) => {
            console.error('[VoiceProvider] WS Error:', event);
        };

        ws.current.onmessage = async (event) => {
            if (typeof event.data === 'string') {
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'vad') {
                        setIsSpeaking(msg.speech_detected);
                    } else if (msg.type === 'transcription' && msg.text) {
                        console.log('[VoiceProvider] Transcription:', msg.text);
                        handleTranscriptionWithFlush(msg.text);
                    }
                } catch { }
            }
        };
    }, [handleTranscriptionWithFlush]);

    // Auto-connect on mount
    useEffect(() => {
        connect();
        const interval = setInterval(() => {
            if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
                connect();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [connect]);

    // ── Recording control ──────────────────────────────────────────────────

    const startRecording = useCallback(async () => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
        if (stream.current) return;

        try {
            // Always recreate AudioContext for Tauri compatibility
            if (audioContext.current) {
                console.log('[VoiceProvider] Closing existing AudioContext');
                await audioContext.current.close();
                audioContext.current = null;
            }
            
            await initAudioContext();
            const ctx = audioContext.current as AudioContext | null;
            if (!ctx) {
                console.error('[VoiceProvider] AudioContext not initialized');
                return;
            }

            console.log('[VoiceProvider] Requesting microphone access...');
            stream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 48000,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            console.log('[VoiceProvider] Microphone access granted');

            const source = ctx.createMediaStreamSource(stream.current);
            workletNode.current = new AudioWorkletNode(ctx, 'audio-processor');
            
            workletNode.current.port.onmessage = (event) => {
                if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(event.data.buffer);
                }
            };
            
            source.connect(workletNode.current);
            workletNode.current.connect(ctx.destination);
            
            const sampleRate = ctx.sampleRate;
            ws.current.send(JSON.stringify({ type: 'recording', active: true, sampleRate }));
            console.log(`[VoiceProvider] Recording started, sampleRate: ${sampleRate}Hz`);
            setIsRecording(true);
            playToggleOn();
        } catch (err) {
            console.error('[VoiceProvider] Error starting recording:', err);
        }
    }, []);

    const stopRecording = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'recording', active: false }));
        }
        if (stream.current) {
            stream.current.getTracks().forEach(track => track.stop());
            stream.current = null;
        }
        if (workletNode.current) {
            workletNode.current.disconnect();
            workletNode.current = null;
        }
        setIsRecording(false);
        setIsSpeaking(false);
        playToggleOff();

        // Set a pending flush flag — handleTranscription will check this
        isPendingFlush.current = true;
    }, []);

    // When transcription arrives while not recording, flush immediately
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
                unlisten = await listen('voice-toggle', () => {
                    console.log('[VoiceProvider] F8 pressed');
                    toggleRecording();
                });
            } catch {
                const handleKey = (e: KeyboardEvent) => {
                    if (e.code === 'F8' && !e.repeat) {
                        const target = e.target as HTMLElement;
                        const tag = target.tagName;
                        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
                        e.preventDefault();
                        toggleRecording();
                    }
                };
                window.addEventListener('keydown', handleKey);
                return () => window.removeEventListener('keydown', handleKey);
            }
        };
        setup();
        return () => { if (unlisten) unlisten(); };
    }, [toggleRecording]);

    // ── Click-based tool confirmation ──────────────────────────────────────

    useEffect(() => {
        const handler = (e: Event) => {
            const approved = (e as CustomEvent).detail?.approved;
            confirmTool(approved);
        };
        window.addEventListener('voice-tool-confirm', handler);
        return () => window.removeEventListener('voice-tool-confirm', handler);
    }, [confirmTool]);

    // ── Session ID setter ─────────────────────────────────────────────────

    const setSessionId = useCallback((id: string) => {
        sessionId.current = id;
    }, []);

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <VoiceContext.Provider value={{
            isConnected, isRecording, isSpeaking, isStreaming,
            messages, pendingToolConfirm,
            startRecording, stopRecording, toggleRecording, setSessionId,
        }}>
            {children}
        </VoiceContext.Provider>
    );
}
