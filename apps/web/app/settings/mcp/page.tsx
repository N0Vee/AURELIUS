'use client';

import React, { useState, useRef } from 'react';
import { useMcp, type McpServer, type McpTransport } from '@/hooks/useMcp';
import { Container } from '@/components/layout';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
    Button, Input, Badge,
} from '@/components/ui';
import { cn } from '@/lib/utils';
import {
    Plus,
    Trash2,
    Power,
    PowerOff,
    RefreshCw,
    Server,
    Terminal,
    Globe,
    ChevronDown,
    ChevronRight,
    Check,
    AlertCircle,
    Loader2,
    Upload,
    FileJson,
} from 'lucide-react';

// ============================================================
// Small helpers
// ============================================================

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
    return (
        <label htmlFor={htmlFor} className="text-sm font-medium text-[var(--text-secondary)]">
            {children}
        </label>
    );
}

function FieldHint({ children }: { children: React.ReactNode }) {
    return <p className="text-xs text-[var(--text-muted)]">{children}</p>;
}

// ============================================================
// MCP Settings Page
// ============================================================

export default function McpSettingsPage() {
    const {
        servers,
        isLoading,
        error,
        addServer,
        updateServer,
        deleteServer,
        connectServer,
        disconnectServer,
        refresh,
        importConfig,
    } = useMcp();

    const [isAdding, setIsAdding] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    return (
        <div className="h-full overflow-y-auto py-8">
            <Container>
                {/* ── Page Header ──────────────────────────────── */}
                <div className="mb-8">
                    <p className="text-sm text-[var(--text-muted)]">Settings / MCP Servers</p>

                    <div className="flex items-center justify-between mt-1">
                        <h1 className="text-3xl font-bold text-[var(--text-primary)]">MCP Servers</h1>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsImporting(true)}
                                className="gap-2"
                            >
                                <Upload size={14} />
                                Import
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => refresh()}
                                disabled={isLoading}
                                className="gap-2"
                            >
                                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                                Refresh
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setIsAdding(true)}
                                className="gap-2"
                            >
                                <Plus size={14} />
                                Add Server
                            </Button>
                        </div>
                    </div>
                </div>

                {/* ── Error Message ────────────────────────────── */}
                {error && (
                    <div className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-[var(--radius-md)] bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30">
                        <AlertCircle size={14} className="text-[var(--dangerous)] shrink-0" />
                        <p className="text-sm text-[var(--dangerous)]">{error}</p>
                    </div>
                )}

                {/* ── Import Config Form ───────────────────────── */}
                {isImporting && (
                    <ImportConfigForm
                        onImport={importConfig}
                        onCancel={() => setIsImporting(false)}
                    />
                )}

                {/* ── Add Server Form ──────────────────────────── */}
                {isAdding && (
                    <AddServerForm
                        onAdd={addServer}
                        onCancel={() => setIsAdding(false)}
                    />
                )}

                {/* ── Server List ──────────────────────────────── */}
                <div className="space-y-4">
                    {servers.length === 0 && !isLoading && (
                        <Card className="text-center py-12">
                            <CardContent>
                                <Server size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
                                <p className="text-[var(--text-primary)] font-medium">No MCP servers configured</p>
                                <p className="text-sm mt-2 text-[var(--text-secondary)]">
                                    Add a server to connect to external tools and data sources
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {servers.map((server) => (
                        <ServerCard
                            key={server.id}
                            server={server}
                            isExpanded={expandedServer === server.id}
                            onToggle={() => setExpandedServer(expandedServer === server.id ? null : server.id)}
                            onUpdate={updateServer}
                            onDelete={deleteServer}
                            onConnect={connectServer}
                            onDisconnect={disconnectServer}
                        />
                    ))}
                </div>

                {/* ── Info Section ─────────────────────────────── */}
                <section className="mt-12">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Server size={18} className="text-[var(--accent)]" />
                                About MCP
                            </CardTitle>
                            <CardDescription>
                                Model Context Protocol (MCP) is an open standard that enables AI applications
                                to connect to external data sources and tools. You can connect to official servers
                                like GitHub, Slack, PostgreSQL, or community-built servers.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-wrap gap-2">
                                <Badge variant="default" className="font-mono text-[11px]">
                                    npm: @modelcontextprotocol/server-filesystem
                                </Badge>
                                <Badge variant="default" className="font-mono text-[11px]">
                                    npm: @modelcontextprotocol/server-github
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </Container>
        </div>
    );
}

