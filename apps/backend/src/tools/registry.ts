import type { PermissionLevel } from '@aurelius/shared-schema';
import type { OpenAITool } from '../llm/types';

// ============================================================
// Tool Definition
// ============================================================

export interface ToolDefinition {
    name: string;
    displayName: string;
    description: string;
    permissionLevel: PermissionLevel;
    openAITool: OpenAITool;
}

// ============================================================
// Registry
// ============================================================

const _registry = new Map<string, ToolDefinition>();

function register(def: ToolDefinition): void {
    _registry.set(def.name, def);
}

export function getTool(name: string): ToolDefinition | undefined {
    return _registry.get(name);
}

export function getAllTools(): ToolDefinition[] {
    return Array.from(_registry.values());
}

export function getOpenAITools(): OpenAITool[] {
    return getAllTools().map(t => t.openAITool);
}

export function canAutoExecute(tool: ToolDefinition): boolean {
    return tool.permissionLevel === 'SAFE';
}

// ============================================================
// Tool Definitions
// ============================================================

// ── SAFE ────────────────────────────────────────────────────

register({
    name: 'get_time',
    displayName: 'Get Current Time',
    description: 'Get the current time in Bangkok timezone (ICT UTC+7)',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'get_time',
            description: 'Get the current time in Bangkok timezone (ICT UTC+7). Use this when the user asks what time it is or needs the current time.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
});

register({
    name: 'get_date',
    displayName: 'Get Current Date',
    description: 'Get the current date (day, month, year) in Bangkok timezone',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'get_date',
            description: 'Get the current date including day of week, month, and year in Bangkok timezone. Use this when the user asks what today\'s date is.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
});

register({
    name: 'get_clipboard',
    displayName: 'Read Clipboard',
    description: 'Read the current text content from the clipboard',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'get_clipboard',
            description: 'Read the current text content from the Windows clipboard. Use this when the user asks what they copied, what is in their clipboard, or wants you to act on clipboard content.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
});

register({
    name: 'list_directory',
    displayName: 'List Directory',
    description: 'List files and folders inside a directory path',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'list_directory',
            description: 'List the files and folders inside a given directory. Use this when the user asks what files are in a folder, wants to browse a directory, or asks about folder contents. Prefer allowed folder aliases such as "Desktop", "Documents", "Downloads", "Pictures", and "Videos" instead of guessing full C:\\Users\\<name> paths.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The directory path to list. Prefer folder aliases like "Desktop", "Documents", "Downloads", "Pictures", "Videos" instead of guessing full C:\\Users paths. e.g. "Documents", "Downloads\\projects"',
                    },
                },
                required: ['path'],
            },
        },
    },
});

register({
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the web using Tavily and return relevant results',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'web_search',
            description: 'Search the internet for up-to-date information using Tavily. Use this when you need to find new information, look up facts, or search for a topic. Do NOT use this if the user already provides a specific URL — use web_extract instead.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query to look up. Be specific and concise. e.g. "latest iPhone 16 price", "how to cook pad thai"',
                    },
                },
                required: ['query'],
            },
        },
    },
});

register({
    name: 'web_extract',
    displayName: 'Web Extract',
    description: 'Extract raw content from specific URLs using Tavily',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'web_extract',
            description: 'Extract and read raw content from specific web URLs. Use this when the user provides specific URLs and asks you to summarize, read, or extract content from them. Prefer this over web_crawl for single pages. Do NOT use open_url or run_command to read web content.',
            parameters: {
                type: 'object',
                properties: {
                    urls: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Array of URLs to extract content from.',
                    },
                },
                required: ['urls'],
            },
        },
    },
});

register({
    name: 'web_crawl',
    displayName: 'Web Crawl',
    description: 'Crawl a specific URL to gather extended information using Tavily',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'web_crawl',
            description: 'Crawl a specific URL to gather extended information across multiple linked pages within the same domain. Only use this if you need deep exploration of a website beyond a single page. For single pages, use web_extract instead.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to crawl.',
                    },
                },
                required: ['url'],
            },
        },
    },
});

