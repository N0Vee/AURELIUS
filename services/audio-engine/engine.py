import os
import sys
import threading
import time
from typing import Optional

import numpy as np

os.environ["PYTHONUNBUFFERED"] = "1"


def log(tag, msg):
    print(f"[{tag}] {msg}", flush=True)


class AudioEngine:
    def __init__(self):
        self.pipe = None
        self.pocket_tts = None
        self.pocket_voice = None
        self.is_ready = False
        self._input_sample_rate = 48000
        self.whisper_model_id = os.getenv("WHISPER_MODEL", "openai/whisper-large-v3-turbo")
        self.state = "idle"
        self.phase = "idle"
        self.status_message = "Audio engine has not started yet."
        self.last_error = None
        self.started_at = None
        self.ready_at = None
        self._status_lock = threading.Lock()
        self._init_thread: Optional[threading.Thread] = None

    def initialize(self):
        self.start_background_initialization()

    def _set_status_locked(
        self,
        state: str,
        phase: str,
        message: str,
        error: Optional[str] = None,
    ):
        self.state = state
        self.phase = phase
        self.status_message = message
        self.last_error = error

    def _set_status(
        self,
        state: str,
        phase: str,
        message: str,
        error: Optional[str] = None,
    ):
        with self._status_lock:
            self._set_status_locked(state, phase, message, error)

    def get_status(self):
        with self._status_lock:
            status = "healthy" if self.is_ready else ("error" if self.state == "error" else "starting")
            return {
                "status": status,
                "ready": self.is_ready,
                "state": self.state,
                "phase": self.phase,
                "message": self.status_message,
                "error": self.last_error,
                "model": self.whisper_model_id,
                "startedAt": self.started_at,
                "readyAt": self.ready_at,
            }

    def start_background_initialization(self):
        with self._status_lock:
            if self.is_ready:
                return

            if self._init_thread and self._init_thread.is_alive():
                return

            self.started_at = time.time()
            self.ready_at = None
            self.is_ready = False
            self._set_status_locked(
                "starting",
                "bootstrap",
                "Preparing speech runtime...",
            )
            self._init_thread = threading.Thread(
                target=self._initialize_worker,
                name="audio-engine-init",
                daemon=True,
            )
            self._init_thread.start()

    def _initialize_worker(self):
        try:
            self._set_status("starting", "whisper", f"Loading Whisper model {self.whisper_model_id}...")
            self._load_whisper()
            self._set_status("starting", "tts", "Loading Pocket-TTS voice model...")
            self._load_pocket_tts()
            self.is_ready = True
            self.ready_at = time.time()
            self._set_status("ready", "ready", "Audio engine ready.")
            log("INIT", "Ready")
        except Exception as e:
            self.is_ready = False
            self._set_status(
                "error",
                "error",
                f"Audio engine failed to start: {e}",
                str(e),
            )
            log("INIT", f"FAILED: {e}")

    def _load_whisper(self):
        import torch
        from transformers import (
            AutoModelForSpeechSeq2Seq,
            AutoProcessor,
            pipeline,
        )

        device = "cuda" if torch.cuda.is_available() else "cpu"
        torch_dtype = torch.float16 if device == "cuda" else torch.float32

        log("WHISPER", f"Loading {self.whisper_model_id} on {device} ({torch_dtype})")

        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            self.whisper_model_id,
            dtype=torch_dtype,
            low_cpu_mem_usage=True,
            use_safetensors=True,
            attn_implementation="sdpa",  # scaled dot-product attention — faster, no extra deps
        )
        model.to(device)

        processor = AutoProcessor.from_pretrained(self.whisper_model_id)

        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=torch_dtype,
            device=0 if device == "cuda" else -1,
        )

        log("WHISPER", "Loaded")

    def _load_pocket_tts(self):
        """Load Pocket-TTS for fast English TTS."""
        from pocket_tts import TTSModel

        log("POCKET-TTS", "Loading model...")
        self.pocket_tts = TTSModel.load_model()
        self.pocket_voice = self.pocket_tts.get_state_for_audio_prompt("cosette")
        log("POCKET-TTS", "Loaded")

    async def process_audio_stream(self, websocket):
        log("WS", "Client connected")
        recording = False
        audio_buffer = []

        try:
            while True:
                message = await websocket.receive()

                if "text" in message:
                    import json

                    try:
                        ctrl = json.loads(message["text"])
                        if ctrl.get("type") == "recording":
                            recording = ctrl.get("active", False)
                            sample_rate = ctrl.get("sampleRate", 48000)
                            log("CTRL", f"Recording {'ON' if recording else 'OFF'}")
                            if recording:
                                audio_buffer = []
                                self._input_sample_rate = sample_rate
                            else:
                                if audio_buffer:
                                    full_audio = np.concatenate(audio_buffer)
                                    log(
                                        "TRANSCRIBE",
                                        f"{len(full_audio) / self._input_sample_rate:.1f}s",
                                    )
                                    text = self.transcribe_audio(full_audio)
                                    if text:
                                        log("RESULT", f"'{text}'")
                                        await websocket.send_json(
                                            {
                                                "type": "transcription",
                                                "text": text,
                                                "is_final": True,
                                            }
                                        )
                                    else:
                                        log("RESULT", "EMPTY")
                                audio_buffer = []
                    except (json.JSONDecodeError, KeyError):
                        pass
                    continue

                if "bytes" not in message or not recording:
                    continue

                data = message["bytes"]
                audio_chunk = np.frombuffer(data, dtype=np.float32)
                audio_buffer.append(audio_chunk)

        except Exception as e:
            log("WS", f"Disconnected: {e}")

    def transcribe_audio(self, audio_data: np.ndarray) -> str:
        if not self.is_ready or self.pipe is None:
            return ""

        # Gate on RMS energy — skip GPU work entirely for silence/background noise.
        # Threshold ~0.005 rejects near-silence while passing normal speech.
        rms = float(np.sqrt(np.mean(audio_data ** 2)))
        if rms < 0.005:
            log("TRANSCRIBE", f"Silence skipped (rms={rms:.4f})")
            return ""

        try:
            # Pass raw array + sampling_rate as dict — the pipeline's feature
            # extractor handles resampling to 16 kHz internally.
            result = self.pipe(
                {"raw": audio_data, "sampling_rate": self._input_sample_rate},
                return_timestamps=False,
                generate_kwargs={
                    "language": None,       # auto-detect Thai vs English
                    "task": "transcribe",
                    "temperature": 0.0,     # deterministic — no random sampling
                },
            )

            return result["text"].strip() if result.get("text") else ""

        except Exception as e:
            log("TRANSCRIBE", f"ERROR: {e}")
            return ""

    async def synthesize_speech(self, text: str, voice: Optional[str] = None) -> bytes:
        has_thai = any("\u0e00" <= c <= "\u0e7f" for c in text)

        if has_thai:
            # Thai → edge-tts
            return await self._synthesize_edge_tts(text, "th-TH-PremwadeeNeural")
        else:
            # English → Pocket-TTS (fast, local)
            return await self._synthesize_pocket_tts(text)

    async def _synthesize_pocket_tts(self, text: str) -> bytes:
        """Fast local TTS using Pocket-TTS (~200ms latency)."""
        import io
        import scipy.io.wavfile

        if not self.pocket_tts:
            log("TTS", "Pocket-TTS not loaded, falling back to edge-tts")
            return await self._synthesize_edge_tts(text, "en-US-JennyNeural")

        try:
            log("TTS", f"Pocket-TTS: '{text[:50]}'")
            audio = self.pocket_tts.generate_audio(self.pocket_voice, text)
            buf = io.BytesIO()
            scipy.io.wavfile.write(buf, self.pocket_tts.sample_rate, audio.numpy())
            return buf.getvalue()

        except Exception as e:
            log("TTS", f"Pocket-TTS error: {e}, falling back to edge-tts")
            return await self._synthesize_edge_tts(text, "en-US-JennyNeural")

    async def _synthesize_edge_tts(self, text: str, voice: str) -> bytes:
        """Cloud TTS using edge-tts (supports Thai)."""
        import io
        import edge_tts

        try:
            log("TTS", f"edge-tts: '{text[:50]}' ({voice})")
            communicate = edge_tts.Communicate(text, voice)
            audio_data = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.write(chunk["data"])
            return audio_data.getvalue()

        except Exception as e:
            log("TTS", f"edge-tts error: {e}")
            return b""


engine = AudioEngine()
