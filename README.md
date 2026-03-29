# 🏛️ AURELIUS
**Local-First Personal AI Assistant for Windows**

AURELIUS is a privacy-first AI assistant built for Windows with a local-first architecture, configurable LLM providers, real-time chat streaming, guarded tool execution, a browser automation extension, a skills system, a custom automations engine, and an evolving voice pipeline. It is designed to feel like a personal operating layer for your machine: chat with it, let it inspect local files, launch applications, control your browser, execute multi-step automations, and interact with system tools — all with explicit safety controls.

---

## ✨ Current Highlights

- **Local-first by design** with support for local inference via Ollama
- **Configurable cloud fallback** via OpenRouter
- **Tauri desktop app** — installable Windows application with the backend bundled as a sidecar
- **Zen Browser extension** — full browser automation via a WebSocket bridge
- **Skills system** — SKILL.md behavioral overlays (Coder, Writer, Focus, custom) with per-skill temperature
- **Custom automations engine** — build named, multi-step tool chains from the UI
- **Live hardware dashboard** — CPU, memory, and GPU (NVIDIA) stats with SSE streaming
- **Runtime settings UI** for provider, model, prompts, temperature, token limits, and tool-related paths
- **Guarded tool-calling system** with `SAFE`, `SENSITIVE`, and `DANGEROUS` permission levels
- **Real-time streaming chat** over SSE
- **Windows-focused desktop tools** for files, apps, clipboard, screenshots, and system interaction
- **Python audio engine** for speech processing and TTS
- **Thai + English usage** with prompt-level behavior tuning

---

## 🧠 What AURELIUS Can Do

AURELIUS currently supports:

- Conversational chat with streamed responses
- Switching between **Ollama** and **OpenRouter** at runtime
- Activating **Skills** to change the assistant's behavior, tone, and temperature on the fly
- Running **custom multi-step automations** from a single chat command
- Full **Zen Browser control** — navigate, read pages, click, type, scroll, manage tabs, run JS
- Tool use with approval gates for sensitive or dangerous actions
- Local file browsing and reading inside configured allowed roots
- File writing inside a configured write-safe root
- App discovery and launching
- Clipboard read/copy
- Screenshot capture to a configurable folder
- Web search through Tavily
- Process inspection and termination
- Command execution with basic safety restrictions
- Real-time hardware stats via a live dashboard
- Voice-mode infrastructure through a separate audio engine service

---

## 🏗️ Architecture Overview

AURELIUS is a Bun-based monorepo with a split frontend / backend / services / extensions architecture.

### Applications
- `apps/web` — Next.js frontend for chat, dashboard, settings, and skills UI; also the Tauri desktop shell
- `apps/backend` — Bun + Elysia backend for chat orchestration, tool calling, automations, skills, settings, SSE, and the browser bridge

### Services
- `services/audio-engine` — Python FastAPI audio service for speech processing and TTS

### Packages
- `packages/shared-schema` — Shared Zod schemas used across the monorepo

### Extensions
- `extensions/zen-aurelius` — Firefox/Zen Browser extension that connects to the backend over WebSocket and exposes DOM automation to the AI

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 16**
- **React 19**
- **Tailwind CSS v4**
- **Framer Motion**
- **React Markdown**
- Custom hooks: `useChat`, `useChatSessions`, `useSkills`, `useAutomations`, `useSettings`, `useSystemStats`, `useAudioEngine`, `useScreenCapture`, `useDesktopBackend`, `useTauriDrag`

### Backend
- **Bun**
- **Elysia**
- **Zod v4**
- **Server-Sent Events (SSE)** for streaming chat / tool / automation events
- **WebSocket** for the browser extension bridge

### Desktop
- **Tauri v2** — wraps the Next.js frontend as a native Windows app
- **NSIS** installer bundled via `bun run build:desktop`
- Backend compiled to a standalone binary and embedded as a Tauri sidecar

### LLM Providers
- **Ollama** — local model inference
- **OpenRouter** — configurable cloud provider with runtime-selectable model

### Audio Engine
- **Python**
- **FastAPI**
- **faster-whisper**
- **Silero VAD**
- **edge-tts**

### External Integrations
- **Tavily** for web search

---

## 🤖 LLM Provider System

