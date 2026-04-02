# AURELIUS

Local-first personal AI assistant with a web frontend, Bun backend, browser automation, memory, skills, automations, and an optional audio service.

## Overview

AURELIUS is organized as a monorepo with a browser-first architecture:

- `apps/web` - Next.js frontend for chat, dashboard, settings, memories, skills, and sessions
- `apps/backend` - Bun + Elysia backend for chat orchestration, tools, MCP, browser bridge, SSE, settings, and memory
- `services/audio-engine` - Python audio service for speech processing and TTS
- `packages/shared-schema` - shared Zod schemas used across the repo
- `extensions/zen-aurelius` - Zen Browser extension for browser automation via WebSocket

The project is browser-first. The primary runtime is the web app in a browser.

## Core Features

- Local Ollama support with runtime model selection
- OpenRouter support as a cloud provider fallback
- Streaming chat with tool calling and approval gates
- Skills and automations managed from the UI
- Browser automation through the Zen extension bridge
- Memory extraction, storage, and search
- Dashboard with live system stats
- Optional audio runtime for voice interaction and TTS

## Prerequisites

- Bun
- Node.js
- Python 3.11+ and `uv` for the audio service
- Ollama if you want local model inference
- Zen Browser if you want browser automation

## Install

```bash
bun install
```

Optional audio service dependencies:

```bash
bun run audio:setup
```

## Development

Run the backend:

```bash
bun run dev:backend
```

Run the frontend:

```bash
bun run dev
```

Run the audio service when you need voice features:

```bash
bun run dev:audio
```

Run frontend, backend, and audio together:

```bash
bun run dev:all
```

Frontend: `http://localhost:4242`

Backend: `http://localhost:4243`

Audio service: `http://localhost:8000`

## Common Commands

```bash
bun run dev
bun run dev:all
bun run dev:web
bun run dev:backend
bun run dev:audio
bun run build
bun run lint
```

## Browser Extension

The Zen extension lives in `extensions/zen-aurelius` and connects to the backend over WebSocket. Once the backend is running, the extension can expose browser actions to the tool layer.

Key files:

- `extensions/zen-aurelius/background.js`
- `extensions/zen-aurelius/content.js`
- `extensions/zen-aurelius/manifest.json`

## Configuration

Runtime settings are managed through the Settings page and stored under the Aurelius app-data directory.

On Windows, data is stored under:

```text
%APPDATA%\Aurelius\
```

This includes persisted settings, memories, skills, automations, and other local runtime data.

## Project Structure

```text
apps/
  backend/
  web/
extensions/
  zen-aurelius/
packages/
  shared-schema/
services/
  audio-engine/
```

## Notes

- The web frontend assumes the backend is reachable on `localhost:4243` during local development.
- Voice features depend on the Python audio service.
- Browser automation depends on the Zen extension being installed and connected.

## License

No license file is included in this repository.