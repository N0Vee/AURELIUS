'use client';

import { useAudioEngine } from '@/hooks/useAudioEngine';
import { Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VoiceModeProps {
    onTranscription?: (text: string) => void;
    disabled?: boolean;
    language: 'th' | 'en';
    onLanguageChange: (lang: 'th' | 'en') => void;
}

export function VoiceMode({ onTranscription, disabled, language, onLanguageChange }: VoiceModeProps) {
    const { isConnected, isRecording, isSpeaking, connect, startRecording, stopRecording } = useAudioEngine(
        'ws://localhost:8000/ws/audio',
        onTranscription
    );

    useEffect(() => {
        connect();
    }, [connect]);

    const toggleRecording = () => {
        if (disabled || !isConnected) return;
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
        <div className="flex items-center gap-1">
            {/* Language Toggle */}
            <button
                onClick={toggleLanguage}
                className="flex items-center justify-center w-8 h-8 rounded-full text-xs font-medium transition-colors hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                title={`Switch to ${language === 'th' ? 'English' : 'Thai'}`}
            >
                {language === 'th' ? '🇹🇭' : '🇺🇸'}
            </button>

            {/* Mic Button */}
            <motion.button
                onClick={toggleRecording}
                disabled={disabled || !isConnected}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                    "relative flex items-center justify-center w-9 h-9 rounded-full transition-all duration-200",
                    !isConnected && "opacity-40 cursor-not-allowed",
                    disabled && "opacity-50 cursor-not-allowed",
                    isRecording
                        ? "bg-red-500 text-white"
                        : "bg-transparent hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
                title={!isConnected ? "Connecting..." : isRecording ? "Stop recording" : "Start voice input"}
            >
                {/* Pulse animation when recording */}
                <AnimatePresence>
                    {isRecording && (
                        <motion.div
                            initial={{ scale: 1, opacity: 0.5 }}
                            animate={{ scale: 1.8, opacity: 0 }}
                            transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                            className="absolute inset-0 rounded-full bg-red-500"
                        />
                    )}
                </AnimatePresence>

                {/* Speaking indicator */}
                {isRecording && isSpeaking && (
                    <motion.div
                        animate={{ scale: [1, 1.2, 1] }}
                        transition={{ duration: 0.3, repeat: Infinity }}
                        className="absolute inset-0 rounded-full border-2 border-white"
                    />
                )}

                {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
            </motion.button>
        </div>
    );
}
