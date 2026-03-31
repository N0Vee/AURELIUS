import { useState, useRef, useCallback, useEffect } from 'react';

// Configuration
const SAMPLE_RATE = 16000; // Target sample rate for ASR
const BUFFER_SIZE = 4096;

interface TranscriptionEvent {
    type: 'transcription';
    text: string;
    is_final: boolean;
}

interface VADEvent {
    type: 'vad';
    speech_detected: boolean;
    confidence: number;
}

type AudioEngineMessage = TranscriptionEvent | VADEvent;

export function useAudioEngine(url: string, onTranscription?: (text: string) => void) {
    const [isConnected, setIsConnected] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);

    // Refs
    const ws = useRef<WebSocket | null>(null);
    const audioContext = useRef<AudioContext | null>(null);
    const workletNode = useRef<AudioWorkletNode | null>(null);
    const stream = useRef<MediaStream | null>(null);
    const audioQueue = useRef<Float32Array[]>([]);
    const isPlaying = useRef(false);
    const nextStartTime = useRef(0);

    // Initialize Audio Context on user interaction (first start)
    const initAudioContext = async () => {
        if (!audioContext.current) {
            // Don't force sample rate - let it use the default (usually 48kHz)
            // We'll resample to 16kHz before sending to the server
            audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            // Add cache-busting to force reload of updated processor
            await audioContext.current.audioWorklet.addModule('/audio-processor.js?v=' + Date.now());
        }
        if (audioContext.current.state === 'suspended') {
            await audioContext.current.resume();
        }
    };

    const connect = useCallback(() => {
        if (ws.current?.readyState === WebSocket.OPEN) return;

        console.log('[AudioEngine] Connecting to', url);
        ws.current = new WebSocket(url);

        ws.current.onopen = () => {
            console.log('[AudioEngine] Connected');
            setIsConnected(true);
        };

        ws.current.onclose = (event) => {
            console.log('[AudioEngine] Disconnected', event.code, event.reason);
            setIsConnected(false);
            setIsRecording(false);
        };

        ws.current.onerror = (event) => {
            console.error('[AudioEngine] WebSocket error:', event);
        };

        ws.current.onmessage = async (event) => {
            // Handle JSON messages from server
            if (typeof event.data === 'string') {
                try {
                    const message: AudioEngineMessage = JSON.parse(event.data);

                    if (message.type === 'transcription') {
                        console.log('Transcription:', message.text);
                        if (onTranscription && message.text) {
                            onTranscription(message.text);
                        }
                    } else if (message.type === 'vad') {
                        setIsSpeaking(message.speech_detected);
                    }
                } catch (e) {
                    console.error('Failed to parse message:', e);
                }
            }
            // Handle binary audio data (for future TTS responses)
            else if (event.data instanceof Blob) {
                const arrayBuffer = await event.data.arrayBuffer();
                const audioData = new Float32Array(arrayBuffer);
                queueAudio(audioData);
            }
        };
    }, [url, onTranscription]);

    const disconnect = useCallback(() => {
        ws.current?.close();
        ws.current = null;
    }, []);

    const startRecording = useCallback(async () => {
        if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;

        try {
            await initAudioContext();

            stream.current = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: SAMPLE_RATE,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            if (!audioContext.current) return;

            const source = audioContext.current.createMediaStreamSource(stream.current);
            workletNode.current = new AudioWorkletNode(audioContext.current, 'audio-processor');

            // Handle data from worklet
            workletNode.current.port.onmessage = (event) => {
                const inputData = event.data; // Float32Array

                if (ws.current?.readyState === WebSocket.OPEN) {
                    ws.current.send(inputData.buffer);
                }
            };

            source.connect(workletNode.current);
            workletNode.current.connect(audioContext.current.destination);

            // Tell backend recording started
            ws.current.send(JSON.stringify({ type: 'recording', active: true }));

            setIsRecording(true);

        } catch (err) {
            console.error('Error starting recording:', err);
        }
    }, []);

    const stopRecording = useCallback(() => {
        // Tell backend recording stopped
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
    }, []);

    // Simple audio playback queue
    const queueAudio = (audioData: Float32Array) => {
        audioQueue.current.push(audioData);
        if (!isPlaying.current) {
            playNextChunk();
        }
    };

    const playNextChunk = () => {
        if (audioQueue.current.length === 0 || !audioContext.current) {
            isPlaying.current = false;
            return;
        }

        isPlaying.current = true;
        const chunk = audioQueue.current.shift()!;

        const buffer = audioContext.current.createBuffer(1, chunk.length, SAMPLE_RATE);
        buffer.getChannelData(0).set(chunk);

        const source = audioContext.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.current.destination);

        const currentTime = audioContext.current.currentTime;
        // Schedule next chunk slightly after previous to avoid gaps
        const startTime = Math.max(currentTime, nextStartTime.current);

        source.start(startTime);
        nextStartTime.current = startTime + buffer.duration;

        source.onended = () => {
            playNextChunk();
        };
    };

    return {
        isConnected,
        isRecording,
        isSpeaking,
        connect,
        disconnect,
        startRecording,
        stopRecording
    };
}
