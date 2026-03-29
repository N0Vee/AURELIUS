'use client';

import React from 'react';
import { useUpdater } from '@/hooks/useUpdater';
import { Download, RefreshCw, X, CheckCircle, AlertCircle, Loader2, ArrowUpCircle } from 'lucide-react';

// ============================================================
// UpdateNotification
// ============================================================
// A floating toast-style notification that appears when an app
// update is available, shows download progress, and lets the
// user install + relaunch with one click.
//
// Renders nothing when:
//   - Not running inside Tauri
//   - Status is 'idle', 'checking', or 'up-to-date'
// ============================================================

export function UpdateNotification() {
    const {
        isTauri,
        status,
        updateInfo,
        progress,
        error,
        checkForUpdates,
        downloadAndInstall,
        dismiss,
    } = useUpdater();

    // Don't render anything in the browser or when there's nothing to show.
    if (!isTauri) return null;
    if (status === 'idle' || status === 'checking') return null;

    // "Up to date" — brief confirmation then auto-hides (hook handles the timeout)
    if (status === 'up-to-date') {
        return (
            <div className="fixed bottom-5 right-5 z-[9999] animate-slide-up">
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl backdrop-blur-md text-sm text-[var(--text-secondary)]">
                    <CheckCircle size={16} className="text-green-400 shrink-0" />
                    <span>You&apos;re on the latest version</span>
                </div>
            </div>
        );
    }

    // Error state
    if (status === 'error') {
        return (
            <div className="fixed bottom-5 right-5 z-[9999] animate-slide-up">
                <div className="w-80 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl backdrop-blur-md overflow-hidden">
                    <div className="flex items-start gap-3 p-4">
                        <AlertCircle size={18} className="text-[var(--dangerous)] shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text)]">Update failed</p>
                            <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2">
                                {error || 'An unknown error occurred.'}
                            </p>
                        </div>
                        <button
                            onClick={dismiss}
                            className="shrink-0 p-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors"
                            aria-label="Dismiss"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="flex items-center justify-end gap-2 px-4 pb-3">
                        <button
                            onClick={checkForUpdates}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 transition-colors"
                        >
                            <RefreshCw size={12} />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Downloading / Installing
    if (status === 'downloading' || status === 'installing') {
        const isInstalling = status === 'installing';
        return (
            <div className="fixed bottom-5 right-5 z-[9999] animate-slide-up">
                <div className="w-80 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl backdrop-blur-md overflow-hidden">
                    <div className="flex items-center gap-3 p-4">
                        <Loader2
                            size={18}
                            className="text-[var(--accent)] shrink-0 animate-spin"
                        />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[var(--text)]">
                                {isInstalling ? 'Installing update…' : 'Downloading update…'}
                            </p>
                            {!isInstalling && (
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    {progress}% complete
                                </p>
                            )}
                            {isInstalling && (
                                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                    Aurelius will restart shortly
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    {!isInstalling && (
                        <div className="px-4 pb-4">
                            <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-300 ease-out"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Indeterminate shimmer for installing */}
                    {isInstalling && (
                        <div className="px-4 pb-4">
                            <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden relative">
                                <div className="absolute inset-0 bg-[var(--accent)]/60 animate-shimmer" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Update available — main notification
    if (status === 'available' && updateInfo) {
        return (
            <div className="fixed bottom-5 right-5 z-[9999] animate-slide-up">
                <div className="w-80 rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-xl backdrop-blur-md overflow-hidden">
                    {/* Gold accent top bar */}
                    <div className="h-1 w-full bg-gradient-to-r from-amber-500/0 via-amber-500 to-amber-500/0" />

                    <div className="flex items-start gap-3 p-4">
                        <div className="shrink-0 mt-0.5 p-1.5 rounded-lg bg-amber-500/10">
                            <ArrowUpCircle size={18} className="text-amber-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text)]">
                                Update available
                            </p>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                                Aurelius <span className="font-mono text-amber-400">v{updateInfo.version}</span> is ready
                            </p>
                            {updateInfo.body && (
                                <p className="text-xs text-[var(--text-secondary)] mt-2 line-clamp-3 leading-relaxed">
                                    {updateInfo.body}
                                </p>
                            )}
                        </div>
                        <button
                            onClick={dismiss}
                            className="shrink-0 p-1 rounded-md hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] transition-colors"
                            aria-label="Dismiss"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 px-4 pb-4">
                        <button
                            onClick={dismiss}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                            Later
                        </button>
                        <button
                            onClick={downloadAndInstall}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 transition-colors"
                        >
                            <Download size={12} />
                            Update now
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
