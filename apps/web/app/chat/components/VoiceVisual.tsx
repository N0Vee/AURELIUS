'use client';

import { useAudioEngine } from '@/hooks/useAudioEngine';
import { Mic, MicOff, Languages } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

const TTS_API_URL = 'http://localhost:8000/api/tts';

const VOICES = {
    th: 'th-TH-PremwadeeNeural',
    en: 'en-US-JennyNeural',
};

interface VoiceVisualProps {
    onResponse?: (text: string) => void;
    language: 'th' | 'en';
    onLanguageChange: (lang: 'th' | 'en') => void;
}

export function VoiceVisual({ onResponse, language, onLanguageChange }: VoiceVisualProps) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    // Use ref to avoid stale closure in async callbacks
    const languageRef = useRef(language);

    // Keep ref in sync with prop
    useEffect(() => {
        languageRef.current = language;
    }, [language]);

    // Speak text using TTS
    const speakText = useCallback(async (text: string) => {
        if (!text.trim()) return;

        // Auto-detect language from text content
        const hasThai = /[\u0E00-\u0E7F]/.test(text);
        const targetLang = hasThai ? 'th' : 'en';
        const voice = VOICES[targetLang];

        // console.log('[VoiceVisual] Speaking:', { text, voice, detectedLang: targetLang });

        try {
            const response = await fetch(TTS_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice }),
            });

            if (response.ok) {
                const audioBlob = await response.blob();
                const audioUrl = URL.createObjectURL(audioBlob);

                if (audioRef.current) {
                    audioRef.current.pause();
                }

                audioRef.current = new Audio(audioUrl);
                audioRef.current.play();
            }
        } catch (error) {
            console.error('TTS error:', error);
        }
    }, []); // No dependency on language - uses ref instead

    // Handle transcription - send to LLM and speak response
    const handleTranscription = useCallback(async (text: string) => {
        if (!text.trim()) return;

        try {
            // Call LLM API
            const response = await fetch('http://localhost:3001/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', content: text }]
                }),
            });

            if (response.ok && response.body) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let fullContent = '';
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n\n');
                    buffer = lines.pop() || '';

                    for (const block of lines) {
                        if (!block.trim()) continue;
                        const dataMatch = block.match(/^data: (.+)$/m);
                        if (dataMatch) {
                            try {
                                const data = JSON.parse(dataMatch[1]);
                                if (data.content) {
                                    fullContent += data.content;
                                }
                            } catch { }
                        }
                    }
                }

                if (fullContent && onResponse) {
                    onResponse(fullContent);
                }

                // Speak the response
                if (fullContent) {
                    speakText(fullContent);
                }
            }
        } catch (error) {
            console.error('LLM error:', error);
        }
    }, [speakText, onResponse]);

    const { isConnected, isRecording, isSpeaking, connect, startRecording, stopRecording } = useAudioEngine(
        'ws://localhost:8000/ws/audio',
        handleTranscription
    );

    useEffect(() => {
        connect();
    }, [connect]);

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const toggleLanguage = () => {
        onLanguageChange(language === 'th' ? 'en' : 'th');
    };

    return (
        <div className="flex flex-col items-center justify-center h-full gap-4 sm:gap-8">
            {/* Status Text */}
            <AnimatePresence mode="wait">
                {!isConnected ? (
                    <motion.p
                        key="connecting"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-[var(--text-muted)] text-sm sm:text-lg"
                    >
                        Connecting to audio engine...
                    </motion.p>
                ) : isRecording ? (
                    <motion.p
                        key="status"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={cn(
                            "text-base sm:text-xl font-medium transition-colors",
                            isSpeaking ? "text-red-400" : "text-[var(--text-secondary)]"
                        )}
                    >
                        {isSpeaking ? '🎙️ Listening...' : '💬 Speak now...'}
                    </motion.p>
                ) : (
                    <motion.p
                        key="ready"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-[var(--text-muted)] text-sm sm:text-lg"
                    >
                        Tap to start speaking
                    </motion.p>
                )}
            </AnimatePresence>

            {/* Main Voice Button */}
            <motion.button
                onClick={toggleRecording}
                disabled={!isConnected}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                    "relative flex items-center justify-center rounded-full transition-all duration-300",
                    !isConnected && "opacity-50 cursor-not-allowed",
                    isRecording
                        ? "w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-red-500 to-red-600"
                        : "w-20 h-20 sm:w-28 sm:h-28 bg-gradient-to-br from-[var(--accent)] to-[var(--accent-glow)]"
                )}
            >
                {/* Animated Rings */}
                <AnimatePresence>
                    {isRecording && (
                        <>
                            <motion.div
                                initial={{ scale: 1, opacity: 0.4 }}
                                animate={{ scale: 2.5, opacity: 0 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                                className="absolute inset-0 rounded-full bg-red-500"
                            />
                            <motion.div
                                initial={{ scale: 1, opacity: 0.3 }}
                                animate={{ scale: 2, opacity: 0 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.5 }}
                                className="absolute inset-0 rounded-full bg-red-500"
                            />
                            <motion.div
                                initial={{ scale: 1, opacity: 0.2 }}
                                animate={{ scale: 1.5, opacity: 0 }}
                                transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }}
                                className="absolute inset-0 rounded-full bg-red-500"
                            />
                        </>
                    )}
                </AnimatePresence>

                {/* Speaking pulse */}
                {isRecording && isSpeaking && (
                    <motion.div
                        animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                        transition={{ duration: 0.4, repeat: Infinity }}
                        className="absolute inset-0 rounded-full border-4 border-white"
                    />
                )}

                <motion.div
                    animate={isRecording ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 0.5, repeat: isRecording ? Infinity : 0 }}
                    className="text-white"
                >
                    {isRecording
                        ? <><MicOff size={28} className="sm:hidden" /><MicOff size={40} className="hidden sm:block" /></>
                        : <><Mic size={24} className="sm:hidden" /><Mic size={36} className="hidden sm:block" /></>
                    }
                </motion.div>
            </motion.button>

            {/* Language Toggle */}
            <button
                onClick={toggleLanguage}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-active)] transition-colors text-[var(--text-secondary)]"
            >
                <Languages size={15} className="sm:hidden" />
                <Languages size={18} className="hidden sm:block" />
                <span className="text-sm sm:text-base font-medium">{language === 'th' ? '🇹🇭 Thai (Beta)' : '🇺🇸 English'}</span>
            </button>
        </div>
    );
}
