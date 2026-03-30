'use client';

import React, { useState, useRef } from 'react';
import { useMcp, type McpServer, type McpTransport } from '@/hooks/useMcp';
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
    FileJson
} from 'lucide-react';

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
        importConfig
    } = useMcp();

    const [isAdding, setIsAdding] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [expandedServer, setExpandedServer] = useState<string | null>(null);

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-[var(--text)]">MCP Servers</h1>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">
                        Connect to Model Context Protocol servers to extend Aurelius capabilities
                    </p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsImporting(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors"
                    >
                        <Upload size={16} />
                        Import
                    </button>
                    <button
                        onClick={() => refresh()}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text)] transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        Refresh
                    </button>
                    <button
                        onClick={() => setIsAdding(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white transition-colors"
                    >
                        <Plus size={16} />
                        Add Server
                    </button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}

            {/* Import Config Form */}
            {isImporting && (
                <ImportConfigForm
                    onImport={importConfig}
                    onCancel={() => setIsImporting(false)}
                />
            )}

            {/* Add Server Form */}
            {isAdding && (
                <AddServerForm 
                    onAdd={addServer} 
                    onCancel={() => setIsAdding(false)} 
                />
            )}

            {/* Server List */}
            <div className="space-y-4">
                {servers.length === 0 && !isLoading && (
                    <div className="text-center py-12 text-[var(--text-secondary)]">
                        <Server size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No MCP servers configured</p>
                        <p className="text-sm mt-2">Add a server to connect to external tools and data sources</p>
                    </div>
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

            {/* Info Section */}
            <div className="mt-12 p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <h3 className="font-medium text-[var(--text)] mb-2">About MCP</h3>
                <p className="text-sm text-[var(--text-secondary)]">
                    Model Context Protocol (MCP) is an open standard that enables AI applications 
                    to connect to external data sources and tools. You can connect to official servers 
                    like GitHub, Slack, PostgreSQL, or community-built servers.
                </p>
                <div className="mt-3 flex gap-2">
                    <span className="text-xs px-2 py-1 rounded bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                        npm: @modelcontextprotocol/server-filesystem
                    </span>
                    <span className="text-xs px-2 py-1 rounded bg-[var(--surface-hover)] text-[var(--text-secondary)]">
                        npm: @modelcontextprotocol/server-github
                    </span>
                </div>
            </div>
        </div>
    );
}

// ============================================================
// Add Server Form
// ============================================================

function AddServerForm({ 
    onAdd, 
    onCancel 
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
        <form onSubmit={handleSubmit} className="mb-6 p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <h3 className="font-medium text-[var(--text)] mb-4">Add MCP Server</h3>
            
            <div className="space-y-4">
                {/* Server Name */}
                <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Server Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Filesystem Server"
                        className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                        required
                    />
                </div>

                {/* Transport Type */}
                <div>
                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Transport</label>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setTransport('stdio')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                                transport === 'stdio' 
                                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' 
                                    : 'border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                        >
                            <Terminal size={16} />
                            stdio (local)
                        </button>
                        <button
                            type="button"
                            onClick={() => setTransport('sse')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
                                transport === 'sse' 
                                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' 
                                    : 'border-[var(--border)] text-[var(--text-secondary)]'
                            }`}
                        >
                            <Globe size={16} />
                            sse (remote)
                        </button>
                    </div>
                </div>

                {/* stdio Options */}
                {transport === 'stdio' && (
                    <>
                        <div>
                            <label className="block text-sm text-[var(--text-secondary)] mb-1">Command</label>
                            <input
                                type="text"
                                value={command}
                                onChange={(e) => setCommand(e.target.value)}
                                placeholder="e.g., npx, docker, python"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-[var(--text-secondary)] mb-1">Arguments</label>
                            <input
                                type="text"
                                value={args}
                                onChange={(e) => setArgs(e.target.value)}
                                placeholder="space-separated arguments"
                                className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                                required
                            />
                            <p className="text-xs text-[var(--text-secondary)] mt-1">
                                Example: -y @modelcontextprotocol/server-filesystem ~/Documents
                            </p>
                        </div>
                    </>
                )}

                {/* SSE Options */}
                {transport === 'sse' && (
                    <div>
                        <label className="block text-sm text-[var(--text-secondary)] mb-1">Server URL</label>
                        <input
                            type="url"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="http://localhost:3001/sse"
                            className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]"
                            required
                        />
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 mt-6">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-4 py-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || !name.trim()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white transition-colors disabled:opacity-50"
                >
                    {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                    Add Server
                </button>
            </div>
        </form>
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
        <form onSubmit={handleSubmit} className="mb-6 p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
            <div className="flex items-center gap-2 mb-4">
                <FileJson size={20} className="text-[var(--accent)]" />
                <h3 className="font-medium text-[var(--text)]">Import MCP Config</h3>
            </div>

            {!result ? (
                <>
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                        Paste JSON config from Windsurf, Cursor, or other MCP-compatible editors.
                    </p>

                    <textarea
                        value={jsonText}
                        onChange={(e) => setJsonText(e.target.value)}
                        placeholder={`{\n  "mcpServers": {\n    "server-name": {\n      "command": "npx",\n      "args": ["-y", "@modelcontextprotocol/server-filesystem"]\n    }\n  }\n}`}
                        className="w-full h-48 px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--text)] font-mono text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
                    />

                    <div className="flex items-center gap-4 mt-4">
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept=".json"
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                            <Upload size={16} />
                            Upload File
                        </button>
                        <div className="flex-1" />
                        <button
                            type="button"
                            onClick={onCancel}
                            className="px-4 py-2 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !jsonText.trim()}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white transition-colors disabled:opacity-50"
                        >
                            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                            Import
                        </button>
                    </div>
                </>
            ) : (
                <div className="space-y-3">
                    <div className={`p-3 rounded-lg ${result.success ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        <div className="flex items-center gap-2 font-medium">
                            {result.success ? <Check size={16} /> : <AlertCircle size={16} />}
                            {result.success ? 'Import successful' : 'Import completed with errors'}
                        </div>
                        <div className="mt-2 text-sm space-y-1">
                            <p>Added: {result.added} servers</p>
                            {result.skipped > 0 && <p>Skipped: {result.skipped} (already exists)</p>}
                        </div>
                    </div>

                    {result.errors.length > 0 && (
                        <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            <p className="font-medium mb-2">Errors:</p>
                            <ul className="list-disc list-inside space-y-1">
                                {result.errors.map((err, i) => (
                                    <li key={i}>{err}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            onClick={handleDone}
                            className="px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent)]/90 text-white transition-colors"
                        >
                            {result.success ? 'Done' : 'Try Again'}
                        </button>
                    </div>
                </div>
            )}
        </form>
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
    onDisconnect 
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

    return (
        <div className="rounded-lg bg-[var(--surface)] border border-[var(--border)] overflow-hidden">
            {/* Header */}
            <div 
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-[var(--surface-hover)] transition-colors"
                onClick={onToggle}
            >
                <div className="flex items-center gap-3">
                    {server.connected ? (
                        <div className="w-3 h-3 rounded-full bg-green-500" />
                    ) : server.error ? (
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                    ) : (
                        <div className="w-3 h-3 rounded-full bg-gray-400" />
                    )}
                    <div>
                        <h4 className="font-medium text-[var(--text)]">{server.name}</h4>
                        <p className="text-xs text-[var(--text-secondary)]">
                            {server.transport} • {server.toolCount ?? 0} tools
                            {server.error && <span className="text-red-400 ml-2">• Error</span>}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Connection Toggle */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleToggleConnection();
                        }}
                        disabled={isToggling}
                        className={`p-2 rounded-lg transition-colors ${
                            server.connected 
                                ? 'text-green-400 hover:bg-green-500/10' 
                                : 'text-gray-400 hover:bg-gray-500/10'
                        }`}
                        title={server.connected ? 'Disconnect' : 'Connect'}
                    >
                        {server.connected ? <Power size={16} /> : <PowerOff size={16} />}
                    </button>

                    {/* Expand */}
                    <button className="p-2 text-[var(--text-secondary)]">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="px-4 pb-4 border-t border-[var(--border)] pt-4 space-y-4">
                    {/* Connection Details */}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span className="text-[var(--text-secondary)]">Transport:</span>
                            <span className="ml-2 text-[var(--text)]">{server.transport}</span>
                        </div>
                        {server.transport === 'stdio' && (
                            <>
                                <div>
                                    <span className="text-[var(--text-secondary)]">Command:</span>
                                    <span className="ml-2 text-[var(--text)] font-mono">{server.command}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-[var(--text-secondary)]">Args:</span>
                                    <span className="ml-2 text-[var(--text)] font-mono">{server.args?.join(' ')}</span>
                                </div>
                            </>
                        )}
                        {server.transport === 'sse' && (
                            <div className="col-span-2">
                                <span className="text-[var(--text-secondary)]">URL:</span>
                                <span className="ml-2 text-[var(--text)] font-mono">{server.url}</span>
                            </div>
                        )}
                        <div>
                            <span className="text-[var(--text-secondary)]">Status:</span>
                            <span className={`ml-2 ${server.connected ? 'text-green-400' : 'text-gray-400'}`}>
                                {server.connected ? 'Connected' : 'Disconnected'}
                            </span>
                        </div>
                        {server.lastConnected && (
                            <div>
                                <span className="text-[var(--text-secondary)]">Last Connected:</span>
                                <span className="ml-2 text-[var(--text)]">
                                    {new Date(server.lastConnected).toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Error Display */}
                    {server.error && (
                        <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                            <strong>Error:</strong> {server.error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-2">
                        <div className="flex items-center gap-2">
                            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={server.enabled}
                                    onChange={handleToggleEnabled}
                                    className="rounded border-[var(--border)]"
                                />
                                Enabled
                            </label>
                        </div>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                            <Trash2 size={14} />
                            Delete
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