register({
    name: 'find_application',
    displayName: 'Find Application',
    description: 'Find an installed Windows application executable by name',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'find_application',
            description: 'Find the executable path of an installed Windows application by name. Use this before open_app if the app name is ambiguous or the direct launch name may not work. IMPORTANT: The result contains the exact executable path — use it verbatim with open_app.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The application name to search for. e.g. "Netmarble Launcher", "Visual Studio Code", "Chrome"',
                    },
                },
                required: ['name'],
            },
        },
    },
});

register({
    name: 'find_files',
    displayName: 'Find Files',
    description: 'Search for files by name in a directory tree',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'find_files',
            description: 'Search for files by filename pattern or partial name in a directory tree. Use this when the user asks to find, locate, or search for a file such as a resume, invoice, PDF, image, or specific extension. Prefer allowed folder aliases such as "Desktop", "Documents", "Downloads", "Pictures", and "Videos" for rootPath instead of inventing full C:\\Users\\<name> paths. IMPORTANT: The results contain exact full file paths — you MUST copy and use those exact paths verbatim in subsequent tool calls (open_file, read_file, etc.). NEVER modify, shorten, or guess a different path.',
            parameters: {
                type: 'object',
                properties: {
                    rootPath: {
                        type: 'string',
                        description: 'The root directory to search inside. Prefer allowed folder aliases like "Desktop", "Documents", "Downloads", "Pictures", or "Videos". If needed, an absolute path may be used only when it is already known and allowed.',
                    },
                    query: {
                        type: 'string',
                        description: 'The filename query or partial filename to search for. e.g. "resume", ".pdf", "invoice"',
                    },
                },
                required: ['rootPath', 'query'],
            },
        },
    },
});

register({
    name: 'copy_to_clipboard',
    displayName: 'Copy To Clipboard',
    description: 'Copy text to the system clipboard',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'copy_to_clipboard',
            description: 'Copy the provided text to the Windows clipboard. Use this when the user asks you to copy text, code, a path, or a URL.',
            parameters: {
                type: 'object',
                properties: {
                    text: {
                        type: 'string',
                        description: 'The text to copy to the clipboard.',
                    },
                },
                required: ['text'],
            },
        },
    },
});

register({
    name: 'get_active_window',
    displayName: 'Get Active Window',
    description: 'Get the currently focused window title and process',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'get_active_window',
            description: 'Get information about the currently focused window, including its title and owning process. Use this when the user asks what app or window is currently active.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
});

register({
    name: 'find_process',
    displayName: 'Find Process',
    description: 'Find running processes by name',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'find_process',
            description: 'Find currently running processes by name or partial name. Use this when the user asks whether an app is running, wants to check a process, or before using kill_process to confirm the target.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The process name or partial name to search for. e.g. "chrome", "discord", "code"',
                    },
                },
                required: ['name'],
            },
        },
    },
});

// ── SENSITIVE ───────────────────────────────────────────────

register({
    name: 'open_url',
    displayName: 'Open URL',
    description: 'Open a URL in the default web browser',
    permissionLevel: 'SENSITIVE',
    openAITool: {
        type: 'function',
        function: {
            name: 'open_url',
            description: 'Open a web URL (http/https) in the system default browser. Use this ONLY for websites, documentation pages, or web links. Do NOT use this for local files — use open_file instead.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The web URL to open. Must start with http:// or https://. e.g. "https://example.com"',
                    },
                },
                required: ['url'],
            },
        },
    },
});

register({
    name: 'open_file',
    displayName: 'Open File',
    description: 'Open a local file with its default application',
    permissionLevel: 'SENSITIVE',
    openAITool: {
        type: 'function',
        function: {
            name: 'open_file',
            description: 'Open a local file using the default application associated with its file type. Use this when the user asks to open, view, or show a local file such as an image (.png, .jpg, .gif, .bmp, .webp), PDF, video, audio, document, or any other file that should be opened by its default program. Prefer allowed folder aliases such as "Desktop", "Documents", "Downloads", "Pictures", and "Videos" instead of guessing full paths.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The local file path to open. e.g. "Pictures\\photo.png", "Documents\\report.pdf", "Downloads\\video.mp4"',
                    },
                },
                required: ['path'],
            },
        },
    },
});