AURELIUS supports multiple providers through a runtime provider abstraction.

### Supported providers
- `ollama`
- `openrouter`

### Runtime-configurable settings
You can change these in the Settings UI without touching source code:

- Active provider
- Ollama host and model
- OpenRouter API key, model, base URL, site name, and site URL
- System prompt
- Temperature
- Max tokens

This means AURELIUS can run fully local, hybrid, or fully cloud-backed — your choice at any time.

---

## 🎭 Skills System

AURELIUS includes a **Skills** system inspired by Anthropic's `SKILL.md` format. A skill is a Markdown file with YAML frontmatter that injects a behavioral overlay into the LLM context when activated.

### Built-in skills
| Skill | Icon | Summary |
|---|---|---|
| `coder` | 💻 | TypeScript-first coding mode — strict types, code before prose, low temperature |
| `writer` | ✍️ | Creative writing mode — expressive, elaborate, no unsolicited tool use |
| `focus` | 🧘 | Minimal mode — direct answers only, no tools, no filler |

### Skill frontmatter fields
```yaml
---
name: coder
displayName: Code Assistant
icon: 💻
description: TypeScript-first coding mode — strict types, code before prose
temperature: 0.2
---
```

| Field | Required | Notes |
|---|---|---|
| `name` | ✅ | Unique slug, also used as the filename |
| `displayName` | ✅ | Human-readable name shown in the UI |
| `icon` | — | Single emoji |
| `description` | — | One-sentence summary |
| `temperature` | — | Overrides the global temperature when this skill is active |

### Skill capabilities
- **Create** custom skills from the UI — paste or write a `SKILL.md` string
- **Generate** skill content from a plain-text description using the active LLM
- **Edit** any skill including built-ins
- **Delete** custom skills (built-ins are protected)
- **Activate / deactivate** a skill per session — persisted to `%APPDATA%\Aurelius\active-skill.json`

Skill files are stored in `%APPDATA%\Aurelius\skills\` and survive restarts.

---

## ⚙️ Custom Automations Engine

AURELIUS includes a **multi-step automation builder** that lets you chain tools into named workflows and trigger them from chat.

### What automations can do
- Chain any registered tool (system tools, browser tools, or other automations) into ordered steps
- Pass outputs from one step as template inputs to the next using `{{step_id.result}}` references
- Conditionally skip steps based on previous results
- Stream step-by-step progress events back to the frontend in real time

### Automation persistence
Automations are saved to `%APPDATA%\Aurelius\automations.json` and loaded at startup. Each registered automation is exposed to the LLM as a first-class tool, so the model can invoke it by name.

### Streamed event types
| Event | Meaning |
|---|---|
| `step_start` | A step has begun executing |
| `step_done` | A step completed (success or error) |
| `done` | All steps finished — summary included |

---

## 🌐 Zen Browser Extension

The `extensions/zen-aurelius` directory contains a **Firefox/Zen Browser WebExtension** (MV2) that turns the browser into a fully controllable automation surface for the AI.

### How it works
1. The extension opens a persistent WebSocket connection to `ws://localhost:4243/browser/ws`
2. The backend `BrowserBridge` holds the socket and exposes `sendBrowserCommand()` to the tool executor
3. When the AI calls a `browser_*` tool, the backend sends a command over the socket
4. The extension dispatches it to the active tab (via `background.js` or delegated to `content.js`) and returns the result
5. The backend resolves the pending promise and continues the reasoning loop

### Extension features
- Auto-reconnects with exponential back-off (3 s → 30 s)
- Badge shows **ON** (green) / disconnected (red) in the toolbar
- Configurable backend WebSocket URL via the popup UI
- Forces `ws://` on localhost even if Zen's HTTPS-Only Mode is active

### Installation
1. Build or use the pre-packaged `extensions/zen-aurelius.xpi`
2. In Zen Browser: `about:addons` → gear icon → **Install Add-on From File** → select the `.xpi`
3. The badge turns green once the backend is running

---

## 🖥️ Tauri Desktop App

AURELIUS ships as a **native Windows desktop application** built with Tauri v2.

### How it works
- The Next.js frontend is exported as a static site and loaded inside a Tauri WebView
- The Bun backend is compiled to a standalone executable (`backend-server-x86_64-pc-windows-msvc.exe`) and bundled as a **Tauri sidecar** — it starts and stops automatically with the app
- The installer is built with **NSIS** (current-user install, no admin required)

