'use client';

import { useState, FormEvent, useRef, useEffect, useCallback, useMemo } from 'react';
import { useChat } from '@/hooks/useChat';
import { useChatSessions } from '@/hooks/useChatSessions';
import { useScreenCapture } from '@/hooks/useScreenCapture';
import { useSettings } from '@/hooks/useSettings';
import { useSessionTokens } from '@/hooks/useSessionTokens';
import { useOpenRouterModels } from '@/hooks/useOpenRouterModels';
import { ChatWindow } from './components/ChatWindow';
import { SessionSidebar } from './components/SessionSidebar';
import {
    SlashCommandMenu,
    SlashCommandResultCard,
    buildDefaultCommands,
    filterSlashCommands,
    type SlashCommand,
    type SlashCommandResult,
} from './components/SlashCommandMenu';
import { TokenUsageBar } from './components/TokenUsageBar';
import { Button } from '@/components/ui';
import { Send, Square, Trash2, Mic, MicOff, Monitor, ClipboardPaste, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, isToolPart } from '@/lib/utils';
import { getToolName } from 'ai';
import { useVoice } from '@/components/VoiceProvider';
import Image from 'next/image';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const TEXT_EXTENSIONS = ['.txt', '.md', '.json', '.csv', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.toml', '.yaml', '.yml', '.html', '.css', '.xml', '.sh', '.ps1', '.bat', '.cfg', '.ini', '.log'];
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_TEXT_SIZE = 100 * 1024;

// ── Web title-bar ─────────────────────────────────────────────────────────────
function WebTitleBar({
    onClear,
    canClear,
    tokenBar,
    voiceStatus,
}: {
    onClear: () => void;
    canClear: boolean;
    tokenBar?: React.ReactNode;
    voiceStatus?: React.ReactNode;
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
                <div className="flex items-center gap-3 min-w-0">
                    <h1 className="text-sm sm:text-lg font-semibold text-[var(--text-primary)]">
                        Chat
                    </h1>
                    {voiceStatus}
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
        approveToolCall,
        rejectToolCall,
    } = useChat({
        sessionId:    activeSessionId,
        sessionTitle: activeSession?.title,
    });

    const {
        setSessionId: setVoiceSessionId,
        speakText,
        isConnected,
        connectionStatus,
        connectionMessage,
        isRecording,
        isSpeaking,
        toggleRecording,
        onTranscription,
        onToolConfirm,
    } = useVoice();

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
    const [slashResult, setSlashResult] = useState<SlashCommandResult | null>(null);

    const currentModelLabel = settings?.llmProvider === 'openrouter'
        ? settings?.openrouterModel
        : settings?.ollamaModel;

    const voiceUnavailableReason = connectionMessage
        ?? (connectionStatus === 'connecting' ? 'Audio engine is still starting.' : 'Audio is unavailable right now.');

    const slashCommands = useMemo(
        () =>
            buildDefaultCommands({
                sessionTitle: activeSession?.title,
                sessionCount: sessions.length,
                recentSessionTitles: sessions.map((session) => session.title),
                messageCount: messages.length,
                totalTokens: sessionTokens.totalTokens,
                promptTokens: sessionTokens.promptTokens,
                completionTokens: sessionTokens.completionTokens,
                providerLabel: settings?.llmProvider ?? 'unknown',
                modelLabel: currentModelLabel,
                contextLimit: activeModelContextLimit,
                isVoiceConnected: isConnected,
                isRecording,
                voiceUnavailableReason,
                clearMessages,
                createSession,
                toggleVoice: toggleRecording,
            }),
        [
            activeModelContextLimit,
            activeSession?.title,
            clearMessages,
            createSession,
            currentModelLabel,
            isConnected,
            isRecording,
            messages.length,
            sessions,
            sessionTokens.completionTokens,
            sessionTokens.promptTokens,
            sessionTokens.totalTokens,
            settings?.llmProvider,
            toggleRecording,
            voiceUnavailableReason,
        ],
    );

    const slashFilter = slashOpen ? input.slice(1).toLowerCase() : '';

    const filteredSlashCommands = useMemo(() => {
        return filterSlashCommands(slashCommands, slashFilter);
    }, [slashFilter, slashCommands]);

    const handleSlashSelect = useCallback(
        async (cmd: SlashCommand) => {
            try {
                const execution = await cmd.execute();
                setSlashResult(execution?.result ?? null);
                setInput(execution?.nextInput ?? '');
            } catch (error) {
                setSlashResult({
                    command: cmd.command,
                    tone: 'error',
                    title: `/${cmd.command} failed`,
                    detail: error instanceof Error ? error.message : 'Unknown error.',
                });
                setInput('');
            }

            setSlashIndex(0);
            setSlashOpen(false);
            requestAnimationFrame(() => textareaRef.current?.focus());
        },
        [],
    );

    const voiceTurnState = useRef({
        lastInputSource: 'typed' as 'typed' | 'voice',
        lastSpokenId: '',
        spokeToolCallIds: new Set<string>(),
    });

    // Sync voice session with chat session and suppress TTS for loaded history.
    useEffect(() => {
        if (activeSessionId) {
            setVoiceSessionId(activeSessionId);
        }
        voiceTurnState.current = {
            lastInputSource: 'typed',
            lastSpokenId: '',
            spokeToolCallIds: new Set<string>(),
        };
    }, [activeSessionId, setVoiceSessionId]);

    // TTS: speak responses and tool events in voice mode (v2 parts-based)
    useEffect(() => {
        onTranscription((text: string) => {
            if (!text.trim()) return;
            voiceTurnState.current.lastInputSource = 'voice';
            void sendMessage(text, undefined, { voiceMode: true });
        });
    }, [onTranscription, sendMessage]);

    useEffect(() => {
        if (voiceTurnState.current.lastInputSource !== 'voice') return;

        // Scan for pending approval requests in the latest assistant message.
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (lastAssistant?.parts) {
            for (const part of lastAssistant.parts) {
                if (
                    isToolPart(part) &&
                    part.state === 'approval-requested' &&
                    !voiceTurnState.current.spokeToolCallIds.has(part.toolCallId)
                ) {
                    voiceTurnState.current.spokeToolCallIds.add(part.toolCallId);
                    const name = getToolName(part).replace(/_/g, ' ');
                    speakText(`${name}. Should I proceed?`);
                    return;
                }
            }
        }

        const last = messages[messages.length - 1];
        if (!last || last.id === voiceTurnState.current.lastSpokenId) return;

        // Only speak completed assistant messages (not while still streaming)
        if (last.role === 'assistant' && status === 'ready') {
            voiceTurnState.current.lastSpokenId = last.id;

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
    }, [messages, status, speakText]);

    // Find pending tool call for voice mode approval/reject
    const pendingToolCall = (() => {
        const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (!lastAssistant?.parts) return null;
        for (const part of lastAssistant.parts) {
            if (isToolPart(part) && part.state === 'approval-requested') {
                return { ...part, toolName: getToolName(part) };
            }
        }
        return null;
    })();

    useEffect(() => {
        onToolConfirm((approved: boolean) => {
            if (!pendingToolCall) return;

            if (approved) {
                void approveToolCall(
                    pendingToolCall.toolCallId,
                    pendingToolCall.toolName,
                );
                return;
            }

            void rejectToolCall(
                pendingToolCall.toolCallId,
                pendingToolCall.toolName,
            );
        });
    }, [onToolConfirm, pendingToolCall, approveToolCall, rejectToolCall]);

    const { pendingImage, captureScreen, pasteFromClipboard, clearPendingImage } = useScreenCapture();
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleQuickPrompt = useCallback((prompt: string) => {
        setInput(prompt);
        setSlashOpen(false);
        setSlashIndex(0);
        requestAnimationFrame(() => textareaRef.current?.focus());
    }, []);

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

            voiceTurnState.current.lastInputSource = 'typed';
            void sendMessage(text, images.length > 0 ? images : undefined, { voiceMode: false });
            setInput('');
            clearPendingImage();
            setPendingFiles([]);
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

    const scrollPb = 'pb-40 sm:pb-56';

    const voiceStatusText = !isConnected
        ? (connectionMessage ?? (connectionStatus === 'connecting' ? 'Starting audio...' : 'Audio unavailable'))
        : isRecording
            ? (isSpeaking ? 'Listening...' : 'Recording...')
            : 'Voice ready';

    const voiceStatusTone = !isConnected
        ? (connectionStatus === 'disconnected' ? 'text-[var(--dangerous)] border-[var(--dangerous)]/30 bg-[var(--dangerous-glow)]' : 'text-[var(--text-muted)] border-[var(--border)] bg-[var(--surface)]')
        : isRecording
            ? 'text-white border-transparent bg-[var(--accent)]'
            : 'text-[var(--accent)] border-[var(--accent)]/25 bg-[var(--accent)]/10';

    return (
        <div className="flex h-screen">
            <SessionSidebar
                sessions={sessions}
                activeSessionId={activeSessionId}
                onSelect={setActiveSessionId}
                onCreate={createSession}
                onDelete={deleteSession}
                onRename={renameSession}
                className="hidden sm:flex"
            />

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

            <WebTitleBar
                onClear={clearMessages}
                canClear={messages.length > 0}
                voiceStatus={
                    <div className={cn(
                        'hidden sm:flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
                        voiceStatusTone,
                    )}>
                        {isRecording ? <MicOff size={12} /> : <Mic size={12} />}
                        <span className="truncate max-w-[180px]">{voiceStatusText}</span>
                    </div>
                }
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

            {/* ── Main content ───────────────────────────────────────────── */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className={cn('flex-1 min-h-0 overflow-y-auto', scrollPb)}
            >
                <ChatWindow
                    messages={messages}
                    status={status}
                    error={chatError}
                    onApprove={approveToolCall}
                    onReject={rejectToolCall}
                    onRetry={regenerate}
                    onQuickPrompt={handleQuickPrompt}
                />
            </motion.div>

            {/* ── Floating input (chat mode) ──────────────────────────────── */}
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="fixed bottom-20 left-0 right-0 px-3 pointer-events-none sm:bottom-24 sm:left-[29rem] sm:px-6"
                >

                    <div
                        className="mx-auto max-w-full pointer-events-auto sm:max-w-3xl"
                    >
                        <form
                            onSubmit={handleSubmit}
                            className="glass-strong relative rounded-2xl p-3 shadow-2xl sm:p-4"
                        >
                                <div className="absolute bottom-full left-0 right-0 mb-2 z-50 flex flex-col gap-2">
                                    {slashOpen && (
                                        <SlashCommandMenu
                                            query={slashFilter}
                                            commands={filteredSlashCommands}
                                            onSelect={handleSlashSelect}
                                            selectedIndex={Math.min(slashIndex, Math.max(filteredSlashCommands.length - 1, 0))}
                                        />
                                    )}

                                    {!slashOpen && slashResult && (
                                        <SlashCommandResultCard
                                            result={slashResult}
                                            onDismiss={() => setSlashResult(null)}
                                        />
                                    )}
                                </div>

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
                                                    <Image
                                                        src={f.preview}
                                                        alt={f.name}
                                                        width={96}
                                                        height={96}
                                                        unoptimized
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
                                        setSlashIndex(0);
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
                                    className="w-full max-h-[120px] overflow-y-auto resize-none bg-transparent text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none text-sm sm:text-base leading-relaxed [field-sizing:content]"
                                />
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--border)]">
                                    <div className="flex items-center gap-1 flex-wrap">
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
                                        <button
                                            type="button"
                                            onClick={toggleRecording}
                                            disabled={!isConnected}
                                            title={voiceStatusText}
                                            aria-label={voiceStatusText}
                                            className={cn(
                                                'inline-flex h-8 w-8 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                                                voiceStatusTone,
                                            )}
                                        >
                                            {isRecording ? <MicOff size={15} /> : <Mic size={15} />}
                                        </button>
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
            </AnimatePresence>

            </div>{/* end chat column */}
        </div>
    );
}
