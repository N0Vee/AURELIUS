'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export const DesktopContext = createContext<boolean>(false);

export function useIsDesktop() {
    return useContext(DesktopContext);
}

export function DesktopDetector({ children }: { children: React.ReactNode }) {
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        import('@tauri-apps/api/core')
            .then(({ isTauri }) => {
                const desktop = isTauri();
                setIsDesktop(desktop);
                if (desktop) {
                    document.documentElement.classList.add('tauri');

                    // On Windows, the webview has its own opaque background that must
                    // be explicitly zeroed — alpha: 0 is the only value that works.
                    import('@tauri-apps/api/webview')
                        .then(({ getCurrentWebview }) => {
                            getCurrentWebview().setBackgroundColor({ red: 0, green: 0, blue: 0, alpha: 0 });
                        })
                        .catch(() => {});
                }
            })
            .catch(() => setIsDesktop(false));
    }, []);

    return (
        <DesktopContext.Provider value={isDesktop}>
            {children}
        </DesktopContext.Provider>
    );
}
