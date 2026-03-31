import os
import sys
import time
import wave
import struct
from typing import Optional

import numpy as np
from scipy import signal

os.environ["PYTHONUNBUFFERED"] = "1"


def log(tag, msg):
    print(f"[{tag}] {msg}", flush=True)


class AudioEngine:
    def __init__(self):
        self.transcriber = None
        self.is_ready = False
        self.language = os.getenv("MOONSHINE_LANGUAGE", "en")
        self.model_path = None
        self.model_arch = None
        self._chunk_count = 0
        self._input_sample_rate = 48000

    def initialize(self):
        log("INIT", "Starting Audio Engine...")
        try:
            self._load_moonshine()
            self.is_ready = True
            log("INIT", "Audio Engine READY")
        except Exception as e:
            log("INIT", f"FAILED: {e}")
            raise e

    def _load_moonshine(self):
        from moonshine_voice import Transcriber
        from moonshine_voice.download import get_model_for_language

        model_path = os.getenv("MOONSHINE_MODEL_PATH", "")
        arch_name = os.getenv("MOONSHINE_MODEL_ARCH", "")

        if not model_path:
            log("MOONSHINE", f"Downloading model for '{self.language}'...")
            model_path, model_arch = get_model_for_language(
                wanted_language=self.language
            )
        else:
            from moonshine_voice.moonshine_api import ModelArch

            arch_map = {m.name: m for m in ModelArch}
            model_arch = arch_map.get(arch_name.upper(), ModelArch.MEDIUM_STREAMING)

        self.model_path = model_path
        self.model_arch = model_arch
        log("MOONSHINE", f"Loading {model_arch.name} from {model_path}")
        self.transcriber = Transcriber(model_path=model_path, model_arch=model_arch)
        log("MOONSHINE", "LOADED")

    def _create_transcriber(self):
        """Create a fresh transcriber instance."""
        from moonshine_voice import Transcriber

        return Transcriber(
            model_path=self.model_path,
            model_arch=self.model_arch,
        )

    @staticmethod
    def _resample(audio_data, from_rate, to_rate):
        """Resample audio from one sample rate to another."""
        if from_rate == to_rate:
            return audio_data
        num_samples = int(len(audio_data) * to_rate / from_rate)
        resampled = signal.resample(audio_data, num_samples)
        return resampled.astype(np.float32)

    async def process_audio_stream(self, websocket):
        """Handle WebSocket audio stream.
        Buffers audio while recording, transcribes on toggle-off."""
        log("WS", "Client connected")
        recording = False
        audio_buffer = []
        chunk_count = 0

        try:
            while True:
                message = await websocket.receive()

                # JSON control message
                if "text" in message:
                    import json

                    try:
                        ctrl = json.loads(message["text"])
                        msg_type = ctrl.get("type", "")
                        if msg_type == "recording":
                            recording = ctrl.get("active", False)
                            sample_rate = ctrl.get("sampleRate", 48000)
                            log(
                                "CTRL",
                                f"Recording {'ON' if recording else 'OFF'} (sampleRate: {sample_rate}Hz)",
                            )
                            if recording:
                                chunk_count = 0
                                audio_buffer = []
                                self._input_sample_rate = sample_rate
                                log("AUDIO", "Buffer cleared, ready to record")
                            else:
                                # Transcribe buffered audio
                                if audio_buffer:
                                    full_audio = np.concatenate(audio_buffer)
                                    duration_s = (
                                        len(full_audio) / self._input_sample_rate
                                    )
                                    log(
                                        "TRANSCRIBE",
                                        f"Processing {duration_s:.1f}s ({len(full_audio)} samples) @ {self._input_sample_rate}Hz",
                                    )
                                    # Save audio to WAV for debugging
                                    wav_path = f"debug_audio_{chunk_count}.wav"
                                    with wave.open(wav_path, "w") as wf:
                                        wf.setnchannels(1)
                                        wf.setsampwidth(4)  # 32-bit float
                                        wf.setframerate(self._input_sample_rate)
                                        for sample in full_audio:
                                            wf.writeframes(struct.pack("<f", sample))
                                    log("DEBUG", f"Saved {wav_path}")
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
                                else:
                                    log("AUDIO", "No audio buffered")
                                audio_buffer = []
                    except (json.JSONDecodeError, KeyError) as e:
                        log("WS", f"JSON parse error: {e}")
                    continue

                # Binary audio
                if "bytes" not in message:
                    continue

                if not recording:
                    continue

                data = message["bytes"]
                chunk_count += 1
                audio_chunk = np.frombuffer(data, dtype=np.float32)
                max_amp = (
                    float(np.max(np.abs(audio_chunk))) if len(audio_chunk) > 0 else 0
                )

                if chunk_count % 100 == 0:
                    log(
                        "AUDIO",
                        f"chunk={chunk_count} amp={max_amp:.6f} buf_size={len(audio_buffer)}",
                    )
                    # Log first few samples for debugging
                    if chunk_count == 100:
                        samples = audio_chunk[:10].tolist()
                        log("DEBUG", f"First 10 samples: {samples}")
                        log(
                            "DEBUG",
                            f"Chunk dtype: {audio_chunk.dtype}, len: {len(audio_chunk)}",
                        )

                # Buffer audio chunks
                audio_buffer.append(audio_chunk)

        except Exception as e:
            log("WS", f"Disconnected: {e}")

    def transcribe_audio(self, audio_data: np.ndarray) -> str:
        """Transcribe audio using Moonshine. Returns text string."""
        if not self.is_ready or self.transcriber is None:
            return ""

        try:
            # Resample to 48kHz if needed
            if self._input_sample_rate != 48000:
                audio_data = self._resample(audio_data, self._input_sample_rate, 48000)
                log("TRANSCRIBE", f"Resampled {self._input_sample_rate}Hz → 48kHz")

            # Trim leading/trailing silence — Moonshine chokes on long silence
            abs_audio = np.abs(audio_data)
            threshold = 0.01
            min_chunk = 1000  # 1000 samples at 48kHz ≈ 21ms

            # Find first non-silent chunk
            start = 0
            for i in range(0, len(abs_audio) - min_chunk, min_chunk):
                if np.max(abs_audio[i : i + min_chunk]) > threshold:
                    start = i
                    break

            # Find last non-silent chunk
            end = len(audio_data)
            for i in range(len(abs_audio) - min_chunk, 0, -min_chunk):
                if np.max(abs_audio[i : i + min_chunk]) > threshold:
                    end = i + min_chunk
                    break

            if end - start < min_chunk * 2:
                log("TRANSCRIBE", "Audio too quiet, skipping")
                return ""

            audio_data = audio_data[start:end]
            log(
                "TRANSCRIBE",
                f"Trimmed silence: {len(audio_data)} samples ({len(audio_data) / 48000:.2f}s)",
            )

            # Save trimmed audio for debugging
            wav_path = f"debug_transcribe_{int(time.time())}.wav"
            with wave.open(wav_path, "w") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(4)
                wf.setframerate(48000)
                for sample in audio_data:
                    wf.writeframes(struct.pack("<f", sample))
            log("DEBUG", f"Saved {wav_path}")

            audio_list = audio_data.tolist()
            log(
                "TRANSCRIBE",
                f"Calling transcribe_without_streaming with {len(audio_list)} samples @ 48kHz",
            )
            transcript = self.transcriber.transcribe_without_streaming(
                audio_list, sample_rate=48000
            )
            log("TRANSCRIBE", f"Got {len(transcript.lines)} lines")
            for i, line in enumerate(transcript.lines):
                log("TRANSCRIBE", f"  Line {i}: '{line.text}'")
            parts = [
                line.text.strip() for line in transcript.lines if line.text.strip()
            ]
            return " ".join(parts)

        except Exception as e:
            log("TRANSCRIBE", f"ERROR: {e}")
            import traceback

            traceback.print_exc()
            return ""

    async def synthesize_speech(self, text: str, voice: Optional[str] = None) -> bytes:
        """Convert text to speech using edge-tts. Returns MP3 bytes."""
        import io
        import edge_tts

        has_thai = any("\u0e00" <= c <= "\u0e7f" for c in text)
        if has_thai:
            voice = "th-TH-PremwadeeNeural"
        elif voice is None:
            voice = "en-US-JennyNeural"

        log("TTS", f"Synthesizing: '{text[:80]}' with {voice}")

        try:
            communicate = edge_tts.Communicate(text, voice)
            audio_data = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.write(chunk["data"])
            audio_bytes = audio_data.getvalue()
            log("TTS", f"Generated {len(audio_bytes)} bytes")
            return audio_bytes

        except Exception as e:
            log("TTS", f"ERROR: {e}")
            return b""


engine = AudioEngine()
