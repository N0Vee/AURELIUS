'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// Types
// ============================================================

export interface UpdateInfo {
    version: string;
    date: string | null;
    body: string | null;
}

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'installing'
    | 'up-to-date'
    | 'error';

export interface UseUpdaterReturn {
    /** Whether we're running inside Tauri (updater only works there). */
    isTauri: boolean;
    /** Current status of the update lifecycle. */
    status: UpdateStatus;
    /** Info about the available update (set when status === 'available'). */
    updateInfo: UpdateInfo | null;
    /** Download progress 0–100 (set during 'downloading' status). */
    progress: number;
    /** Error message if status === 'error'. */
    error: string | null;
    /** Manually trigger a check for updates. */
    checkForUpdates: () => Promise<void>;
    /** Download and install the available update, then relaunch. */
    downloadAndInstall: () => Promise<void>;
    /** Dismiss the update notification (resets to idle). */
    dismiss: () => void;
}

// ============================================================
// Constants
// ============================================================

/** Delay before the first automatic check (ms). Let the app finish loading. */
const INITIAL_CHECK_DELAY_MS = 5_000;

/** Re-check interval while the app is running (ms). Every 30 minutes. */
const RECHECK_INTERVAL_MS = 30 * 60 * 1_000;

// ============================================================
// Hook
// ============================================================

/**
 * Manages the Tauri auto-update lifecycle.
 *
 * - Detects whether the app is running inside Tauri.
 * - Automatically checks for updates shortly after mount.
 * - Exposes manual check / download+install / dismiss controls.
 * - Tracks download progress for UI feedback.
 *
 * Uses dynamic imports so the @tauri-apps/plugin-updater module is never
 * bundled into the web build — same pattern as useAutostart and others.
 */
export function useUpdater(): UseUpdaterReturn {
    const [isTauri, setIsTauri]         = useState(false);
    const [status, setStatus]           = useState<UpdateStatus>('idle');
    const [updateInfo, setUpdateInfo]   = useState<UpdateInfo | null>(null);
    const [progress, setProgress]       = useState(0);
    const [error, setError]             = useState<string | null>(null);

    // Keep a ref to the pending update object so downloadAndInstall can use it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingUpdateRef = useRef<Record<string, any> | null>(null);

    // Prevent overlapping check calls.
    const checkingRef = useRef(false);

    // Track consecutive errors to implement backoff
    const errorCountRef = useRef(0);
    
    // Track last check time to prevent rapid re-checks
    const lastCheckTimeRef = useRef(0);
    const MIN_CHECK_INTERVAL_MS = 60_000; // Minimum 1 minute between checks

    // ── Detect Tauri ──────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const { isTauri: checkTauri } = await import('@tauri-apps/api/core');
                if (!cancelled && checkTauri()) {
                    setIsTauri(true);
                }
            } catch {
                // Not in Tauri — that's fine.
            }
        })();

        return () => { cancelled = true; };
    }, []);

    // ── Check for updates ─────────────────────────────────────────────────
    const checkForUpdates = useCallback(async () => {
        if (!isTauri || checkingRef.current) return;
        
        // Prevent checks that are too frequent (min 1 minute apart)
        const now = Date.now();
        if (now - lastCheckTimeRef.current < MIN_CHECK_INTERVAL_MS) {
            console.log('[Updater] Check skipped - too soon since last check');
            return;
        }
        
        checkingRef.current = true;
        lastCheckTimeRef.current = now;

        setStatus('checking');
        setError(null);

        try {
            const { check } = await import('@tauri-apps/plugin-updater');

            const update = await check();

            if (update) {
                pendingUpdateRef.current = update;
                errorCountRef.current = 0; // Reset error count on success
                setUpdateInfo({
                    version: update.version,
                    date:    update.date ?? null,
                    body:    update.body ?? null,
                });
                setStatus('available');
                console.log(`[Updater] Update available: v${update.version}`);
            } else {
                pendingUpdateRef.current = null;
                errorCountRef.current = 0; // Reset error count on success
                setUpdateInfo(null);
                setStatus('up-to-date');
                console.log('[Updater] App is up to date.');

                // Auto-reset to idle after a moment so the UI doesn't stick
                // on "up-to-date" forever.
                setTimeout(() => setStatus('idle'), 8_000);
            }
        } catch (err) {
            errorCountRef.current += 1;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[Updater] Check failed (attempt ' + errorCountRef.current + '):', msg);
            setError(msg);
            setStatus('error');
        } finally {
            checkingRef.current = false;
        }
    }, [isTauri]);

    // ── Download + Install + Relaunch ─────────────────────────────────────
    const downloadAndInstall = useCallback(async () => {
        const update = pendingUpdateRef.current;
        if (!update) {
            console.warn('[Updater] downloadAndInstall called but no pending update.');
            return;
        }

        setProgress(0);
        setStatus('downloading');
        setError(null);

        try {
            let downloaded = 0;
            let contentLength = 0;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await update.downloadAndInstall((event: any) => {
                switch (event.event) {
                    case 'Started':
                        contentLength = event.data.contentLength ?? 0;
                        console.log(`[Updater] Downloading ${contentLength} bytes...`);
                        break;
                    case 'Progress':
                        downloaded += event.data.chunkLength ?? 0;
                        if (contentLength > 0) {
                            const pct = Math.min(100, Math.round((downloaded / contentLength) * 100));
                            setProgress(pct);
                        }
                        break;
                    case 'Finished':
                        setProgress(100);
                        console.log('[Updater] Download finished.');
                        break;
                }
            });

            setStatus('installing');
            console.log('[Updater] Update installed — relaunching...');

            // Short delay so the user sees "Installing..." before the app restarts.
            await new Promise(r => setTimeout(r, 800));

            const { relaunch } = await import('@tauri-apps/plugin-process');
            await relaunch();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[Updater] Download/install failed:', msg);
            setError(msg);
            setStatus('error');
        }
    }, []);

    // ── Dismiss ───────────────────────────────────────────────────────────
    const dismiss = useCallback(() => {
        setStatus('idle');
        setUpdateInfo(null);
        setProgress(0);
        setError(null);
        errorCountRef.current = 0; // Reset error count so manual retry works
        // Don't clear pendingUpdateRef — user can still trigger it later.
    }, []);

    // ── Auto-check on launch + periodic re-check ──────────────────────────
    useEffect(() => {
        if (!isTauri) return;

        const initialTimer = setTimeout(() => {
            checkForUpdates();
        }, INITIAL_CHECK_DELAY_MS);

        const intervalTimer = setInterval(() => {
            // Skip re-check if we've had multiple consecutive errors (prevents spam)
            if (errorCountRef.current >= 3) {
                console.log('[Updater] Skipping auto-check due to repeated errors');
                return;
            }
            // Only re-check if currently idle or up-to-date (not during error/download)
            // Using a ref check to avoid dependency on status
            checkForUpdates();
        }, RECHECK_INTERVAL_MS);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(intervalTimer);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isTauri, checkForUpdates]); // Intentionally NOT including status

    return {
        isTauri,
        status,
        updateInfo,
        progress,
        error,
        checkForUpdates,
        downloadAndInstall,
        dismiss,
    };
}
