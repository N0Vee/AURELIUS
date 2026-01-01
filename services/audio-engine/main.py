from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
from engine import engine
import uvicorn

app = FastAPI(title="AURELIUS Audio Engine")

# CORS for frontend
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

@app.on_event("startup")
async def startup_event():
    """Initialize audio engine on startup."""
    engine.initialize()

@app.get("/")
async def root():
    return {
        "status": "running",
        "engine_ready": engine.is_ready,
        "model": "faster-whisper-large-v3"
    }

@app.get("/health")
async def health():
    return {"status": "healthy", "ready": engine.is_ready}

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    """Convert text to speech and return audio."""
    audio_bytes = await engine.synthesize_speech(request.text, request.voice)
    if not audio_bytes:
        return Response(content="TTS failed", status_code=500)
    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Content-Disposition": "inline; filename=speech.mp3"}
    )

@app.websocket("/ws/audio")
async def audio_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time audio streaming."""
    await websocket.accept()
    try:
        await engine.process_audio_stream(websocket)
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
