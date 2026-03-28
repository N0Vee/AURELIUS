'use client';

import { useCallback } from 'react';

/**
 * Hook that returns an `onMouseDown` handler which initiates Tauri window
 * dragging programmatically.
 *
 * When the frontend is served via `tauri-plugin-localhost` (real HTTP) instead
 * of Tauri's custom protocol (`tauri://localhost`), the built-in
 * `data-tauri-drag-region` attribute no longer works because Tauri's init
 * script isn't injected into HTTP-served pages.
 *
 * This hook replaces that by dynamically importing the Tauri window API and
 * calling `startDragging()` on mousedown.
 *
 * Usage:
 * ```tsx
 * const onDrag = useTauriDrag();
 * <div onMouseDown={onDrag} className="select-none cursor-grab">
 *   Drag me
 * </div>
 * ```
 */
export function useTauriDrag() {
    const onMouseDown = useCallback(async (e: React.MouseEvent) => {
        // Only respond to primary (left) mouse button
        if (e.button !== 0) return;

        // Don't initiate drag if the click target is an interactive element
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea, select, [role="button"]')) {
            return;
        }

        try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().startDragging();
        } catch {
            // Not running in Tauri — silently ignore
        }
    }, []);

    return onMouseDown;
}
