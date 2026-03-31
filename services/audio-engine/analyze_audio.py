from moonshine_voice import get_assets_path, load_wav_file
import wave
import struct
import numpy as np

# Load both files
wav_path = "debug_transcribe_1774991437.wav"
with wave.open(wav_path, "r") as wf:
    n_frames = wf.getnframes()
    raw = wf.readframes(n_frames)
    samples = np.array(struct.unpack(f"<{n_frames}f", raw), dtype=np.float32)

wav_path2 = str(get_assets_path()) + "/two_cities.wav"
audio2, sr2 = load_wav_file(wav_path2)
audio2 = np.array(audio2, dtype=np.float32)

print("=== Debug Audio ===")
print(f"Samples: {len(samples)}")
print(f"Sample rate: 48000 Hz")
print(f"Duration: {len(samples) / 48000:.2f}s")
print(f"Min: {np.min(samples):.6f}")
print(f"Max: {np.max(samples):.6f}")
print(f"Mean: {np.mean(samples):.6f}")
print(f"Std: {np.std(samples):.6f}")
print(f"First 20: {samples[:20]}")

print("\n=== Test Audio ===")
print(f"Samples: {len(audio2)}")
print(f"Sample rate: {sr2} Hz")
print(f"Duration: {len(audio2) / sr2:.2f}s")
print(f"Min: {np.min(audio2):.6f}")
print(f"Max: {np.max(audio2):.6f}")
print(f"Mean: {np.mean(audio2):.6f}")
print(f"Std: {np.std(audio2):.6f}")
print(f"First 20: {audio2[:20]}")

# Check if debug audio has any silence at the beginning
print("\n=== Debug Audio Analysis ===")
for i in range(0, min(len(samples), 100000), 1000):
    chunk = samples[i : i + 1000]
    max_amp = np.max(np.abs(chunk))
    if max_amp > 0.01:
        print(f"Speech starts at sample {i} ({i / 48000:.2f}s), amp={max_amp:.4f}")
        break

# Check if there are any NaN or Inf values
print(f"\nNaN values: {np.sum(np.isnan(samples))}")
print(f"Inf values: {np.sum(np.isinf(samples))}")

# Try transcribing just the speech portion
speech_start = 0
for i in range(0, len(samples), 100):
    chunk = samples[i : i + 1000]
    if len(chunk) > 0 and np.max(np.abs(chunk)) > 0.01:
        speech_start = i
        break

speech_audio = samples[speech_start:]
print(
    f"\nSpeech portion: {len(speech_audio)} samples ({len(speech_audio) / 48000:.2f}s)"
)
print(f"Speech max amp: {np.max(np.abs(speech_audio)):.6f}")
