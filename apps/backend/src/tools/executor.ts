import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, stat, access, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import { tavily } from '@tavily/core';
import { getSettings } from '../config/settings.store';

const execAsync = promisify(exec);

const DEFAULT_APP_SEARCH_ROOTS = [
    'C:\\Program Files',
    'C:\\Program Files (x86)',
    'C:\\Users\\UsEr\\AppData\\Local',
    'C:\\Users\\UsEr\\AppData\\Roaming',
];

const DEFAULT_FILE_SEARCH_ROOTS = [
    'C:\\Users\\UsEr\\Desktop',
    'C:\\Users\\UsEr\\Documents',
    'C:\\Users\\UsEr\\Downloads',
    'C:\\Users\\UsEr\\Pictures',
    'C:\\Users\\UsEr\\Videos',
];

const MAX_SEARCH_DEPTH = 4;
const MAX_MATCHES = 12;
const MAX_FILE_READ_BYTES = 256 * 1024; // 256 KB
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.lnk', '.bat', '.cmd']);
const TEXT_FILE_EXTENSIONS = new Set([
    '.txt', '.md', '.json', '.js', '.ts', '.tsx', '.jsx', '.py', '.java',
    '.c', '.cpp', '.cs', '.rs', '.go', '.php', '.html', '.css', '.scss',
    '.xml', '.yml', '.yaml', '.ini', '.env', '.sql', '.toml', '.log',
]);

const BLOCKED_COMMAND_PATTERNS = [
    /(^|\s)del(\s|$)/i,
    /(^|\s)rmdir(\s|$)/i,
    /(^|\s)rd(\s|$)/i,
    /(^|\s)format(\s|$)/i,
    /(^|\s)shutdown(\s|$)/i,
    /(^|\s)restart-computer(\s|$)/i,
    /(^|\s)stop-computer(\s|$)/i,
    /(^|\s)remove-item(\s|$)/i,
    /(^|\s)erase(\s|$)/i,
    /(^|\s)sc(\s+stop|\s+delete)/i,
    /(^|\s)taskkill(\s|$)/i,
];

interface AppCandidate {
    path: string;
    score: number;
    reason: string;
}

