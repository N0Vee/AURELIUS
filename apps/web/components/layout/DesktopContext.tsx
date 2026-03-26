'use client';

import { createContext, useContext } from 'react';

export const DesktopContext = createContext<boolean>(false);

export function useIsDesktop() {
    return useContext(DesktopContext);
}
