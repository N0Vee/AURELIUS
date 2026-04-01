'use client';

import { useState, FormEvent, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSessions } from '@/hooks/useChatSessions';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useSettings } from '@/hooks/useSettings';
import { useSessionTokens } from '@/hooks/useSessionTokens';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { useTauriDrag } from '@/hooks/useTauriDrag';
import { ChatWindow } from './components/ChatWindow';
import { SessionSidebar } from './components/SessionSidebar';
import { VoiceVisual } from './components/VoiceVisual';
import { SlashCommandMenu, buildDefaultCommands } from './components/SlashCommandMenu';
import { TokenUsageBar } from './components/TokenUsageBar';
import { Button } from '@/components/ui';
import { Send, Square, Trash2, MessageSquare, Mic, Minus, Monitor, ClipboardPaste, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, isToolPart } from '@/lib/utils';
import { getToolName } from 'ai';
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
    tokenBar,
}: {
    mode: Mode;
    onModeChange: (m: Mode) => void;
    onClear: () => void;
    canClear: boolean;
    tokenBar?: React.ReactNode;
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
                <div className="flex items-center gap-3">
                    {tokenBar}
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
                </div>
            </header>
        </>
    );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ChatPage() {
    const isDesktop = useIsDesktop();
    const [mode, setMode] = useState<Mode>('chat');
    const [input, setInput] = useState('');

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
        status,
        isLoading,
        error: chatError,
        sendMessage,
        regenerate,
        stop,
        clearMessages,
        executeAndApprove,
        rejectTool,
    } = useChat({
        sessionId:    activeSessionId,
        sessionTitle: activeSession?.title,
    });

    // ── Settings (for model info in slash commands) ──────────────────────────
    const { settings } = useSettings();

    // ── Token usage ─────────────────────────────────────────────────────────
    const sessionTokens = useSessionTokens(activeSessionId);
    const { models: orModels } = useOpenRouterModels(settings?.openrouterApiKeySet ?? false);
    const activeModelContextLimit = useMemo(() => {
        if (settings?.llmProvider !== 'openrouter') return undefined;
        const modelId = settings?.openrouterModel;
        if (!modelId) return undefined;
        const match = orModels.find((m) => m.id === modelId);
        return match?.context_length ?? undefined;
    }, [settings?.llmProvider, settings?.openrouterModel, orModels]);

    // ── Slash commands ────────────────────────────────────────────────────────
    const [slashOpen, setSlashOpen] = useState(false);
    const [slashIndex, setSlashIndex] = useState(0);
    const [slashToast, setSlashToast] = useState<string | null>(null);

    // Auto-clear toast after 3 s
    useEffect(() => {
        if (!slashToast) return;
        const t = setTimeout(() => setSlashToast(null), 3000);
        return () => clearTimeout(t);
    }, [slashToast]);

    const slashCommands = useMemo(
        () =>
            buildDefaultCommands({
                clearMessages,
                createSession,
                toggleVoice: () => setMode((m) => (m === 'chat' ? 'voice' : 'chat')),
                showModel: () => {
                    const provider = settings?.llmProvider ?? 'unknown';
                    const model =
                        provider === 'openrouter'
                            ? settings?.openrouterModel
                            : settings?.ollamaModel;
                    setSlashToast(`${provider}: ${model ?? 'not configured'}`);
                },
            }),
        [clearMessages, createSession, settings],
    );

    const slashFilter = slashOpen ? input.slice(1).toLowerCase() : '';

    const filteredSlashCommands = useMemo(() => {
        if (!slashFilter) return slashCommands;
        return slashCommands.filter(
            (c) =>
                c.command.toLowerCase().includes(slashFilter) ||
                c.label.toLowerCase().includes(slashFilter),
        );
    }, [slashFilter, slashCommands]);

    // Reset index when filter changes
    useEffect(() => {
        setSlashIndex(0);
    }, [slashFilter]);

    const handleSlashSelect = useCallback(
        (cmd: typeof slashCommands[number]) => {
            cmd.action();
            setInput('');
            setSlashOpen(false);
        },
        [],
    );

    // Sync voice mode session with chat session
    const { setSessionId: setVoiceSessionId, speakText } = useVoice();
    useEffect(() => {
        if (activeSessionId) {
            setVoiceSessionId(activeSessionId);
        }
    }, [activeSessionId, setVoiceSessionId]);

    // TTS: speak responses and tool events in voice mode (v2 parts-based)
    const lastSpokenId = useRef<string>('');
    const spokeToolCallIds = useRef<Set<string>>(new Set());

    // When switching TO voice mode, mark the current last message as already
    // spoken so we don't re-read messages that were shown in chat mode.
    useEffect(() => {
        if (mode === 'voice') {
            const last = messages[messages.length - 1];
            if (last) lastSpokenId.current = last.id;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    useEffect(() => {
        if (mode !== 'voice') return;

        // Scan for pending tool invocations (needs approval) in the latest assistant message
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant?.parts) {
            for (const part of lastAssistant.parts) {
                if (
                    isToolPart(part) &&
                    (part.state === 'input-available') &&
                    !spokeToolCallIds.current.has(part.toolCallId)
                ) {
                    spokeToolCallIds.current.add(part.toolCallId);
                    const name = getToolName(part).replace(/_/g, ' ');
                    speakText(`${name}. Should I proceed?`);
                    return;
                }
            }
        }

        const last = messages[messages.length - 1];
        if (!last || last.id === lastSpokenId.current) return;

        // Only speak completed assistant messages (not while still streaming)
        if (last.role === 'assistant' && status === 'ready') {
            lastSpokenId.current = last.id;

            // Gather text from parts (guard for v1 messages without parts)
            const fullText = (last.parts ?? [])
                .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                .map((p) => p.text)
                .join('\n');
            if (!fullText) return;

            // ── Smart TTS: summarise long responses ───────────────
            const codeBlockCount = (fullText.match(/```/g) || []).length / 2;
            const listItemCount = (fullText.match(/^\s*[-*\d.]+\s/gm) || []).length;
            const tableCount = (fullText.match(/^\|/gm) || []).length;
            const hasHeavyContent = codeBlockCount >= 1 || listItemCount > 5 || tableCount > 2;

            // Strip markdown to plain speech
            const plain = fullText
                .replace(/```[\s\S]*?```/g, '')       // remove code blocks
                .replace(/`([^`]+)`/g, '$1')           // inline code → text
                .replace(/\*\*([^*]+)\*\*/g, '$1')     // bold
                .replace(/\*([^*]+)\*/g, '$1')          // italic
                .replace(/#{1,6}\s/g, '')               // headings
                .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
                .replace(/^\s*[-*]\s/gm, '')            // list bullets
                .replace(/^\|.*\|$/gm, '')              // table rows
                .replace(/\n{2,}/g, '\n')               // collapse blank lines
                .trim();

            const MAX_SPEAK_LEN = 250;

            let tts: string;

            if (!plain && hasHeavyContent) {
                // Response is mostly code/tables
                tts = "I've put the details on screen. Take a look.";
            } else if (plain.length <= MAX_SPEAK_LEN && !hasHeavyContent) {
                // Short enough to read fully
                tts = plain;
            } else {
                // Extract first meaningful sentence(s) up to limit
                const sentences = plain.match(/[^.!?\n]+[.!?]?/g) || [plain];
                let summary = '';
                for (const s of sentences) {
                    if ((summary + s).length > MAX_SPEAK_LEN) break;
                    summary += s;
                }
                summary = summary.trim();
                if (!summary) summary = plain.slice(0, MAX_SPEAK_LEN);

                tts = hasHeavyContent
                    ? `${summary}. I've put the full details on screen.`
                    : `${summary}. There's more on screen if you need it.`;
            }

            if (tts) speakText(tts);
        }
    }, [messages, mode, status, speakText]);

    // Find pending tool call for voice mode approval/reject
    const pendingToolCall = (() => {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (!lastAssistant?.parts) return null;
        for (const part of lastAssistant.parts) {
            if (isToolPart(part) && part.state === 'input-available') {
                return { ...part, toolName: getToolName(part) };
            }
        }
        return null;
    })();
    const pendingConfirmId = pendingToolCall?.toolCallId ?? null;

    const { pendingImage, captureScreen, pasteFromClipboard, clearPendingImage } = useScreenCapture();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Drag & drop file attachments ──────────────────────────────────────────
    interface PendingFile {
        id: string;
        name: string;
        mediaType: string;
        data: string;            // base64 for images, text content for text files
        preview?: string;        // data URL thumbnail for images
    }

    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.toml', '.yaml', '.yml', '.html', '.css', '.xml', '.sh', '.ps1', '.bat', '.cfg', '.ini', '.log'];
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
    const MAX_TEXT_SIZE = 100 * 1024;         // 100 KB

    const addDroppedFiles = useCallback((fileList: FileList) => {
        Array.from(fileList).forEach((file) => {
            if (IMAGE_TYPES.includes(file.type) && file.size <= MAX_IMAGE_SIZE) {
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    setPendingFiles((prev) => [
                        ...prev,
                        {
                            id: crypto.randomUUID(),
                            name: file.name,
                            mediaType: file.type,
                            data: dataUrl,
                            preview: dataUrl,
                        },
                    ]);
                };
                reader.readAsDataURL(file);
            } else if (file.size <= MAX_TEXT_SIZE) {
                const ext = '.' + file.name.split('.').pop()?.toLowerCase();
                if (TEXT_EXTENSIONS.includes(ext) || file.type.startsWith('text/')) {
                    const reader = new FileReader();
                    reader.onload = () => {
                        setPendingFiles((prev) => [
                            ...prev,
                            {
                                id: crypto.randomUUID(),
                                name: file.name,
                                mediaType: file.type || 'text/plain',
                                data: reader.result as string,
                            },
                        ]);
                    };
                    reader.readAsText(file);
                }
            }
        });
    }, []);

    const removePendingFile = useCallback((id: string) => {
        setPendingFiles((prev) => prev.filter((f) => f.id !== id));
    }, []);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current++;
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
            addDroppedFiles(e.dataTransfer.files);
        }
    }, [addDroppedFiles]);

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
        const hasImages = pendingImage || pendingFiles.some((f) => f.preview);
        const hasTextFiles = pendingFiles.some((f) => !f.preview);
        const hasContent = input.trim() || hasImages || hasTextFiles;

        if (hasContent && !isLoading) {
            // Collect all image data URLs
            const images: string[] = [];
            if (pendingImage) images.push(pendingImage);
            pendingFiles
                .filter((f) => f.preview)
                .forEach((f) => images.push(f.data));

            // Build text content: user input + any attached text files
            let text = input.trim();
            const textAttachments = pendingFiles.filter((f) => !f.preview);
            if (textAttachments.length > 0) {
                const fileContext = textAttachments
                    .map((f) => `<file name="${f.name}">\n${f.data}\n</file>`)
                    .join('\n\n');
                text = text
                    ? `${text}\n\n${fileContext}`
                    : `Here are the attached files:\n\n${fileContext}`;
            }

            if (!text && hasImages) {
                text = 'What do you see in this image?';
            }

            sendMessage(text, images.length > 0 ? images : undefined);
            setInput('');
            clearPendingImage();
            setPendingFiles([]);
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
            <div
                className="flex flex-col flex-1 min-w-0 h-screen relative"
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >

            {/* ── Drag overlay ───────────────────────────────────────────── */}
            <AnimatePresence>
                {isDragging && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex items-center justify-center bg-[var(--bg)]/80 backdrop-blur-sm border-2 border-dashed border-[var(--accent)] rounded-2xl"
                    >
                        <div className="flex flex-col items-center gap-2 text-[var(--accent)]">
                            <Monitor size={32} />
                            <span className="text-sm font-medium">Drop files here</span>
                            <span className="text-xs text-[var(--text-muted)]">Images, code, text files</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                    tokenBar={
                        <TokenUsageBar
                            totalTokens={sessionTokens.totalTokens}
                            promptTokens={sessionTokens.promptTokens}
                            completionTokens={sessionTokens.completionTokens}
                            model={sessionTokens.model}
                            turnCount={sessionTokens.turnCount}
                            contextLimit={activeModelContextLimit}
                        />
                    }
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
                            status={status}
                            error={chatError}
                            onApprove={executeAndApprove}
                            onReject={(toolCallId, toolName) => rejectTool(toolCallId, toolName)}
                            onRetry={regenerate}
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
                            messages={messages as any[]}
                            isStreaming={isLoading}
                            onSend={sendMessage}
                            onApprove={(id: string) => {
                                if (pendingToolCall) {
                                    executeAndApprove(
                                        pendingToolCall.toolCallId,
                                        pendingToolCall.toolName,
                                        (pendingToolCall.input ?? {}) as Record<string, unknown>,
                                    );
                                }
                            }}
                            onReject={(id: string) => {
                                if (pendingToolCall) {
                                    rejectTool(pendingToolCall.toolCallId, pendingToolCall.toolName);
                                }
                            }}
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
                                    'relative rounded-2xl p-3 sm:p-4 shadow-2xl',
                                    isDesktop
                                        ? 'bg-[var(--overlay-bg)] border border-[var(--overlay-border)] backdrop-blur-xl'
                                        : 'glass-strong',
                                )}
                            >
                                {/* ── Slash command menu ───────────────────── */}
                                {slashOpen && filteredSlashCommands.length > 0 && (
                                    <SlashCommandMenu
                                        filter={slashFilter}
                                        commands={filteredSlashCommands}
                                        onSelect={handleSlashSelect}
                                        onClose={() => setSlashOpen(false)}
                                        selectedIndex={slashIndex}
                                    />
                                )}

                                {/* ── Slash toast (ephemeral info) ─────────── */}
                                {slashToast && (
                                    <div className="absolute bottom-full left-0 right-0 mb-2 flex justify-center pointer-events-none z-50">
                                        <div className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-secondary)] shadow-lg animate-in fade-in slide-in-from-bottom-2">
                                            {slashToast}
                                        </div>
                                    </div>
                                )}

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

                                {/* ── Dropped file previews ────────────────── */}
                                {pendingFiles.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mb-2">
                                        {pendingFiles.map((f) =>
                                            f.preview ? (
                                                <div key={f.id} className="relative inline-block">
                                                    <img
                                                        src={f.preview}
                                                        alt={f.name}
                                                        className="max-h-24 w-auto rounded-lg border border-[var(--border)] object-contain"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removePendingFile(f.id)}
                                                        className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--dangerous)] text-white shadow-md hover:brightness-110 transition"
                                                    >
                                                        <X size={11} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div
                                                    key={f.id}
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-xs text-[var(--text-secondary)]"
                                                >
                                                    <span className="max-w-[120px] truncate">{f.name}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => removePendingFile(f.id)}
                                                        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-[var(--dangerous)]/20 text-[var(--text-muted)] hover:text-[var(--dangerous)] transition"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            ),
                                        )}
                                    </div>
                                )}

                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setInput(val);
                                        // Open slash menu when input starts with / and has no spaces yet
                                        if (val.startsWith('/') && !val.includes(' ')) {
                                            setSlashOpen(true);
                                        } else {
                                            setSlashOpen(false);
                                        }
                                    }}
                                    onPaste={handlePaste}
                                    onKeyDown={(e) => {
                                        if (slashOpen && filteredSlashCommands.length > 0) {
                                            if (e.key === 'ArrowDown') {
                                                e.preventDefault();
                                                setSlashIndex((i) => Math.min(i + 1, filteredSlashCommands.length - 1));
                                                return;
                                            }
                                            if (e.key === 'ArrowUp') {
                                                e.preventDefault();
                                                setSlashIndex((i) => Math.max(i - 1, 0));
                                                return;
                                            }
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSlashSelect(filteredSlashCommands[slashIndex]);
                                                return;
                                            }
                                            if (e.key === 'Escape') {
                                                e.preventDefault();
                                                setSlashOpen(false);
                                                return;
                                            }
                                        }
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleSubmit(e);
                                        }
                                    }}
                                    placeholder={pendingImage ? 'Ask about this screenshot...' : 'Type / for commands...'}
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
                                                onClick={stop}
                                                className="gap-1"
                                            >
                                                <Square size={13} /> Stop
                                            </Button>
                                        ) : (
                                            <Button
                                                type="submit"
                                                size="sm"
                                                disabled={!input.trim() && !pendingImage && pendingFiles.length === 0}
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
