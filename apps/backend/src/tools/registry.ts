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
            description: 'Get the current time in Bangkok timezone (ICT UTC+7). Use this when the user asks what time it is.',
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
            description: 'Get the current date including day of week, month, and year in Bangkok timezone.',
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
                        description: 'The absolute directory path to list. e.g. "C:\\Users\\User\\Downloads", "C:\\Users\\User\\Desktop"',
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
            description: 'Search the internet for up-to-date information using Tavily. Use this when the user asks you to look something up, find current information, or research a topic online.',
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
    name: 'find_application',
    displayName: 'Find Application',
    description: 'Find an installed Windows application executable by name',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'find_application',
            description: 'Find the executable path of an installed Windows application by name. Use this before opening an app if the app name is ambiguous or the direct launch name may not work.',
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
    description: 'Find files by name pattern inside a directory',
    permissionLevel: 'SAFE',
    openAITool: {
        type: 'function',
        function: {
            name: 'find_files',
            description: 'Search for files by filename pattern or partial name in a directory tree. Use this when the user asks to find a file such as a resume, invoice, PDF, or specific extension. Prefer allowed folder aliases such as "Desktop", "Documents", "Downloads", "Pictures", and "Videos" for rootPath instead of inventing full C:\\Users\\<name> paths.',
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
            description: 'Find currently running processes by name or partial name. Use this when the user asks whether an app is running or wants to inspect a process.',
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
            description: 'Open a URL in the system default browser. Use this when the user asks to open a website, documentation page, or web link.',
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to open. e.g. "https://example.com"',
                    },
                },
                required: ['url'],
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
            description: 'Read the contents of a local text file. Use this when the user asks what is inside a file, wants a file summarised, or asks you to inspect a text-based document. Prefer paths under allowed folder aliases such as "Desktop", "Documents", "Downloads", "Pictures", and "Videos" instead of guessing full C:\\Users\\<name> paths.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The file path to read. Prefer allowed folder aliases like "Desktop\\file.txt", "Documents\\notes.md", or "Pictures\\image.png" rather than guessed absolute C:\\Users paths.',
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
            description: 'Capture a screenshot of the current screen. Use this when the user asks what is on screen, wants to capture the display, or needs visual context.',
            parameters: {
                type: 'object',
                properties: {},
                required: [],
            },
        },
    },
});

// register({
//     name: 'open_url',
//     displayName: 'Open URL',
//     description: 'Open a URL in the default web browser',
//     permissionLevel: 'SENSITIVE',
//     openAITool: {
//         type: 'function',
//         function: {
//             name: 'open_url',
//             description: 'Open a URL in the system default browser without creating a controlled browser automation session. Use this only when the user simply wants a link opened and no follow-up browser interaction, reading, clicking, or typing is needed. For automation workflows, prefer browser_open instead.',
//             parameters: {
//                 type: 'object',
//                 properties: {
//                     url: {
//                         type: 'string',
//                         description: 'The URL to open. e.g. "https://example.com"',
//                     },
//                 },
//                 required: ['url'],
//             },
//         },
//     },
// });

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
            description: 'Open a Windows application. Use this when the user asks to open or launch an app. For ambiguous installed apps, prefer using find_application first.',
            parameters: {
                type: 'object',
                properties: {
                    app: {
                        type: 'string',
                        description: 'The application name or executable. e.g. "notepad", "spotify", "code", "chrome"',
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
            description: 'Create or overwrite a local text file with the provided content. Use this when the user explicitly asks to save content to a file.',
            parameters: {
                type: 'object',
                properties: {
                    path: {
                        type: 'string',
                        description: 'The absolute path of the file to write.',
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
            description: 'Run a Windows command for diagnostics or automation. Use this only when the user explicitly asks to run a command or script.',
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
            description: 'Terminate a running process by name or PID. Use this only when the user explicitly asks to close or kill a process.',
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
