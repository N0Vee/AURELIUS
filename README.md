# 🏛️ AURELIUS
**Local-First Personal AI Assistant for Windows**

AURELIUS is a privacy-first AI assistant built for Windows with a local-first architecture, configurable LLM providers, real-time chat streaming, guarded tool execution, and an evolving voice pipeline. It is designed to feel like a personal operating layer for your machine: chat with it, let it inspect local files, launch applications, search the web, and interact with system tools with explicit safety controls.

---

## ✨ Current Highlights

- **Local-first by design** with support for local inference via Ollama
- **Configurable cloud fallback** via OpenRouter
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
- Tool use with approval gates for sensitive or dangerous actions
- Local file browsing and reading inside configured allowed roots
- File writing inside a configured write-safe root
- App discovery and launching
- Clipboard read/copy
- Screenshot capture to a configurable folder
- Web search through Tavily
- Process inspection and termination
- Command execution with basic safety restrictions
- Voice-mode infrastructure through a separate audio engine service

---

## 🏗️ Architecture Overview

AURELIUS is a Bun-based monorepo with a split frontend/backend/services architecture.

### Applications
- `apps/web` — Next.js frontend for chat, settings, and UI
- `apps/backend` — Bun + Elysia backend for chat orchestration, tool calling, settings, and SSE
- `services/audio-engine` — Python FastAPI audio service for speech processing and TTS
- `packages/shared-schema` — Shared Zod schemas used across the monorepo

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 16**
- **React**
- **Tailwind CSS**
- **Framer Motion**
- **React Markdown**
- Custom settings and chat hooks

### Backend
- **Bun**
- **Elysia**
- **Zod**
- **Server-Sent Events (SSE)** for streaming chat/tool events

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
You can change these in the Settings UI without rewriting code:

- Active provider
- Ollama host and model
- OpenRouter API key
- OpenRouter model
- OpenRouter base URL
- OpenRouter site name / site URL
- System prompt
- Temperature
- Max tokens

This means AURELIUS can run:
- fully local
- hybrid local/cloud
- cloud-backed when needed

---

## ⚙️ Settings UI

AURELIUS includes a runtime Settings page that configures the assistant without editing source files.

### Available settings include
- LLM provider selection
- Ollama configuration
- OpenRouter configuration
- Prompt & model behavior
- CORS origin
- Audio engine URL
- Tavily API key
- Screenshot save path
- Default file root
- Allowed read roots
- Allowed write root
- Application search roots

### Tool and path configuration
The current settings system lets you define safe operating boundaries for local tools:

- **Default File Root** — default starting folder when a file tool needs a base location
- **Allowed Read Roots** — folders the assistant is allowed to browse/read from
- **Allowed Write Root** — folder the assistant is allowed to write into
- **Application Search Roots** — folders used by app discovery
- **Screenshot Save Path** — where screenshots are saved

---

## 🧰 Tool System

AURELIUS has an agentic tool-calling loop with structured permission levels and a confirmation gate.

### Permission levels
- **SAFE**  
  Auto-executes immediately

- **SENSITIVE**  
  Requires explicit user approval

- **DANGEROUS**  
  Requires explicit user approval and is visually emphasized in the UI

### Current tool categories

#### SAFE
- `get_time`
- `get_date`
- `get_clipboard`
- `list_directory`
- `web_search`
- `find_application`
- `find_files`
- `copy_to_clipboard`
- `get_active_window`
- `find_process`

#### SENSITIVE
- `open_url`
- `read_file`
- `take_screenshot`

#### DANGEROUS
- `open_app`
- `write_file`
- `run_command`
- `kill_process`

### Tool execution flow
1. The model emits a tool call
2. Backend checks the tool's permission level
3. `SAFE` tools execute automatically
4. `SENSITIVE` / `DANGEROUS` tools emit a confirmation event
5. Frontend shows an approval UI
6. User approves or rejects
7. Backend continues the reasoning loop with the tool result

This gives AURELIUS a practical balance between autonomy and control.

---

## 💬 Chat System

The chat experience is built around **SSE streaming** and an agentic loop.

### Streamed event types include
- `chunk`
- `tool_auto`
- `tool_confirm`
- `tool_executed`
- `tool_rejected`
- `done`
- `error`

### Current UX features
- Streaming assistant bubbles
- Tool confirmation bubbles
- SAFE tool execution bubbles
- Retry handling for some stream errors
- Distinct styling for confirmations and execution states

---

## 🔊 Audio Engine

The audio engine runs as a separate Python service.

### Current behavior
- Uses **Silero VAD** for voice activity detection
- Uses **faster-whisper** for transcription
- Uses **edge-tts** for speech synthesis
- Supports Thai and English workflows

### Notes
The current voice stack is functional, but latency depends heavily on:
- Whisper model size
- VAD silence thresholds
- beam size
- whether CUDA is available

The voice pipeline is in place, but there is still room for optimization and future polish.

---

## 🔐 Safety Model

AURELIUS is built around explicit execution safety rather than silent agent behavior.

### Safety principles
- Read-only or low-risk tools can auto-run
- Sensitive actions require confirmation
- Dangerous actions require confirmation
- File tools are scoped by configured allowed roots
- Write operations are constrained to a write-safe directory
- Screenshot output is constrained to a configured folder
- Command execution includes baseline blocking for destructive patterns

---

## 📂 Monorepo Structure

```text
AURELIUS/
├─ apps/
│  ├─ backend/          # Bun + Elysia backend
│  └─ web/              # Next.js frontend
├─ packages/
│  └─ shared-schema/    # Shared schemas and tests
├─ services/
│  └─ audio-engine/     # Python FastAPI audio service
├─ package.json
├─ bun.lock
└─ README.md
```

---

## 🚀 Running the Project

### 1. Install dependencies
At the repo root:

```bash
bun install
```

### 2. Run the web app
```bash
bun run dev:web
```

### 3. Run the backend
```bash
bun run dev:backend
```

### 4. Run the audio engine
```bash
bun run dev:audio
```

Or run the Python service manually from `services/audio-engine` if preferred.

---

## 🌐 Default Local Ports

- **Frontend:** `http://localhost:3000`
- **Backend:** `http://localhost:3001`
- **Audio engine:** `http://localhost:8000` / WebSocket endpoint configured in settings

---

## 🔄 Current Direction

AURELIUS is no longer just a static local AI chat shell. It now has:

- runtime-configurable providers
- a structured tool system
- approval-gated local automation
- local path safety boundaries
- real-time UI feedback
- a separate speech engine

The project is moving toward a **personal AI operating layer for Windows** with strong local control, privacy-aware design, and extensibility.

---

## 🧪 Recommended Next Steps

High-value next improvements include:

- Better voice latency tuning
- Long-term memory and preference storage
- Smarter file workflows and path handling
- Better command/tool specialization to reduce path hallucination
- Screenshot/screen understanding workflows
- More polished automation UX and audit history
- Additional tests around the tool loop and confirmation gate

---

## 👤 Author

Created by **Wanichanon (Aum) SaeLee**