function normalizeForMatch(value: string): string {
    return value
        .toLowerCase()
        .replace(/[_\-().[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(value: string): string[] {
    return normalizeForMatch(value).split(' ').filter(Boolean);
}

function truncate(text: string, max = 4000): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isSuspiciousPath(targetPath: string): boolean {
    return /[<>|`]/.test(targetPath) || targetPath.includes('..');
}

function normalizePathForCompare(targetPath: string): string {
    return targetPath
        .replace(/\//g, '\\')
        .replace(/\\+$/, '')
        .toLowerCase();
}

function isWithinRoot(targetPath: string, rootPath: string): boolean {
    const target = normalizePathForCompare(targetPath);
    const root = normalizePathForCompare(rootPath);
    return target === root || target.startsWith(`${root}\\`);
}

function parseConfiguredRoots(rawRoots: unknown, fallback: string[]): string[] {
    if (!Array.isArray(rawRoots)) return fallback;
    const roots = rawRoots
        .map(value => String(value).trim())
        .filter(Boolean)
        .filter(value => !isSuspiciousPath(value));
    return roots.length > 0 ? roots : fallback;
}

function getRootAliasMap(): Map<string, string> {
    const map = new Map<string, string>();

    for (const root of getAllowedReadRoots()) {
        const normalizedRoot = root.replace(/\//g, '\\').replace(/\\+$/, '');
        const parts = normalizedRoot.split('\\').filter(Boolean);
        const last = parts[parts.length - 1];
        if (!last) continue;

        map.set(normalizeForMatch(last), normalizedRoot);
    }

    return map;
}

function resolveReadPath(inputPath: string): string {
    const trimmed = inputPath.trim();
    if (!trimmed) return trimmed;

    const normalizedInput = trimmed.replace(/\//g, '\\').replace(/^\\+/, '');
    const aliasMap = getRootAliasMap();

    if (!normalizedInput.includes('\\') && aliasMap.has(normalizeForMatch(normalizedInput))) {
        return aliasMap.get(normalizeForMatch(normalizedInput))!;
    }

    const segments = normalizedInput.split('\\').filter(Boolean);

    const firstSegment = segments[0] ?? '';
    const aliasRoot = aliasMap.get(normalizeForMatch(firstSegment));

    if (aliasRoot) {
        const rest = normalizedInput.slice(firstSegment.length).replace(/^\\+/, '');
        return rest ? join(aliasRoot, rest) : aliasRoot;
    }

    for (let i = 0; i < segments.length; i++) {
        const candidateRoot = aliasMap.get(normalizeForMatch(segments[i]));
        if (!candidateRoot) continue;

        const rest = segments.slice(i + 1).join('\\');
        return rest ? join(candidateRoot, rest) : candidateRoot;
    }

    return trimmed;
}

function getConfiguredAppSearchRoots(): string[] {
    const settings = getSettings() as Record<string, unknown>;
    return parseConfiguredRoots(settings.appSearchRoots, DEFAULT_APP_SEARCH_ROOTS);
}

function getDefaultFileRoot(): string | null {
    const settings = getSettings() as Record<string, unknown>;
    const configuredDefault = String(settings.defaultFileRoot ?? '').trim();

    if (configuredDefault && !isSuspiciousPath(configuredDefault)) {
        return configuredDefault;
    }

    return DEFAULT_FILE_SEARCH_ROOTS[0] ?? null;
}

function getAllowedReadRoots(): string[] {
    const settings = getSettings() as Record<string, unknown>;
    const roots = parseConfiguredRoots(settings.allowedReadRoots, DEFAULT_FILE_SEARCH_ROOTS);
    return roots.length > 0 ? roots : DEFAULT_FILE_SEARCH_ROOTS;
}

function getAllowedWriteRoot(): string | null {
    const settings = getSettings() as Record<string, unknown>;
    const root = String(settings.allowedWriteRoot ?? '').trim();
    if (!root || isSuspiciousPath(root)) return null;
    return root;
}

function isAllowedReadPath(targetPath: string): boolean {
    return getAllowedReadRoots().some(root => isWithinRoot(targetPath, root));
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

function scoreCandidate(appName: string, fullPath: string): AppCandidate | null {
    const fileName = basename(fullPath, extname(fullPath));
    const normalizedQuery = normalizeForMatch(appName);
    const normalizedFile = normalizeForMatch(fileName);
    const normalizedPath = normalizeForMatch(fullPath);

    let score = 0;
    const reasons: string[] = [];

    if (normalizedFile === normalizedQuery) {
        score += 120;
        reasons.push('exact filename match');
    } else if (normalizedFile.includes(normalizedQuery)) {
        score += 90;
        reasons.push('filename contains query');
    } else if (normalizedQuery.includes(normalizedFile) && normalizedFile.length >= 3) {
        score += 70;
        reasons.push('query contains filename');
    }

    const queryTokens = tokenize(appName);
    const fileTokens = tokenize(fileName);
    const pathTokens = tokenize(fullPath);

    let tokenHits = 0;
    for (const token of queryTokens) {
        if (fileTokens.includes(token)) {
            score += 18;
            tokenHits++;
        } else if (pathTokens.includes(token) || normalizedPath.includes(token)) {
            score += 8;
            tokenHits++;
        }
    }

    if (tokenHits > 0) {
        reasons.push(`${tokenHits} token match${tokenHits > 1 ? 'es' : ''}`);
    }

    if (normalizedPath.includes('launcher')) {
        score += 8;
        reasons.push('launcher path');
    }

    if (normalizedPath.includes('uninstall')) {
        score -= 60;
        reasons.push('penalized uninstall file');
    }

    if (normalizedPath.includes('setup') || normalizedPath.includes('installer')) {
        score -= 30;
        reasons.push('penalized installer file');
    }

    if (score <= 0) return null;

    return {
        path: fullPath,
        score,
        reason: reasons.join(', ') || 'heuristic match',
    };
}

async function walkForExecutables(
    root: string,
    appName: string,
    depth = 0,
    results: AppCandidate[] = [],
): Promise<AppCandidate[]> {
    if (depth > MAX_SEARCH_DEPTH || results.length >= MAX_MATCHES) {
        return results;
    }

    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
        const rawEntries = await readdir(root, { withFileTypes: true });
        entries = rawEntries.map(entry => ({
            name: String(entry.name),
            isDirectory: () => entry.isDirectory(),
        }));
    } catch {
        return results;
    }

    for (const entry of entries) {
        if (results.length >= MAX_MATCHES) break;

        const fullPath = join(root, entry.name);
        const normalizedEntry = normalizeForMatch(entry.name);

        if (entry.isDirectory()) {
            const queryTokens = tokenize(appName);
            const shouldPrioritize =
                queryTokens.some(token => normalizedEntry.includes(token)) ||
                normalizedEntry.includes('launcher') ||
                depth < 1;

            if (shouldPrioritize) {
                await walkForExecutables(fullPath, appName, depth + 1, results);
            }
            continue;
        }

        const ext = extname(entry.name).toLowerCase();
        if (!EXECUTABLE_EXTENSIONS.has(ext)) continue;

        const candidate = scoreCandidate(appName, fullPath);
        if (candidate) {
            results.push(candidate);
        }
    }

    return results;
}

async function findApplicationExecutable(appName: string): Promise<string> {
    const existingRoots: string[] = [];
    for (const root of getConfiguredAppSearchRoots()) {
        if (await pathExists(root)) existingRoots.push(root);
    }

    if (existingRoots.length === 0) {
        return 'Error: No common Windows application directories were found.';
    }

    const allMatches: AppCandidate[] = [];

    for (const root of existingRoots) {
        const matches = await walkForExecutables(root, appName);
        allMatches.push(...matches);
    }

    const uniqueMatches = Array.from(
        new Map(allMatches.map(match => [match.path.toLowerCase(), match])).values(),
    );

    uniqueMatches.sort((a, b) => b.score - a.score);

    if (uniqueMatches.length === 0) {
        return `No installed application executable was found for "${appName}" in common install paths.`;
    }

    const best = uniqueMatches[0];
    const preview = uniqueMatches
        .slice(0, 5)
        .map((match, index) => `${index + 1}. ${match.path} (score: ${match.score}, ${match.reason})`)
        .join('\n');

    return [
        `Best match for "${appName}":`,
        best.path,
        '',
        `Top matches (${Math.min(uniqueMatches.length, 5)} shown):`,
        preview,
    ].join('\n');
}

async function walkForFiles(
    root: string,
    query: string,
    depth = 0,
    results: string[] = [],
): Promise<string[]> {
    if (depth > MAX_SEARCH_DEPTH || results.length >= MAX_MATCHES) {
        return results;
    }

    let rawEntries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
        const entries = await readdir(root, { withFileTypes: true });
        rawEntries = entries.map(entry => ({
            name: String(entry.name),
            isDirectory: () => entry.isDirectory(),
        }));
    } catch {
        return results;
    }

    const normalizedQuery = normalizeForMatch(query);

    for (const entry of rawEntries) {
        if (results.length >= MAX_MATCHES) break;

        const fullPath = join(root, entry.name);
        const normalizedName = normalizeForMatch(entry.name);

        if (entry.isDirectory()) {
            const shouldTraverse =
                depth < 1 ||
                tokenize(query).some(token => normalizedName.includes(token));
            if (shouldTraverse) {
                await walkForFiles(fullPath, query, depth + 1, results);
            }
            continue;
        }

        if (normalizedName.includes(normalizedQuery) || normalizedQuery === extname(entry.name).toLowerCase()) {
            results.push(fullPath);
        }
    }

    return results;
}

async function findFiles(rootPath: string, query: string): Promise<string> {
    const resolvedRootPath = resolveReadPath(rootPath);

    if (isSuspiciousPath(resolvedRootPath)) {
        return `Error: Invalid root path "${rootPath}".`;
    }

    if (!isAllowedReadPath(resolvedRootPath)) {
        return `Error: Root path "${resolvedRootPath}" is outside the allowed file roots.`;
    }

    if (!(await pathExists(resolvedRootPath))) {
        return `Error: Root path "${resolvedRootPath}" does not exist.`;
    }

    const matches = await walkForFiles(resolvedRootPath, query);

    if (matches.length === 0) {
        return `No files matching "${query}" were found in "${resolvedRootPath}".`;
    }

    return [
        `Found ${matches.length} file${matches.length > 1 ? 's' : ''} for "${query}" in "${resolvedRootPath}":`,
        ...matches.map((m, i) => `${i + 1}. ${m}`),
    ].join('\n');
}

function isProbablyTextFile(filePath: string): boolean {
    return TEXT_FILE_EXTENSIONS.has(extname(filePath).toLowerCase());
}

async function readLocalTextFile(filePath: string): Promise<string> {
    if (!filePath.trim()) return 'Error: No file path provided.';

    const resolvedFilePath = resolveReadPath(filePath);

    if (isSuspiciousPath(resolvedFilePath)) return `Error: Invalid file path "${filePath}".`;
    if (!isAllowedReadPath(resolvedFilePath)) return `Error: "${resolvedFilePath}" is outside the allowed file roots.`;

    let info;
    try {
        info = await stat(resolvedFilePath);
    } catch (e) {
        return `Error reading file "${resolvedFilePath}": ${e instanceof Error ? e.message : String(e)}`;
    }

    if (!info.isFile()) {
        return `Error: "${resolvedFilePath}" is not a file.`;
    }

    if (info.size > MAX_FILE_READ_BYTES) {
        return `Error: "${resolvedFilePath}" is too large to read safely (${Math.round(info.size / 1024)} KB).`;
    }

    if (!isProbablyTextFile(resolvedFilePath)) {
        return `Error: "${resolvedFilePath}" does not appear to be a supported text file.`;
    }

    try {
        const content = await readFile(resolvedFilePath, 'utf8');
        return [
            `Contents of "${resolvedFilePath}":`,
            truncate(content, 12000),
        ].join('\n');
    } catch (e) {
        return `Error reading file "${resolvedFilePath}": ${e instanceof Error ? e.message : String(e)}`;
    }
}

async function writeLocalTextFile(filePath: string, content: string): Promise<string> {
    if (!filePath.trim()) return 'Error: No file path provided.';
    if (isSuspiciousPath(filePath)) return `Error: Invalid file path "${filePath}".`;

    const allowedWriteRoot = getAllowedWriteRoot();
    if (!allowedWriteRoot) {
        return 'Error: No allowed write root is configured.';
    }

    if (!isWithinRoot(filePath, allowedWriteRoot)) {
        return `Error: "${filePath}" is outside the allowed write root "${allowedWriteRoot}".`;
    }

    const ext = extname(filePath).toLowerCase();
    if (ext && !TEXT_FILE_EXTENSIONS.has(ext)) {
        return `Error: Writing "${ext}" files is not allowed by this tool.`;
    }

    try {
        await access(dirname(filePath));
    } catch {
        return `Error: Parent directory does not exist for "${filePath}".`;
    }

    try {
        await writeFile(filePath, content, 'utf8');
        return `Wrote ${content.length} characters to "${filePath}" successfully.`;
    } catch (e) {
        return `Error writing file "${filePath}": ${e instanceof Error ? e.message : String(e)}`;
    }
}

async function getActiveWindow(): Promise<string> {
    const script = [
        'Add-Type @\'',
        'using System;',
        'using System.Runtime.InteropServices;',
        'using System.Text;',
        'public static class Win32 {',
        '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
        '  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);',
        '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
        '}',
        '\'@;',
        '$hwnd = [Win32]::GetForegroundWindow();',
        '$sb = New-Object System.Text.StringBuilder 1024;',
        '[void][Win32]::GetWindowText($hwnd, $sb, $sb.Capacity);',
        '$pid = 0;',
        '[void][Win32]::GetWindowThreadProcessId($hwnd, [ref]$pid);',
        '$proc = Get-Process -Id $pid -ErrorAction SilentlyContinue;',
        'if ($null -eq $proc) { "No active window information available." }',
        'else { "Active window: " + $sb.ToString() + "`nProcess: " + $proc.ProcessName + " (PID " + $proc.Id + ")" }',
    ].join(' ');

    try {
        const { stdout } = await execAsync(`powershell.exe -NoProfile -Command "${script}"`, { timeout: 6000 });
        return stdout.trim() || 'No active window information available.';
    } catch (e) {
        return `Error getting active window: ${e instanceof Error ? e.message : String(e)}`;
    }
}

async function findProcess(name: string): Promise<string> {
    if (!name.trim()) return 'Error: No process name provided.';
    if (/[;&|`$<>]/.test(name)) return `Error: Invalid process name "${name}".`;

    try {
        const { stdout } = await execAsync(
            `powershell.exe -NoProfile -Command "Get-Process | Where-Object { $_.ProcessName -like '*${name.replace(/'/g, "''")}*' } | Select-Object ProcessName,Id,MainWindowTitle | ConvertTo-Json -Compress"`,
            { timeout: 8000 },
        );

        const raw = stdout.trim();
        if (!raw) return `No running processes found for "${name}".`;

        const parsed = JSON.parse(raw) as Array<{ ProcessName: string; Id: number; MainWindowTitle?: string }> | { ProcessName: string; Id: number; MainWindowTitle?: string };
        const list = Array.isArray(parsed) ? parsed : [parsed];

        if (list.length === 0) return `No running processes found for "${name}".`;

        return [
            `Found ${list.length} running process${list.length > 1 ? 'es' : ''} for "${name}":`,
            ...list.slice(0, 10).map((p, i) =>
                `${i + 1}. ${p.ProcessName} (PID ${p.Id})${p.MainWindowTitle ? ` — ${p.MainWindowTitle}` : ''}`),
        ].join('\n');
    } catch (e) {
        return `Error finding process "${name}": ${e instanceof Error ? e.message : String(e)}`;
    }
}

async function copyToClipboard(text: string): Promise<string> {
    try {
        const escaped = text.replace(/'/g, "''");
        await execAsync(
            `powershell.exe -NoProfile -Command "Set-Clipboard -Value '${escaped}'"`,
            { timeout: 5000 },
        );
        return 'Copied text to clipboard successfully.';
    } catch (e) {
        return `Error copying to clipboard: ${e instanceof Error ? e.message : String(e)}`;
    }
}

async function takeScreenshot(): Promise<string> {
    const settings = getSettings();
    const saveDir = settings.screenshotSavePath?.trim() || 'C:\\Users\\UsEr\\Pictures\\AURELIUS';

    if (isSuspiciousPath(saveDir)) {
        return `Error: Invalid screenshot save path "${saveDir}".`;
    }

    try {
        await mkdir(saveDir, { recursive: true });
    } catch (e) {
        return `Error creating screenshot folder "${saveDir}": ${e instanceof Error ? e.message : String(e)}`;
    }

    const filePath = join(saveDir, `aurelius-screenshot-${Date.now()}.png`);
    const script = [
        'Add-Type -AssemblyName System.Windows.Forms;',
        'Add-Type -AssemblyName System.Drawing;',
        '$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;',
        '$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height;',
        '$graphics = [System.Drawing.Graphics]::FromImage($bitmap);',
        '$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);',
        `$bitmap.Save('${filePath.replace(/'/g, "''")}');`,
        '$graphics.Dispose();',
        '$bitmap.Dispose();',
        `Write-Output '${filePath.replace(/'/g, "''")}'`,
    ].join(' ');

    try {
        const { stdout } = await execAsync(
            `powershell.exe -NoProfile -Command "${script}"`,
            { timeout: 10000 },
        );
        const savedPath = stdout.trim() || filePath;
        return `Screenshot captured successfully: ${savedPath}`;
    } catch (e) {
        return `Error taking screenshot: ${e instanceof Error ? e.message : String(e)}`;
    }
}

function normalizeUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    return `https://${url}`;
}

function isSafeUrl(url: string): boolean {
    return /^https?:\/\/[^\s]+$/i.test(url);
}

function isBlockedCommand(command: string): boolean {
    return BLOCKED_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * Execute a registered tool by name with the given arguments.
 * Returns a plain-text result string that gets fed back to the LLM.
 */
export async function executeTool(
    name: string,
    args: Record<string, unknown>,
): Promise<string> {
    try {
        switch (name) {

            // ── SAFE ──────────────────────────────────────────────────

            case 'get_time': {
                const now = new Date();
                const time = now.toLocaleTimeString('en-US', {
                    timeZone: 'Asia/Bangkok',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                });
                return `Current time in Bangkok (ICT UTC+7): ${time}`;
            }

            case 'get_date': {
                const now = new Date();
                const date = now.toLocaleDateString('en-US', {
                    timeZone: 'Asia/Bangkok',
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                });
                return `Current date in Bangkok: ${date}`;
            }

            case 'get_clipboard': {
                const { stdout } = await execAsync(
                    'powershell.exe -NoProfile -Command "Get-Clipboard"',
                    { timeout: 5000 },
                );
                const text = stdout.trim();
                if (!text) return 'Clipboard is empty or does not contain text.';
                return `Clipboard contents:\n${text}`;
            }

            case 'list_directory': {
                const dirPath = String(args.path ?? '').trim();
                if (!dirPath) return 'Error: No directory path provided.';

                const resolvedDirPath = resolveReadPath(dirPath);

                if (isSuspiciousPath(resolvedDirPath)) {
                    return 'Error: Invalid directory path provided.';
                }
                if (!isAllowedReadPath(resolvedDirPath)) {
                    return `Error: Directory "${resolvedDirPath}" is outside the allowed file roots.`;
                }

                let entries: string[];
                try {
                    entries = await readdir(resolvedDirPath);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return `Error reading directory "${resolvedDirPath}": ${msg}`;
                }

                if (entries.length === 0) {
                    return `Directory "${resolvedDirPath}" is empty.`;
                }

                const lines = await Promise.all(
                    entries.map(async (name) => {
                        try {
                            const info = await stat(join(resolvedDirPath, name));
                            if (info.isDirectory()) return `[DIR]  ${name}`;
                            const kb = (info.size / 1024).toFixed(1);
                            return `[FILE] ${name}  (${kb} KB)`;
                        } catch {
                            return `[???]  ${name}`;
                        }
                    }),
                );

                return `Contents of "${resolvedDirPath}" (${entries.length} items):\n${lines.join('\n')}`;
            }

            case 'web_search': {
                const query = String(args.query ?? '').trim();
                if (!query) return 'Error: No search query provided.';

                const settings = getSettings();
                if (!settings.tavilyApiKey) {
                    return 'Error: Tavily API key is not configured. Go to Settings > Tools & Integrations to add it.';
                }

                const client = tavily({ apiKey: settings.tavilyApiKey });
                const response = await client.search(query, {
                    searchDepth: 'advanced',
                    maxResults: 5,
                    includeRawContent: true as any,
                }) as any;

                const lines: string[] = [];

                if (response.answer) {
                    lines.push(`Summary: ${response.answer}\n`);
                }

                lines.push(`Web search results for "${query}":`);

                if (Array.isArray(response?.results)) {
                    for (const result of response.results) {
                        lines.push(`\nTitle: ${result.title}`);
                        lines.push(`URL: ${result.url}`);
                        if (result.content) {
                            lines.push(`Snippet: ${result.content}`);
                        }
                        if (result.raw_content) {
                            // Include raw content but cap it so it doesn't overwhelm the context
                            const raw = result.raw_content.length > 4000
                                ? result.raw_content.slice(0, 4000) + '…'
                                : result.raw_content;
                            lines.push(`Raw Content: ${raw}`);
                        }
                    }
                }

                return lines.join('\n');
            }

            case 'web_extract': {
                const urls = args.urls;
                if (!Array.isArray(urls) || urls.length === 0) return 'Error: No urls provided.';

                const settings = getSettings();
                if (!settings.tavilyApiKey) {
                    return 'Error: Tavily API key is not configured. Go to Settings > Tools & Integrations to add it.';
                }

                const client = tavily({ apiKey: settings.tavilyApiKey });
                const response = await client.extract(urls) as any;

                const lines: string[] = [];
                lines.push(`Web extraction results:`);
                if (Array.isArray(response?.results)) {
                    for (const result of response.results) {
                        lines.push(`\nTitle: ${result.title ?? ''}`);
                        lines.push(`URL: ${result.url ?? ''}`);
                        if (result.raw_content) {
                            const raw = result.raw_content.length > 10000
                                ? result.raw_content.slice(0, 10000) + '…'
                                : result.raw_content;
                            lines.push(`Content: ${raw}`);
                        }
                    }
                }

                return lines.join('\n');
            }

            case 'web_crawl': {
                const url = String(args.url ?? '').trim();
                if (!url) return 'Error: No url provided.';

                const settings = getSettings();
                if (!settings.tavilyApiKey) {
                    return 'Error: Tavily API key is not configured. Go to Settings > Tools & Integrations to add it.';
                }

                const client = tavily({ apiKey: settings.tavilyApiKey });
                const response = await client.crawl(url, {
                    extractDepth: 'advanced'
                }) as any;

                const lines: string[] = [];
                lines.push(`Web crawl results for: ${url}`);
                if (Array.isArray(response?.results)) {
                    for (const result of response.results) {
                        lines.push(`\nURL: ${result.url ?? ''}`);
                        if (result.raw_content) {
                            const raw = result.raw_content.length > 10000
                                ? result.raw_content.slice(0, 10000) + '…'
                                : result.raw_content;
                            lines.push(`Content: ${raw}`);
                        }
                    }
                }

                return lines.join('\n');
            }

            case 'find_application': {
                const appName = String(args.name ?? '').trim();
                if (!appName) return 'Error: No application name provided.';
                if (/[;&|`$<>]/.test(appName)) {
                    return `Error: Invalid characters in application name "${appName}".`;
                }
                return await findApplicationExecutable(appName);
            }

            case 'find_files': {
                const rawRootPath = String(args.rootPath ?? '').trim();
                const query = String(args.query ?? '').trim();
                const rootPath = rawRootPath || getDefaultFileRoot() || '';
                if (!rootPath) return 'Error: No root path provided.';
                if (!query) return 'Error: No file query provided.';
                return await findFiles(rootPath, query);
            }

            case 'copy_to_clipboard': {
                const text = String(args.text ?? '');
                if (!text) return 'Error: No text provided.';
                return await copyToClipboard(text);
            }

            case 'get_active_window': {
                return await getActiveWindow();
            }

            case 'find_process': {
                const processName = String(args.name ?? '').trim();
                if (!processName) return 'Error: No process name provided.';
                return await findProcess(processName);
            }

            // ── SENSITIVE ─────────────────────────────────────────────

            case 'read_file': {
                const filePath = String(args.path ?? '').trim();
                return await readLocalTextFile(filePath);
            }

            case 'take_screenshot': {
                return await takeScreenshot();
            }

            case 'open_url': {
                const rawUrl = String(args.url ?? '').trim();
                if (!rawUrl) return 'Error: No URL provided.';

                const url = normalizeUrl(rawUrl);
                if (!isSafeUrl(url)) {
                    return `Error: Invalid URL "${rawUrl}".`;
                }

                await execAsync(
                    `powershell.exe -NoProfile -Command "Start-Process '${url.replace(/'/g, "''")}'"`,
                    { timeout: 8000 },
                );
                return `Opened URL "${url}" successfully.`;
            }

            // ── DANGEROUS ─────────────────────────────────────────────

            case 'open_app': {
                const app = String(args.app ?? '').trim();
                if (!app) return 'Error: No application name provided.';

                if (/[;&|`$<>]/.test(app)) {
                    return `Error: Invalid characters in application name "${app}".`;
                }

                try {
                    await execAsync(
                        `powershell.exe -NoProfile -Command "Start-Process '${app.replace(/'/g, "''")}'"`,
                        { timeout: 8000 },
                    );
                } catch {
                    await execAsync(`cmd.exe /c "start "" "${app}""`, { timeout: 8000 });
                }

                return `Opened "${app}" successfully.`;
            }

            case 'write_file': {
                const filePath = String(args.path ?? '').trim();
                const content = String(args.content ?? '');
                if (!filePath) return 'Error: No file path provided.';
                return await writeLocalTextFile(filePath, content);
            }

            case 'run_command': {
                const command = String(args.command ?? '').trim();
                if (!command) return 'Error: No command provided.';
                if (/[`<>]/.test(command)) {
                    return 'Error: Command contains blocked characters.';
                }
                if (isBlockedCommand(command)) {
                    return 'Error: This command is blocked for safety.';
                }

                try {
                    const { stdout, stderr } = await execAsync(command, { timeout: 12000 });
                    const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
                    return combined
                        ? `Command output:\n${truncate(combined, 8000)}`
                        : 'Command completed successfully with no output.';
                } catch (e) {
                    return `Error running command: ${e instanceof Error ? e.message : String(e)}`;
                }
            }

            case 'kill_process': {
                const nameArg = String(args.name ?? '').trim();
                const pidArg = Number(args.pid);

                if (!nameArg && !Number.isFinite(pidArg)) {
                    return 'Error: Provide either a process name or PID.';
                }

                if (nameArg && /[;&|`$<>]/.test(nameArg)) {
                    return `Error: Invalid process name "${nameArg}".`;
                }

                try {
                    if (Number.isFinite(pidArg)) {
                        await execAsync(
                            `powershell.exe -NoProfile -Command "Stop-Process -Id ${pidArg} -Force"`,
                            { timeout: 8000 },
                        );
                        return `Killed process with PID ${pidArg} successfully.`;
                    }

                    await execAsync(
                        `powershell.exe -NoProfile -Command "Get-Process -Name '${nameArg.replace(/'/g, "''").replace(/\.exe$/i, '')}' -ErrorAction Stop | Stop-Process -Force"`,
                        { timeout: 8000 },
                    );
                    return `Killed process "${nameArg}" successfully.`;
                } catch (e) {
                    return `Error killing process: ${e instanceof Error ? e.message : String(e)}`;
                }
            }

            default:
                return `Error: Unknown tool "${name}". No implementation found.`;
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return `Error executing tool "${name}": ${message}`;
    }
}
