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
import { Send, Square, Trash2, MessageSquare, Mic, Minus, Monitor, ClipboardPaste, X, Plus } from 'lucide-react';
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
    sessions,
    activeSessionId,
    onSelectSession,
    onCreateSession,
}: {
    mode: Mode;
    onModeChange: (m: Mode) => void;
    onHide: () => void;
    sessions: any[];
    activeSessionId: string | null;
    onSelectSession: (id: string) => void;
    onCreateSession: () => void;
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

            {/* Session selector — not draggable */}
            <div className="flex items-center gap-1 pointer-events-auto">
                <select
                    value={activeSessionId || ''}
                    onChange={(e) => onSelectSession(e.target.value)}
                    className="text-[10px] bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5 text-[var(--text-secondary)] cursor-pointer max-w-[120px]"
                >
                    {sessions.map((s: any) => (
                        <option key={s.id} value={s.id}>
                            {s.title || 'New Chat'}
                        </option>
                    ))}
                </select>
                <button
                    onClick={onCreateSession}
                    title="New session"
                    className="flex items-center justify-center h-5 w-5 rounded text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)] transition-all"
                >
                    <Plus size={10} />
                </button>
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
    onModeChange,
    onClear,
    canClear,
}: {
    mode: Mode;
    onModeChange: (m: Mode) => void;
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
                <div className="flex items-center gap-3">
                    <h1 className="text-sm sm:text-lg font-semibold text-[var(--text-primary)]">
                        {mode === 'chat' ? 'Chat Mode' : 'Voice Mode'}
                    </h1>
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
                </div>
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

    // Sync voice mode session with chat session
    const { setSessionId: setVoiceSessionId, speakText } = useVoice();
    useEffect(() => {
        if (activeSessionId) {
            setVoiceSessionId(activeSessionId);
        }
    }, [activeSessionId, setVoiceSessionId]);

    // TTS: speak responses and tool events in voice mode
    const lastSpokenId = useRef<string>('');
    const spokeConfirmIds = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (mode !== 'voice') return;

        // Check for new tool_confirm pending messages
        for (const msg of messages) {
            if (msg.role === 'tool_confirm' && msg.status === 'pending' && !spokeConfirmIds.current.has(msg.id)) {
                spokeConfirmIds.current.add(msg.id);
                const name = (msg as any).displayName || (msg as any).toolName;
                console.log('[TTS] Speaking tool confirm:', name);
                speakText(`${name}. Should I proceed?`);
                return;
            }
        }

        const last = messages[messages.length - 1];
        if (!last || last.id === lastSpokenId.current) return;

        // Tool auto-executed
        if (last.role === 'tool_auto') {
            lastSpokenId.current = last.id;
            const result = (last as any).result;
            console.log('[TTS] Speaking tool result:', result?.slice(0, 50));
            if (result && result.length < 200) speakText(result);
            return;
        }

        // Tool approved/rejected
        if (last.role === 'tool_confirm' && (last.status === 'approved' || last.status === 'rejected')) {
            lastSpokenId.current = last.id;
            console.log('[TTS] Speaking tool status:', last.status);
            speakText(last.status === 'approved' ? 'Approved.' : 'Rejected.');
            return;
        }

        // Assistant response
        if (last.role === 'assistant') {
            if ('isStreaming' in last && (last as any).isStreaming) return;
            lastSpokenId.current = last.id;
            if (!last.content) return;
            const tts = last.content
                .replace(/```[\s\S]*?```/g, 'Check the app for details.')
                .replace(/`([^`]+)`/g, '$1')
                .replace(/\*\*([^*]+)\*\*/g, '$1')
                .replace(/\*([^*]+)\*/g, '$1')
                .replace(/#{1,6}\s/g, '')
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
                .replace(/^\s*[-*]\s/gm, '')
                .trim();
            console.log('[TTS] Speaking assistant response:', tts?.slice(0, 50));
            if (tts) speakText(tts);
        }
    }, [messages, mode, speakText]);

    const pendingConfirmId = (messages.find(m => m.role === 'tool_confirm' && m.status === 'pending') as any)?.pendingId ?? null;
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
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelectSession={setActiveSessionId}
                    onCreateSession={createSession}
                />
            ) : (
                <WebTitleBar
                    mode={mode}
                    onModeChange={setMode}
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
                        <VoiceVisual
                            language={language}
                            onLanguageChange={setLanguage}
                            messages={messages}
                            isStreaming={isLoading}
                            onSend={sendMessage}
                            onApprove={approveToolCall}
                            onReject={rejectToolCall}
                            pendingConfirmId={pendingConfirmId}
                        />
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

            </div>{/* end chat column */}
        </div>
    );
}
