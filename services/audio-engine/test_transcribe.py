from moonshine_voice import (
    get_assets_path,
    load_wav_file,
    Transcriber,
    get_model_for_language,
)
import wave
import struct
import numpy as np

path, arch = get_model_for_language(wanted_language="en")

# Load the debug audio
wav_path = "debug_transcribe_1774991437.wav"
with wave.open(wav_path, "r") as wf:
    n_frames = wf.getnframes()
    raw = wf.readframes(n_frames)
    samples = list(struct.unpack(f"<{n_frames}f", raw))

print(f"Total samples: {len(samples)} ({len(samples) / 48000:.2f}s)")

# Test 1: Full audio
t = Transcriber(model_path=path, model_arch=arch)
result = t.transcribe_without_streaming(samples, sample_rate=48000)
print(f"\nTest 1 (full audio): {len(result.lines)} lines")
for i, line in enumerate(result.lines):
    print(f'  Line {i}: "{line.text}"')

# Test 2: Just the speech portion (skip first 8000 samples)
speech_samples = samples[8000:]
print(
    f"\nSpeech portion: {len(speech_samples)} samples ({len(speech_samples) / 48000:.2f}s)"
)
t2 = Transcriber(model_path=path, model_arch=arch)
result2 = t2.transcribe_without_streaming(speech_samples, sample_rate=48000)
print(f"Test 2 (speech only): {len(result2.lines)} lines")
for i, line in enumerate(result2.lines):
    print(f'  Line {i}: "{line.text}"')

# Test 3: Test with the built-in test file
wav_path2 = str(get_assets_path()) + "/two_cities.wav"
audio2, sr2 = load_wav_file(wav_path2)
t3 = Transcriber(model_path=path, model_arch=arch)
result3 = t3.transcribe_without_streaming(audio2, sample_rate=sr2)
print(f"\nTest 3 (built-in test file): {len(result3.lines)} lines")
for i, line in enumerate(result3.lines[:3]):
    print(f'  Line {i}: "{line.text}"')