### Desktop scripts
| Script | What it does |
|---|---|
| `bun run dev:desktop` | Kills the old sidecar, rebuilds it, then launches `tauri dev` |
| `bun run build:desktop` | Builds the sidecar and packages the full NSIS installer |
| `bun run build:sidecar` | Compiles only the backend sidecar binary |

### Data directory
On Windows the backend stores all persistent data (settings, skills, automations, active skill) in:
```
%APPDATA%\Aurelius\
```

---

## 📊 Dashboard

The dashboard page (`/dashboard`) provides a real-time view of system health and assistant state:

| Section | Details |
|---|---|
| **CPU** | Usage %, core count, model name |
| **Memory** | Total / used / free (GB), usage % |
| **GPU** | NVIDIA name, VRAM total / used / free, utilization %, temperature (via `nvidia-smi`) |
| **Uptime** | Human-readable system uptime |
| **LLM** | Active provider, model, host |
| **Active Skill** | Currently loaded skill name and icon |
| **Backend** | Online / offline indicator |

Stats are streamed from `GET /api/system/stats/stream` (SSE, 2-second interval) and also available as a snapshot at `GET /api/system/stats`.

---

## ⚙️ Settings UI

AURELIUS includes a runtime Settings page that configures the assistant without editing source files.

### Available settings
- LLM provider selection
- Ollama configuration (host, model)
- OpenRouter configuration (API key, model, base URL, site name, site URL)
- System prompt & model behavior (temperature, max tokens)
- CORS origin
- Audio engine URL
- Tavily API key
- Screenshot save path
- Default file root
- Allowed read roots
- Allowed write root
- Application search roots

### Tool and path configuration
| Setting | Purpose |
|---|---|
| **Default File Root** | Fallback folder for file tools that need a base location |
| **Allowed Read Roots** | Folders the assistant may browse and read |
| **Allowed Write Root** | Folder the assistant may write files into |
| **Application Search Roots** | Folders used by app discovery |
| **Screenshot Save Path** | Where `take_screenshot` saves images |

---

## 🧰 Tool System

AURELIUS has an agentic tool-calling loop with structured permission levels and a confirmation gate.

### Permission levels
| Level | Behaviour |
|---|---|
| **SAFE** | Auto-executes immediately with no user interaction |
| **SENSITIVE** | Pauses and requires explicit user approval |
| **DANGEROUS** | Pauses, requires approval, and is visually emphasized in the UI |

### System tools

#### SAFE
| Tool | Description |
|---|---|
| `wait` | Pause execution for up to 15 000 ms (useful in automations) |
| `get_time` | Current time |
| `get_date` | Current date |
| `get_clipboard` | Read clipboard contents |
| `list_directory` | List files and folders |
| `web_search` | Tavily web search |
| `find_application` | Discover installed applications |
| `find_files` | Search for files by name/query |
| `copy_to_clipboard` | Write text to clipboard |
| `get_active_window` | Get the title of the currently focused window |
| `find_process` | Search running processes by name |

#### SENSITIVE
| Tool | Description |
|---|---|
| `open_url` | Open a URL in the default browser |
| `read_file` | Read a file from an allowed read root |
| `take_screenshot` | Capture a screenshot to the configured save path |

#### DANGEROUS
| Tool | Description |
|---|---|
| `open_app` | Launch an application |
| `write_file` | Write a file inside the allowed write root |
| `run_command` | Execute a shell command |
| `kill_process` | Terminate a running process |

### Browser control tools (Zen Browser extension required)

#### SAFE
| Tool | Description |
|---|---|
| `browser_get_url` | Get the URL and title of the active tab |
| `browser_get_tabs` | List all open tabs with IDs and URLs |
| `browser_get_content` | Extract visible page text from the active tab |
| `browser_find_elements` | Find interactive elements (buttons, inputs, links) on the page |
| `browser_scroll` | Scroll by direction, amount, coordinates, or element selector |
| `browser_go_back` | Navigate back in browser history |
| `browser_go_forward` | Navigate forward in browser history |
| `browser_reload` | Reload the current tab |
| `browser_screenshot` | Capture a screenshot of the visible tab area |

