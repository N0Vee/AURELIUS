import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Re-export SDK type guards so consumers get proper type narrowing
export { isToolUIPart as isToolPart, getToolName } from 'ai';

/**
 * Merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
