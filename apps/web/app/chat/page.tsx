'use client';

import { useState, FormEvent, useRef, useEffect, useCallback } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSessions } from '@/hooks/useChatSessions';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useTauriDrag } from '@/hooks/useTauriDrag';
import { ChatWindow } from './components/ChatWindow';
import { SessionSidebar } from './components/SessionSidebar';
import { VoiceVisual } from './components/VoiceVisual';
import { Button } from '@/components/ui';
import { Send, Square, Trash2, MessageSquare, Mic, Minus, Monitor, ClipboardPaste, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useIsDesktop } from '@/components/layout/DesktopContext';
import { useVoice } from '@/components/VoiceProvider';
import Image from 'next/image';

type Mode = 'chat' | 'voice';
// ── Overlay title-bar (Tauri only) ────────────────────────────────────────────
function OverlayTitleBar({
    mode,
    onModeChange,
    onHide,
}: {
    mode: Mode;
    onModeChange: (m: Mode) => void;
    onHide: () => void;
}) {
    const onDrag = useTauriDrag();

    return (
        <div
            data-tauri-drag-region
            onMouseDown={onDrag}
            className="flex items-center justify-between px-3 py-2 border-b border-[var(--overlay-border)] bg-[var(--overlay-bg)] select-none cursor-grab shrink-0"
        >
            {/* Brand — draggable */}
            <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
                <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded border border-[var(--border)] bg-black/60 shadow-[0_0_10px_var(--accent-glow)]">
                    <Image
                        src="/images/aurelius-icon.png"
                        alt="Aurelius"
                        fill
                        className="object-contain p-0.5"
                        sizes="24px"
                        priority
                    />
                </div>
                <span className="text-[11px] font-bold tracking-[0.18em] text-[var(--text-primary)]">
                    AURELIUS
                </span>
            </div>

            {/* Mode pill + hide — not draggable */}
            <div className="flex items-center gap-1.5 pointer-events-auto">
                {/* Chat / Voice toggle */}
                <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-0.5">
                    <button
                        onClick={() => onModeChange('chat')}
                        className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
                            mode === 'chat'
                                ? 'bg-[var(--accent)] text-white shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                        )}
                    >
                        <MessageSquare size={11} />
                        Chat
                    </button>
                    <button
                        onClick={() => onModeChange('voice')}
                        className={cn(
                            'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all',
                            mode === 'voice'
                                ? 'bg-[var(--accent)] text-white shadow-sm'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                        )}
                    >
                        <Mic size={11} />
                        Voice
                    </button>
                </div>

                {/* Hide (minimise to tray) */}
                <button
                    onClick={onHide}
                    title="Hide overlay (Alt+Space to bring back)"
                    className="flex items-center justify-center h-6 w-6 rounded-full text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-all"
                >
                    <Minus size={13} />
                </button>
            </div>
        </div>
    );
}