#### SENSITIVE
| Tool | Description |
|---|---|
| `browser_navigate` | Navigate the active tab to a URL |
| `browser_new_tab` | Open a new tab (optionally with a URL) |
| `browser_close_tab` | Close a tab by ID |
| `browser_switch_tab` | Switch focus to a tab by ID |
| `browser_find_element_content` | Extract text content from a specific element |
| `browser_hover` | Move the cursor over an element |

#### DANGEROUS
| Tool | Description |
|---|---|
| `browser_click` | Click an element by CSS selector or visible text |
| `browser_hover_and_click` | Hover over a row then click a child element |
| `browser_type` | Type text into an input (supports secret/password mode) |
| `browser_select_option` | Select an option in a `<select>` element |
| `browser_execute_js` | Execute arbitrary JavaScript in the page context |

### Tool execution flow
1. The model emits a tool call
2. Backend resolves the tool's permission level
3. `SAFE` tools execute automatically
4. `SENSITIVE` / `DANGEROUS` tools emit a `tool_confirm` SSE event
5. Frontend shows an approval UI with the tool name and arguments
6. User approves or rejects
7. Backend continues the reasoning loop with the tool result or rejection message

---

## 💬 Chat System

The chat experience is built around **SSE streaming** and a multi-turn agentic loop.

### Streamed event types
| Event | Meaning |
|---|---|
| `chunk` | Incremental assistant text token |
| `tool_auto` | A SAFE tool executed automatically |
| `tool_confirm` | A SENSITIVE/DANGEROUS tool is awaiting user approval |
| `tool_executed` | A confirmed tool has been executed |
| `tool_rejected` | The user rejected a tool call |
| `done` | The turn is complete |
| `error` | A stream or execution error occurred |

### UX features
- Streaming assistant message bubbles with incremental rendering
- Tool confirmation bubbles with approve / reject controls
- SAFE tool auto-execution bubbles showing the tool name and result
- Distinct visual styling for `SENSITIVE` vs `DANGEROUS` confirmations
- Multiple named chat sessions with per-session history
- Retry handling for transient stream errors

---

## 🔊 Audio Engine

The audio engine runs as a separate Python service at `http://localhost:8000`.

### Capabilities
- **Silero VAD** for voice activity detection
- **faster-whisper** for speech-to-text transcription
- **edge-tts** for text-to-speech synthesis
- Supports Thai and English workflows

### Notes
Voice pipeline latency depends on:
- Whisper model size
- VAD silence thresholds
- Beam size
- Whether CUDA is available for inference

The voice stack is functional but has room for latency optimisation.

---

## 🔐 Safety Model

AURELIUS is built around explicit execution safety rather than silent agent behavior.

### Safety principles
- Read-only or low-risk tools auto-run without prompting
- Sensitive actions always require a visible user confirmation
- Dangerous actions require confirmation and receive visual emphasis
- File tools are scoped by configured allowed roots — no path traversal outside those roots
- Write operations are constrained to a single write-safe directory
- Screenshot output is constrained to a configured folder
- Command execution includes baseline blocking for destructive patterns
- Browser tools that read page content are SAFE; tools that mutate state are SENSITIVE or DANGEROUS

---

## 📂 Monorepo Structure

```text
AURELIUS/
├─ apps/
│  ├─ backend/               # Bun + Elysia backend
│  │  └─ src/
│  │     ├─ browser/         # WebSocket bridge for Zen extension
│  │     ├─ config/          # env + settings store
│  │     ├─ debug/           # hardware stats (CPU / GPU / memory)
│  │     ├─ llm/             # Ollama + OpenRouter provider clients
│  │     ├─ routes/          # settings, tools, automations, skills routes
│  │     ├─ skills/          # skills store + SKILL.md parser
│  │     ├─ sse/             # SSE chat streaming + agentic loop
│  │     ├─ tools/           # tool registry, executor, automations engine
│  │     └─ server.ts        # Elysia app entry point
│  └─ web/                   # Next.js frontend + Tauri desktop shell
│     ├─ app/
│     │  ├─ chat/            # Chat page
│     │  ├─ dashboard/       # Hardware + assistant stats dashboard
│     │  └─ settings/        # Runtime settings page
│     ├─ components/         # UI components (layout, cards, badges…)
│     ├─ hooks/              # React hooks for all backend interactions
│     └─ src-tauri/          # Tauri config, icons, capabilities, sidecar
├─ extensions/
│  └─ zen-aurelius/          # Firefox/Zen Browser WebExtension
│     ├─ background.js       # WS client + tab command dispatcher
│     ├─ content.js          # DOM automation helpers (click, type, scroll…)
│     ├─ popup/              # Extension popup UI
│     └─ manifest.json
├─ packages/
│  └─ shared-schema/         # Shared Zod schemas (chat, tool, audio, skill, memory)
├─ services/
│  └─ audio-engine/          # Python FastAPI STT/TTS service
├─ scripts/
│  ├─ dev-desktop.ps1        # Build sidecar + launch tauri dev
│  └─ build-desktop.ps1      # Build sidecar + package NSIS installer
├─ package.json
├─ bun.lock
└─ README.md
```

