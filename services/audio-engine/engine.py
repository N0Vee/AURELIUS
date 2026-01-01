import torch
import numpy as np
import tempfile
import os
from colorama import Fore, Style

class AudioEngine:
    def __init__(self):
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.is_ready = False
        self.vad_model = None

    def initialize(self):
        """
        Load Faster-Whisper ASR model and Silero VAD.
        This runs on startup.
        """
        print(f"{Fore.CYAN}Initializing Audio Engine on {self.device}...{Style.RESET_ALL}")
        
        try:
            # 1. Load VAD (Silero)
            self.vad_model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                trust_repo=True
            )
            print(f"{Fore.GREEN}✅ VAD Model Loaded{Style.RESET_ALL}")

            # 2. Load Faster-Whisper
            print(f"{Fore.YELLOW}Loading Faster-Whisper (large-v3)...{Style.RESET_ALL}")
            from faster_whisper import WhisperModel
            
            # Use large-v3 for best accuracy, or "medium" for faster inference
            # compute_type: float16 for GPU, int8 for CPU
            compute_type = "float16" if self.device == "cuda" else "int8"
            
            self.model = WhisperModel(
                "large-v3",
                device=self.device,
                compute_type=compute_type
            )
            
            print(f"{Fore.GREEN}✅ Faster-Whisper Loaded Successfully{Style.RESET_ALL}")
            
            self.is_ready = True
            
        except Exception as e:
            print(f"{Fore.RED}❌ Error initializing engine: {e}{Style.RESET_ALL}")
            raise e

    async def process_audio_stream(self, websocket):
        """
        Handle WebSocket audio stream.
        1. Receive chunks
        2. VAD processing
        3. Buffer speech
        4. Transcribe with Faster-Whisper
        5. Send transcription back
        """
        print(f"{Fore.CYAN}Client connected to audio stream{Style.RESET_ALL}")
        
        # Audio buffer for collecting speech frames
        audio_buffer = []
        sample_rate = 16000
        is_speaking = False
        silence_frames = 0
        max_silence_frames = 30  # ~1 second of silence to trigger transcription (was 15)
        chunk_count = 0
        
        try:
            while True:
                # Receive audio chunk (bytes)
                data = await websocket.receive_bytes()
                chunk_count += 1
                
                # Convert bytes to numpy array (float32, 16kHz mono)
                audio_chunk = np.frombuffer(data, dtype=np.float32)
                
                # Debug: Log every 50 chunks
                if chunk_count % 50 == 0:
                    print(f"{Fore.YELLOW}[DEBUG] Received {chunk_count} chunks, last chunk size: {len(audio_chunk)}, max: {np.max(np.abs(audio_chunk)):.4f}{Style.RESET_ALL}")
                
                # Run VAD on current chunk
                if len(audio_chunk) >= 512:
                    speech_prob = self.vad_model(
                        torch.from_numpy(audio_chunk),
                        sample_rate
                    ).item()
                    
                    # Debug: Log speech probability
                    if speech_prob > 0.3:
                        print(f"{Fore.GREEN}[VAD] Speech prob: {speech_prob:.2f}{Style.RESET_ALL}")
                    
                    if speech_prob > 0.5:
                        # Speech detected
                        is_speaking = True
                        silence_frames = 0
                        audio_buffer.append(audio_chunk)
                        
                        await websocket.send_json({
                            "type": "vad",
                            "speech_detected": True,
                            "confidence": speech_prob
                        })
                    else:
                        # Silence
                        if is_speaking:
                            silence_frames += 1
                            audio_buffer.append(audio_chunk)  # Keep buffering during short silence
                            
                            # If enough silence after speech, transcribe
                            if silence_frames >= max_silence_frames:
                                # Concatenate all audio
                                full_audio = np.concatenate(audio_buffer)
                                print(f"{Fore.CYAN}[TRANSCRIBE] Processing {len(full_audio)} samples ({len(full_audio)/16000:.2f}s){Style.RESET_ALL}")
                                
                                # Transcribe
                                text = await self.transcribe_audio(full_audio)
                                
                                if text.strip():
                                    print(f"{Fore.GREEN}[RESULT] Transcription: {text}{Style.RESET_ALL}")
                                    await websocket.send_json({
                                        "type": "transcription",
                                        "text": text,
                                        "is_final": True
                                    })
                                else:
                                    print(f"{Fore.YELLOW}[RESULT] Empty transcription{Style.RESET_ALL}")
                                
                                # Reset state
                                audio_buffer = []
                                is_speaking = False
                                silence_frames = 0
                
        except Exception as e:
            print(f"{Fore.YELLOW}Connection closed: {e}{Style.RESET_ALL}")

    async def transcribe_audio(self, audio_data: np.ndarray) -> str:
        """
        Transcribe audio data using Faster-Whisper.
        """
        if not self.is_ready or self.model is None:
            return ""
        
        try:
            # faster-whisper can transcribe from numpy array directly
            segments, info = self.model.transcribe(
                audio_data,
                language=None,  # Auto-detect language (supports Thai, English, etc.)
                beam_size=5,
                vad_filter=True  # Use built-in VAD for filtering
            )
            
            # Collect all segment texts
            text = " ".join([segment.text for segment in segments])
            return text.strip()
            
        except Exception as e:
            print(f"{Fore.RED}Transcription error: {e}{Style.RESET_ALL}")
            return ""

    async def synthesize_speech(self, text: str, voice: str = None) -> bytes:
        """
        Convert text to speech using edge-tts.
        Returns MP3 audio bytes.
        """
        import edge_tts
        import io
        
        # Safety: If text contains Thai, FORCE Thai voice (to prevent mistmatch errors)
        has_thai = any('\u0e00' <= c <= '\u0e7f' for c in text)
        if has_thai:
            voice = "th-TH-PremwadeeNeural"
        elif voice is None:
             # Default to English if no voice specified and no Thai
             voice = "en-US-JennyNeural"
        
        try:
            print(f"{Fore.CYAN}[TTS] Synthesizing: {text[:50]}... (voice: {voice}){Style.RESET_ALL}")
            
            # Create TTS communication
            communicate = edge_tts.Communicate(text, voice)
            
            # Collect audio chunks
            audio_data = io.BytesIO()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.write(chunk["data"])
            
            audio_bytes = audio_data.getvalue()
            print(f"{Fore.GREEN}[TTS] Generated {len(audio_bytes)} bytes{Style.RESET_ALL}")
            return audio_bytes
            
        except Exception as e:
            print(f"{Fore.RED}[TTS] Error: {e}{Style.RESET_ALL}")
            return b""

# Global instance
engine = AudioEngine()
