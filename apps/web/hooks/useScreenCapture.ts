'use client';

import { useState, useCallback } from 'react';

export function useScreenCapture() {
    const [pendingImage, setPendingImage] = useState<string | null>(null);

    const captureScreen = useCallback(async (): Promise<string | null> => {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: 'monitor' } as MediaTrackConstraints,
            });

            const video = document.createElement('video');
            video.srcObject = stream;
            video.autoplay = true;

            await new Promise<void>((resolve) => {
                video.onloadedmetadata = () => {
                    video.play();
                    resolve();
                };
            });

            // Small delay to ensure the frame is fully rendered
            await new Promise((r) => setTimeout(r, 200));

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                stream.getTracks().forEach((t) => t.stop());
                return null;
            }

            ctx.drawImage(video, 0, 0);
            stream.getTracks().forEach((t) => t.stop());

            const dataUrl = canvas.toDataURL('image/png');
            setPendingImage(dataUrl);
            return dataUrl;
        } catch {
            // User cancelled or API not available
            return null;
        }
    }, []);

    const pasteFromClipboard = useCallback(async (): Promise<string | null> => {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find((t) => t.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    return new Promise<string | null>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                            const result = reader.result as string;
                            setPendingImage(result);
                            resolve(result);
                        };
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                }
            }
            return null;
        } catch {
            return null;
        }
    }, []);

    const clearPendingImage = useCallback(() => {
        setPendingImage(null);
    }, []);

    return {
        pendingImage,
        setPendingImage,
        captureScreen,
        pasteFromClipboard,
        clearPendingImage,
    };
}