---

## 🚀 Running the Project

### Prerequisites
- [Bun](https://bun.sh/) ≥ 1.x
- [Node.js](https://nodejs.org/) (for Tauri toolchain if building desktop)
- [Python 3.11+](https://python.org/) + [uv](https://github.com/astral-sh/uv) (for the audio engine)
- [Rust + Tauri CLI](https://tauri.app/start/prerequisites/) (for the desktop app only)
- [Ollama](https://ollama.com/) running locally (optional — can use OpenRouter instead)

### 1. Install dependencies
```bash
bun install
```

### 2. Run the web frontend
```bash
bun run dev:web
```

### 3. Run the backend
```bash
bun run dev:backend
```

### 4. Run the audio engine (optional)
```bash
bun run dev:audio
```
Or from `services/audio-engine` directly:
```bash
uv run python main.py
```

### 5. Install the browser extension (optional)
1. Open Zen Browser and go to `about:addons`
2. Gear icon → **Install Add-on From File**
3. Select `extensions/zen-aurelius.xpi`
4. The toolbar badge turns green once the backend is running

### 6. Run as a desktop app (Tauri)
```bash
bun run dev:desktop
```
This script kills any running sidecar, rebuilds the backend binary, waits for the file lock to be released, then launches `tauri dev`.

### 7. Build the installer
```bash
bun run build:desktop
```

---

## 🌐 Default Local Ports

| Service | Address |
|---|---|
| **Frontend** | `http://localhost:4242` |
| **Backend** | `http://localhost:4243` |
| **Browser bridge** | `ws://localhost:4243/browser/ws` |
| **Audio engine** | `http://localhost:8000` |

---

## 🔑 Required API Keys

| Key | Where to set it | Required for |
|---|---|---|
| `TAVILY_API_KEY` | Settings UI → Tavily API Key | Web search |
| `OPENROUTER_API_KEY` | Settings UI → OpenRouter | Cloud LLM inference |

No keys are needed for a fully local Ollama setup.

---

## 🔄 Current Direction

AURELIUS has evolved well beyond a static local AI chat shell. It now has:

- A runtime-configurable dual-provider LLM system
- A structured, permission-gated tool execution loop
- Full browser automation via the Zen Browser extension
- A Skills system for behavioural overlays with per-skill temperature
- A custom automations engine for multi-step tool chains
- A live hardware monitoring dashboard
- An installable Tauri desktop application with a bundled sidecar backend
- Approval-gated local automation with real-time UI feedback
- Local path safety boundaries for all file and write operations
- A separate speech engine with VAD, STT, and TTS

The project continues to move toward a **personal AI operating layer for Windows** with strong local control, privacy-aware design, and deep system extensibility.

---

## 🧪 Recommended Next Steps

High-value improvements include:

- Voice latency tuning (smaller Whisper model, VAD threshold optimisation, CUDA warm-up)
- Long-term memory and preference storage (vector DB or simple embedding cache)
- Screen understanding workflows (screenshot → vision model → action)
- Smarter path handling to reduce tool hallucination
- Audit history and automation run log in the UI
- Tauri system tray integration for background operation
- More tests around the tool loop, confirmation gate, and automation engine
- MV3 migration for the browser extension

---

## 👤 Author

Created by **Wanichanon (Aum) SaeLee**