register({
    name: 'read_file',
    displayName: 'Read File',
    description: 'Read the contents of a local text file',
    permissionLevel: 'SENSITIVE',
    openAITool: {
        type: 'function',
        function: {
            name: 'read_file',
            description: 'Read the text contents of a local file. Use this when the user asks what is inside a text-based file, wants a file summarised, or asks you to inspect a document (.txt, .md, .json, .csv, .log, .py, .ts, .js, etc.). This is for READING text content only — to OPEN/VIEW a file visually (images, PDFs, videos), use open_file instead.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The file path to read. Prefer allowed folder aliases like "Desktop\\notes.txt", "Documents\\report.md", "Downloads\\data.json" rather than guessing full C:\\Users paths.',
                    },
                },
                required: ['path'],
            },
        },
    },
});

register({
    name: 'take_screenshot',
    displayName: 'Take Screenshot',
    description: 'Capture the current screen and save it to a temporary file',
    permissionLevel: 'SENSITIVE',
    openAITool: {
        type: 'function',
        function: {
            name: 'take_screenshot',
            description: 'Capture a screenshot of the current screen and save it to a file. Use this when the user asks what is on screen, wants to capture the display, or needs visual context. After taking the screenshot, if the user wants to see or view it, use open_file with the returned file path.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
});

// ── DANGEROUS ───────────────────────────────────────────────

register({
    name: 'open_app',
    displayName: 'Open Application',
    description: 'Open a Windows application by name or executable path',
    permissionLevel: 'DANGEROUS',
    openAITool: {
        type: 'function',
        function: {
            name: 'open_app',
            description: 'Open a Windows APPLICATION by name or executable. Do NOT use this to open files (images, PDFs, documents, videos) — use open_file for that. This is ONLY for launching programs like "notepad", "spotify", "code", "chrome".',
            parameters: {
                type: 'object',
                properties: {
                    app: {
                        type: 'string',
                        description: 'The application name or executable. e.g. "notepad", "spotify", "code", "chrome". Do NOT pass file paths here.',
                    },
                },
                required: ['app'],
            },
        },
    },
});

register({
    name: 'write_file',
    displayName: 'Write File',
    description: 'Create or overwrite a local text file',
    permissionLevel: 'DANGEROUS',
    openAITool: {
        type: 'function',
        function: {
            name: 'write_file',
            description: 'Create or overwrite a local text file with the provided content. Use this when the user explicitly asks to save, create, or write content to a file.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The file path to write. Prefer allowed folder aliases like "Desktop\\notes.txt", "Documents\\output.md" rather than guessing full C:\\Users paths.',
                    },
                    content: {
                        type: 'string',
                        description: 'The full text content to write to the file.',
                    },
                },
                required: ['path', 'content'],
            },
        },
    },
});

register({
    name: 'run_command',
    displayName: 'Run Command',
    description: 'Run a Windows shell command with restrictions',
    permissionLevel: 'DANGEROUS',
    openAITool: {
        type: 'function',
        function: {
            name: 'run_command',
            description: 'Run a Windows shell command as a LAST RESORT. Do NOT use this to open files (use open_file), open URLs (use open_url), open apps (use open_app), read files (use read_file), list directories (use list_directory), or write files (use write_file). Only use run_command for tasks that have no dedicated tool, such as running scripts, pip install, system diagnostics, or chained shell commands.',
            parameters: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command to run.',
                    },
                },
                required: ['command'],
            },
        },
    },
});

register({
    name: 'kill_process',
    displayName: 'Kill Process',
    description: 'Terminate a running process by name or PID',
    permissionLevel: 'DANGEROUS',
    openAITool: {
        type: 'function',
        function: {
            name: 'kill_process',
            description: 'Terminate a running process by name or PID. Use this only when the user explicitly asks to close, stop, or kill a process. Consider using find_process first to confirm the process exists.',
            parameters: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'The process name to terminate. e.g. "chrome.exe". Optional if pid is provided.',
                    },
                    pid: {
                        type: 'number',
                        description: 'The numeric process ID to terminate. Optional if name is provided.',
                    },
                },
                required: [],
            },
        },
    },
});
