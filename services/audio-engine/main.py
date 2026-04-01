from contextlib import asynccontextmanager

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
    engine.initialize()
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
    return {"status": "healthy", "ready": engine.is_ready}


@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    audio_bytes = await engine.synthesize_speech(request.text, request.voice)
    if not audio_bytes:
        return Response(content="TTS failed", status_code=500)
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"},
    )


@app.websocket("/ws/audio")
async def audio_stream(websocket: WebSocket):
    await websocket.accept()
    try:
        await engine.process_audio_stream(websocket)
    except WebSocketDisconnect:
        pass


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