// ============================================================
// Add Server Form
// ============================================================

function AddServerForm({
    onAdd,
    onCancel,
}: {
    onAdd: (server: Omit<McpServer, 'connected' | 'error' | 'toolCount' | 'resourceCount'>) => Promise<boolean>;
    onCancel: () => void;
}) {
    const [name, setName] = useState('');
    const [transport, setTransport] = useState<McpTransport>('stdio');
    const [command, setCommand] = useState('npx');
    const [args, setArgs] = useState('-y @modelcontextprotocol/server-filesystem ~/Documents');
    const [url, setUrl] = useState('http://localhost:3001/sse');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const id = `mcp-${Date.now()}`;
        const server: Omit<McpServer, 'connected' | 'error' | 'toolCount' | 'resourceCount'> = {
            id,
            name,
            transport,
            enabled: true,
        };

        if (transport === 'stdio') {
            server.command = command;
            server.args = args.split(' ').filter(Boolean);
        } else {
            server.url = url;
        }

        const success = await onAdd(server);
        if (success) {
            onCancel();
        }
        setIsSubmitting(false);
    };

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Plus size={18} className="text-[var(--accent)]" />
                    Add MCP Server
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Server Name */}
                    <div className="space-y-2">
                        <FieldLabel>Server Name</FieldLabel>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Filesystem Server"
                            required
                        />
                    </div>

                    {/* Transport Type */}
                    <div className="space-y-2">
                        <FieldLabel>Transport</FieldLabel>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setTransport('stdio')}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] border transition-all duration-200',
                                    transport === 'stdio'
                                        ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]'
                                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]',
                                )}
                            >
                                <Terminal size={16} />
                                stdio (local)
                            </button>
                            <button
                                type="button"
                                onClick={() => setTransport('sse')}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-2 rounded-[var(--radius-md)] border transition-all duration-200',
                                    transport === 'sse'
                                        ? 'border-[var(--accent)] bg-[var(--accent-muted)] text-[var(--accent)] shadow-[0_0_12px_var(--accent-glow)]'
                                        : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:bg-[var(--surface-hover)]',
                                )}
                            >
                                <Globe size={16} />
                                sse (remote)
                            </button>
                        </div>
                    </div>

                    {/* stdio Options */}
                    {transport === 'stdio' && (
                        <>
                            <div className="space-y-2">
                                <FieldLabel>Command</FieldLabel>
                                <Input
                                    type="text"
                                    value={command}
                                    onChange={(e) => setCommand(e.target.value)}
                                    placeholder="e.g., npx, docker, python"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <FieldLabel>Arguments</FieldLabel>
                                <Input
                                    type="text"
                                    value={args}
                                    onChange={(e) => setArgs(e.target.value)}
                                    placeholder="space-separated arguments"
                                    required
                                />
                                <FieldHint>
                                    Example: -y @modelcontextprotocol/server-filesystem ~/Documents
                                </FieldHint>
                            </div>
                        </>
                    )}

                    {/* SSE Options */}
                    {transport === 'sse' && (
                        <div className="space-y-2">
                            <FieldLabel>Server URL</FieldLabel>
                            <Input
                                type="url"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="http://localhost:3001/sse"
                                required
                            />
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={isSubmitting || !name.trim()}
                            className="gap-2"
                        >
                            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                            Add Server
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

// ============================================================
// Import Config Form
// ============================================================

function ImportConfigForm({
    onImport,
    onCancel,
}: {
    onImport: (config: unknown) => Promise<{ success: boolean; added: number; errors: string[]; skipped: number }>;
    onCancel: () => void;
}) {
    const [jsonText, setJsonText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [result, setResult] = useState<{ success: boolean; added: number; errors: string[]; skipped: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result as string;
                setJsonText(text);
            } catch (err) {
                console.error('Failed to read file:', err);
            }
        };
        reader.readAsText(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setResult(null);

        try {
            const parsed = JSON.parse(jsonText);
            const importResult = await onImport(parsed);
            setResult(importResult);
        } catch (err) {
            setResult({
                success: false,
                added: 0,
                errors: ['Invalid JSON: ' + (err instanceof Error ? err.message : String(err))],
                skipped: 0,
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDone = () => {
        if (result?.success) {
            onCancel();
        } else {
            setResult(null);
        }
    };

    return (
        <Card className="mb-6">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <FileJson size={18} className="text-[var(--accent)]" />
                    Import MCP Config
                </CardTitle>
                <CardDescription>
                    Paste JSON config from OpenCode, Kilo, Windsurf, Cursor, or other MCP-compatible editors.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {!result ? (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <textarea
                            value={jsonText}
                            onChange={(e) => setJsonText(e.target.value)}
                            placeholder={`{\n  "mcp": {\n    "context7": {\n      "type": "remote",\n      "url": "https://mcp.context7.com/mcp"\n    }\n  }\n}`}
                            className="w-full h-48 rounded-[var(--radius-md)] px-3 py-2.5 bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] font-mono text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent resize-none transition-all"
                        />

                        <div className="flex items-center gap-4">
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                accept=".json"
                                className="hidden"
                            />
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                                className="gap-2"
                            >
                                <Upload size={14} />
                                Upload File
                            </Button>
                            <div className="flex-1" />
                            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={isSubmitting || !jsonText.trim()}
                                className="gap-2"
                            >
                                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                                Import
                            </Button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-3">
                        <div className={cn(
                            'p-3 rounded-[var(--radius-md)] border',
                            result.success
                                ? 'bg-[var(--safe-glow)] border-[var(--safe)]/30 text-[var(--safe)]'
                                : 'bg-[var(--dangerous-glow)] border-[var(--dangerous)]/30 text-[var(--dangerous)]',
                        )}>
                            <div className="flex items-center gap-2 font-medium">
                                {result.success ? <Check size={16} /> : <AlertCircle size={16} />}
                                {result.success ? 'Import successful' : 'Import completed with errors'}
                            </div>
                            <div className="mt-2 text-sm space-y-1 opacity-80">
                                <p>Added: {result.added} servers</p>
                                {result.skipped > 0 && <p>Skipped: {result.skipped} (already exists)</p>}
                            </div>
                        </div>

                        {result.errors.length > 0 && (
                            <div className="p-3 rounded-[var(--radius-md)] bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30 text-[var(--dangerous)] text-sm">
                                <p className="font-medium mb-2">Errors:</p>
                                <ul className="list-disc list-inside space-y-1 opacity-80">
                                    {result.errors.map((err, i) => (
                                        <li key={i}>{err}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <Button size="sm" onClick={handleDone}>
                                {result.success ? 'Done' : 'Try Again'}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

// ============================================================
// Server Card
// ============================================================

function ServerCard({
    server,
    isExpanded,
    onToggle,
    onUpdate,
    onDelete,
    onConnect,
    onDisconnect,
}: {
    server: McpServer;
    isExpanded: boolean;
    onToggle: () => void;
    onUpdate: (id: string, updates: Partial<McpServer>) => Promise<boolean>;
    onDelete: (id: string) => Promise<boolean>;
    onConnect: (id: string) => Promise<boolean>;
    onDisconnect: (id: string) => Promise<boolean>;
}) {
    const [isDeleting, setIsDeleting] = useState(false);
    const [isToggling, setIsToggling] = useState(false);

    const handleDelete = async () => {
        if (confirm(`Delete server "${server.name}"?`)) {
            setIsDeleting(true);
            await onDelete(server.id);
            setIsDeleting(false);
        }
    };

    const handleToggleEnabled = async () => {
        setIsToggling(true);
        await onUpdate(server.id, { enabled: !server.enabled });
        setIsToggling(false);
    };

    const handleToggleConnection = async () => {
        if (server.connected) {
            await onDisconnect(server.id);
        } else {
            await onConnect(server.id);
        }
    };

    const statusColor = server.connected
        ? 'var(--safe)'
        : server.error
            ? 'var(--dangerous)'
            : 'var(--text-muted)';

    const statusLabel = server.connected
        ? 'Connected'
        : server.error
            ? 'Error'
            : 'Disconnected';

    return (
        <Card className="p-0 overflow-hidden">
            {/* Header */}
            <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{
                            backgroundColor: statusColor,
                            boxShadow: server.connected
                                ? '0 0 6px var(--safe-glow)'
                                : server.error
                                    ? '0 0 6px var(--dangerous-glow)'
                                    : 'none',
                        }}
                    />
                    <div>
                        <h4 className="font-medium text-[var(--text-primary)]">{server.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-[var(--text-muted)] font-mono">{server.transport}</span>
                            <span className="text-xs text-[var(--text-muted)]">&middot;</span>
                            <span className="text-xs text-[var(--text-secondary)]">{server.toolCount ?? 0} tools</span>
                            {server.error && (
                                <Badge variant="dangerous" className="text-[10px] py-0 px-1.5">
                                    Error
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    {/* Connection Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggleConnection();
                        }}
                        disabled={isToggling}
                        className={cn(
                            'h-8 w-8 transition-colors',
                            server.connected
                                ? 'text-[var(--safe)] hover:bg-[var(--safe-glow)]'
                                : 'text-[var(--text-muted)]',
                        )}
                        title={server.connected ? 'Disconnect' : 'Connect'}
                    >
                        {server.connected ? <Power size={16} /> : <PowerOff size={16} />}
                    </Button>

                    {/* Expand */}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-[var(--text-secondary)]">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </Button>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--border)] pt-4 space-y-4">
                    {/* Connection Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-[var(--text-secondary)]">Transport:</span>
                            <span className="ml-2 text-[var(--text-primary)]">{server.transport}</span>
                        </div>
                        {server.transport === 'stdio' && (
                            <>
                                <div>
                                    <span className="text-[var(--text-secondary)]">Command:</span>
                                    <span className="ml-2 text-[var(--text-primary)] font-mono">{server.command}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-[var(--text-secondary)]">Args:</span>
                                    <span className="ml-2 text-[var(--text-primary)] font-mono text-xs">
                                        {server.args?.join(' ')}
                                    </span>
                                </div>
                            </>
                        )}
                        {server.transport === 'sse' && (
                            <div className="col-span-2">
                                <span className="text-[var(--text-secondary)]">URL:</span>
                                <span className="ml-2 text-[var(--text-primary)] font-mono text-xs">{server.url}</span>
                            </div>
                        )}
                        <div>
                            <span className="text-[var(--text-secondary)]">Status:</span>
                            <Badge
                                variant={server.connected ? 'safe' : server.error ? 'dangerous' : 'default'}
                                className="ml-2"
                            >
                                {statusLabel}
                            </Badge>
                        </div>
                        {server.lastConnected && (
                            <div>
                                <span className="text-[var(--text-secondary)]">Last Connected:</span>
                                <span className="ml-2 text-[var(--text-primary)]">
                                    {new Date(server.lastConnected).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Error Display */}
                    {server.error && (
                        <div className="p-3 rounded-[var(--radius-md)] bg-[var(--dangerous-glow)] border border-[var(--dangerous)]/30 text-[var(--dangerous)] text-sm">
                            <strong>Error:</strong>{' '}
                            <span className="opacity-80">{server.error}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-2">
                        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={server.enabled}
                                onChange={handleToggleEnabled}
                                className="sr-only peer"
                            />
                            <div className={cn(
                                'w-9 h-5 rounded-full transition-colors relative',
                                server.enabled
                                    ? 'bg-[var(--accent)]'
                                    : 'bg-[var(--surface-hover)] border border-[var(--border)]',
                            )}>
                                <div className={cn(
                                    'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200',
                                    server.enabled ? 'left-[calc(100%-1.125rem)]' : 'left-0.5',
                                )} />
                            </div>
                            Enabled
                        </label>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="gap-1.5"
                        >
                            <Trash2 size={14} />
                            Delete
                        </Button>
                    </div>
                </div>
            )}
        </Card>
    );
}
