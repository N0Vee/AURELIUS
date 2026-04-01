import os
import sys
import time
from typing import Optional

import numpy as np
from scipy import signal

os.environ["PYTHONUNBUFFERED"] = "1"


def log(tag, msg):
    print(f"[{tag}] {msg}", flush=True)


class AudioEngine:
    def __init__(self):
        self.pipe = None
        self.is_ready = False
        self._input_sample_rate = 48000

    def initialize(self):
        try:
            self._load_whisper()
            self.is_ready = True
            log("INIT", "Ready")
        except Exception as e:
            log("INIT", f"FAILED: {e}")
            raise e

    def _load_whisper(self):
        import torch
        from transformers import (
            AutoModelForSpeechSeq2Seq,
            AutoProcessor,
            pipeline,
        )

        model_id = os.getenv("WHISPER_MODEL", "openai/whisper-large-v3-turbo")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        torch_dtype = torch.float16 if device == "cuda" else torch.float32

        log("WHISPER", f"Loading {model_id} on {device} ({torch_dtype})")

        model = AutoModelForSpeechSeq2Seq.from_pretrained(
            model_id,
            dtype=torch_dtype,
            low_cpu_mem_usage=True,
            use_safetensors=True,
        )
        model.to(device)

        processor = AutoProcessor.from_pretrained(model_id)

        self.pipe = pipeline(
            "automatic-speech-recognition",
            model=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=torch_dtype,
            device=0 if device == "cuda" else -1,
        )

        log("WHISPER", "Loaded")

    @staticmethod
    def _resample(audio_data, from_rate, to_rate):
        if from_rate == to_rate:
            return audio_data
        num_samples = int(len(audio_data) * to_rate / from_rate)
        return signal.resample(audio_data, num_samples).astype(np.float32)

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

        try:
            # Resample to 16kHz (Whisper's native rate)
            if self._input_sample_rate != 16000:
                audio_data = self._resample(audio_data, self._input_sample_rate, 16000)

            result = self.pipe(
                audio_data,
                return_timestamps=False,
                generate_kwargs={"language": None, "task": "transcribe"},
            )

            return result["text"].strip() if result.get("text") else ""

        except Exception as e:
            log("TRANSCRIBE", f"ERROR: {e}")
            return ""

    async def synthesize_speech(self, text: str, voice: Optional[str] = None) -> bytes:
        import io
        import edge_tts

        has_thai = any("\u0e00" <= c <= "\u0e7f" for c in text)
        if has_thai:
            voice = "th-TH-PremwadeeNeural"
        elif voice is None:
            voice = "en-US-JennyNeural"

        try:
            communicate = edge_tts.Communicate(text, voice)
            audio_data = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.write(chunk["data"])
            return audio_data.getvalue()

        except Exception as e:
            log("TTS", f"ERROR: {e}")
            return b""


engine = AudioEngine()
