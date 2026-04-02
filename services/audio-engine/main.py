from contextlib import asynccontextmanager
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from engine import engine
import uvicorn


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.start_background_initialization()
    yield


app = FastAPI(title="AURELIUS Audio Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = None


@app.get("/health")
async def health():
    return engine.get_status()


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    has_thai = any("\u0e00" <= c <= "\u0e7f" for c in request.text)
    audio_bytes = await engine.synthesize_speech(request.text, request.voice)
    if not audio_bytes:
        return Response(content="TTS failed", status_code=500)

    # Pocket-TTS returns WAV, edge-tts returns MP3
    if has_thai:
        media_type = "audio/mpeg"
        filename = "speech.mp3"
    else:
        media_type = "audio/wav"
        filename = "speech.wav"

    return Response(
        content=audio_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@app.websocket("/ws/audio")
async def audio_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        await engine.process_audio_stream(websocket)
    except WebSocketDisconnect:
        pass



def parse_bool(value: Optional[str], default: bool) -> bool:
    if value is None:
        return default

    return value.strip().lower() in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    is_frozen = bool(getattr(sys, "frozen", False))
    host = os.getenv("AUDIO_ENGINE_HOST", "0.0.0.0")
    port = int(os.getenv("AUDIO_ENGINE_PORT", "8000"))
    reload_enabled = parse_bool(
        os.getenv("AUDIO_ENGINE_RELOAD"),
        default=not is_frozen,
    )
    app_target = app if is_frozen else "main:app"

    uvicorn.run(app_target, host=host, port=port, reload=reload_enabled, log_level="info")