// ── Web title-bar ─────────────────────────────────────────────────────────────
function WebTitleBar({
    mode,
    onClear,
    canClear,
}: {
    mode: Mode;
    onClear: () => void;
    canClear: boolean;
}) {
    return (
        <>
            {/* Compact brand row for small screens (no sidebar) */}
            <div className="flex sm:hidden items-center gap-2.5 px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-black/60 shadow-[0_0_12px_var(--accent-glow)]">
                    <Image
                        src="/images/aurelius-icon.png"
                        alt="Aurelius"
                        fill
                        className="object-contain p-0.5"
                        sizes="28px"
                        priority
                    />
                </div>
                <span className="text-xs font-semibold tracking-[0.15em] text-[var(--text-primary)]">
                    AURELIUS
                </span>
            </div>

            <header className="flex items-center justify-between px-3 py-2 sm:px-6 sm:py-4 border-b border-[var(--border)] shrink-0">
                <h1 className="text-sm sm:text-lg font-semibold text-[var(--text-primary)]">
                    {mode === 'chat' ? 'Chat Mode' : 'Voice Mode'}
                </h1>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClear}
                    disabled={!canClear}
                    className="gap-2"
                >
                    <Trash2 size={16} />
                    Clear
                </Button>
            </header>
        </>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ChatPage() {
    const isDesktop = useIsDesktop();
    const [mode, setMode] = useState<Mode>('chat');
    const [input, setInput] = useState('');
    const [language, setLanguage] = useState<'th' | 'en'>('th');

    // ── Session management ─────────────────────────────────────────────────
    const {
        sessions,
        activeSessionId,
        setActiveSessionId,
        createSession,
        deleteSession,
        renameSession,
    } = useChatSessions();

    const activeSession = sessions.find((s) => s.id === activeSessionId);

    // Sync voice mode session with chat session
    const { setSessionId: setVoiceSessionId } = useVoice();
    useEffect(() => {
        if (activeSessionId) {
            setVoiceSessionId(activeSessionId);
        }
    }, [activeSessionId, setVoiceSessionId]);

    const {
        messages,
        isLoading,
        sendMessage,
        retryLastMessage,
        stopGeneration,
        clearMessages,
        approveToolCall,
        rejectToolCall,
    } = useChat({
        sessionId:    activeSessionId,
        sessionTitle: activeSession?.title,
    });
    const { pendingImage, captureScreen, pasteFromClipboard, clearPendingImage } = useScreenCapture();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Hide overlay window (Tauri only) ──────────────────────────────────────
    const hideWindow = useCallback(async () => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().hide();
    }, []);

    // ── Auto-resize textarea ──────────────────────────────────────────────────
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
        }
    }, [input]);

    const handleSubmit = (e: FormEvent | React.KeyboardEvent) => {
        e.preventDefault();
        if ((input.trim() || pendingImage) && !isLoading) {
            const text = input.trim() || (pendingImage ? 'What do you see in this screenshot?' : '');
            const images = pendingImage ? [pendingImage] : undefined;
            sendMessage(text, images);
            setInput('');
            clearPendingImage();
            if (textareaRef.current) {
                textareaRef.current.style.height = 'auto';
            }
        }
    };

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                // Use the async clipboard API which the hook already handles
                pasteFromClipboard();
                return;
            }
        }
    }, [pasteFromClipboard]);

    // ── Overlay layout measurements ───────────────────────────────────────────
    // In overlay mode the title bar is ~40px, input+toggle ~110px total
    const scrollPb = isDesktop ? 'pb-36' : 'pb-40 sm:pb-56';

    return (
        <div
            className={cn(
                'flex h-screen',
                isDesktop && 'rounded-2xl overflow-hidden border border-[var(--overlay-border)] shadow-2xl bg-[var(--overlay-bg)]',
            )}
        >
            {/* ── Session sidebar (web only) ──────────────────────────────── */}
            {!isDesktop && (
                <SessionSidebar
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelect={setActiveSessionId}
                    onCreate={createSession}
                    onDelete={deleteSession}
                    onRename={renameSession}
                    className="hidden sm:flex"
                />
            )}

            {/* ── Chat column ────────────────────────────────────────────── */}
            <div className="flex flex-col flex-1 min-w-0 h-screen">

            {/* ── Title bar ──────────────────────────────────────────────── */}
            {isDesktop ? (
                <OverlayTitleBar
                    mode={mode}
                    onModeChange={setMode}
                    onHide={hideWindow}
                />
            ) : (
                <WebTitleBar
                    mode={mode}
                    onClear={clearMessages}
                    canClear={messages.length > 0}
                />
            )}

            {/* ── Main content ───────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {mode === 'chat' ? (
                    <motion.div
                        key="chat"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className={cn('flex-1 min-h-0 overflow-y-auto', scrollPb)}
                    >
                        <ChatWindow
                            messages={messages}
                            onApproveToolCall={approveToolCall}
                            onRejectToolCall={rejectToolCall}
                            onRetry={retryLastMessage}
                        />
                    </motion.div>
                ) : (
                    <motion.div
                        key="voice"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                        className="flex-1 min-h-0"
                    >
                        <VoiceVisual language={language} onLanguageChange={setLanguage} />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Floating input (chat mode) ──────────────────────────────── */}
            <AnimatePresence>
                {mode === 'chat' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className={cn(
                            'fixed right-0 px-3 pointer-events-none',
                            isDesktop
                                ? 'bottom-14 left-0'
                                : 'bottom-20 sm:bottom-24 left-0 sm:left-[29rem] sm:px-6',
                        )}
                    >

                        <div
                            className={cn(
                                'mx-auto pointer-events-auto',
                                isDesktop ? 'max-w-full' : 'max-w-full sm:max-w-3xl',
                            )}
                        >
                            <form
                                onSubmit={handleSubmit}
                                className={cn(
                                    'rounded-2xl p-3 sm:p-4 shadow-2xl',
                                    isDesktop
                                        ? 'bg-[var(--overlay-bg)] border border-[var(--overlay-border)] backdrop-blur-xl'
                                        : 'glass-strong',
                                )}
                            >
                                {/* ── Image preview ────────────────────────── */}
                                {pendingImage && (
                                    <div className="relative mb-2 inline-block">
                                        <Image
                                            src={pendingImage}
                                            alt="Captured screenshot"
                                            width={400}
                                            height={128}
                                            unoptimized
                                            className="max-h-32 w-auto rounded-lg border border-[var(--border)] object-contain"
                                        />
                                        <button
                                            type="button"
                                            onClick={clearPendingImage}
                                            className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--dangerous)] text-white shadow-md hover:brightness-110 transition"
                                        >
                                            <X size={11} />
                                        </button>
                                    </div>
                                )}

                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onPaste={handlePaste}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                    placeholder={pendingImage ? 'Ask about this screenshot...' : 'Ask Aurelius anything...'}
                                    disabled={isLoading}
                                    rows={1}
                                    className="w-full bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] resize-none focus:outline-none text-sm sm:text-base leading-relaxed"
                                />
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                                    <div className="flex items-center gap-1">
                                        {/* Screen capture */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={captureScreen}
                                            disabled={isLoading}
                                            title="Capture screen"
                                            className="text-[var(--text-muted)] hover:text-[var(--accent)]"
                                        >
                                            <Monitor size={14} />
                                        </Button>
                                        {/* Paste from clipboard */}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={pasteFromClipboard}
                                            disabled={isLoading}
                                            title="Paste image from clipboard"
                                            className="text-[var(--text-muted)] hover:text-[var(--accent)]"
                                        >
                                            <ClipboardPaste size={14} />
                                        </Button>
                                    </div>
                                    <div className="flex items-center gap-2 ml-auto">
                                        {/* Clear in overlay mode lives here */}
                                        {isDesktop && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={clearMessages}
                                                disabled={messages.length === 0}
                                                className="gap-1 text-[var(--text-muted)]"
                                            >
                                                <Trash2 size={13} />
                                            </Button>
                                        )}
                                        {isLoading ? (
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                size="sm"
                                                onClick={stopGeneration}
                                                className="gap-1"
                                            >
                                                <Square size={13} /> Stop
                                            </Button>
                                        ) : (
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={!input.trim() && !pendingImage}
                                                className="gap-1"
                                            >
                                                <Send size={13} /> Send
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Mode toggle (web only — overlay uses title bar toggle) ──── */}
            {!isDesktop && (
                <div className="fixed bottom-3 sm:bottom-6 left-0 sm:left-[29rem] right-0 px-3 sm:px-6 pointer-events-none">
                    <div className="flex justify-center pointer-events-auto">
                        <div className="flex items-center bg-[var(--surface)] border border-[var(--border)] rounded-full p-1 shadow-xl">
                            <button
                                onClick={() => setMode('chat')}
                                className={cn(
                                    'flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all',
                                    mode === 'chat'
                                        ? 'bg-[var(--accent)] text-white shadow-sm'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                                )}
                            >
                                <MessageSquare size={16} /> Chat
                            </button>
                            <button
                                onClick={() => setMode('voice')}
                                className={cn(
                                    'flex items-center gap-1.5 sm:gap-2 px-3 py-2 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm font-medium transition-all',
                                    mode === 'voice'
                                        ? 'bg-[var(--accent)] text-white shadow-sm'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                                )}
                            >
                                <Mic size={16} /> Voice
                            </button>
                        </div>
                    </div>
                </div>
            )}
            </div>{/* end chat column */}
        </div>
    );
}
