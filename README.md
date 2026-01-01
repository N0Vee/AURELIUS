# 🏛️ AURELIUS
**Local Personal AI Assistant (Privacy-First)**

AURELIUS is a local-first intelligent system designed for Windows 11, focusing on privacy, ultra-low latency, and deep OS-level control. Built specifically for Software Engineers to manage workflows, control system applications, and interact via real-time speech-to-speech.

## 🎯 Vision & Principles
- **Privacy-First:** 100% local execution. No cloud dependencies or data leaks.
- **Low Latency:** Optimized for AMD Ryzen 7 9700X and NVIDIA RTX 5060 (8GB VRAM).
- **OS Control:** Control Windows 11 (Apps, Media, Files) via TypeScript-based tools.
- **Real-time Interaction:** Native Thai-English speech-to-speech capabilities.

## 🛠️ Tech Stack
- **Frontend:** Next.js 16 (App Router), Tailwind CSS, Shadcn/UI, Web Audio API.
- **Backend (Main Brain):** Bun runtime + Elysia framework (TypeScript).
- **AI Inference:** - **Text:** Llama 3.1 8B via Ollama.
    - **Audio:** Typhoon-2-Audio (Python/CUDA).
    - **Vision:** Llama 3.2 Vision (Planned).
- **Database:** SQLite (Metadata) + ChromaDB (Vector Memory).

## 📂 Monorepo Structure
The project uses a Bun-based monorepo structure to separate concerns:

- `apps/web`: Next.js UI for Dashboard and Chat.
- `apps/backend`: Bun + Elysia (The System Control Plane).
- `services/audio-engine`: Python service for Typhoon-2-Audio inference.
- `packages/shared-schema`: Zod/TypeBox schemas for strict data contracts.
- `infra/`: Scripts for GPU setup and model management.

## 🎙️ Key AI Features (Typhoon-2-Audio)
- **Speech-to-Speech:** Native audio-to-audio processing.
- **Parallel Outputs:** Generates text and audio simultaneously to minimize latency.
- **Extended Context:** Supports audio inputs up to 30 seconds.

## 🛡️ Safety & Execution
- **SAFE:** Read-only or common app actions (executed automatically).
- **SENSITIVE:** File writing/modifications (requires UI/Voice notification).
- **DANGEROUS:** System/Media control (explicit user confirmation required).

---
*Created by Wanichanon (Aum) SaeLee*.