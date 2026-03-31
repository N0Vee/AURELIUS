from moonshine_voice import (
    get_assets_path,
    load_wav_file,
    Transcriber,
    get_model_for_language,
)
import os
import wave
import struct
import numpy as np

path, arch = get_model_for_language(wanted_language="en")

# Load the actual debug audio
wav_path = "debug_transcribe_1774991437.wav"
if not os.path.exists(wav_path):
    print(f"File not found: {wav_path}")
    exit(1)

with wave.open(wav_path, "r") as wf:
    n_frames = wf.getnframes()
    raw = wf.readframes(n_frames)
    samples = list(struct.unpack(f"<{n_frames}f", raw))

print(f"Audio: {len(samples)} samples at 48kHz")
print(f"Max amp: {max(abs(s) for s in samples):.6f}")

# Test with the actual audio
t = Transcriber(model_path=path, model_arch=arch)
result = t.transcribe_without_streaming(samples, sample_rate=48000)
print(f"Result lines: {len(result.lines)}")
for i, line in enumerate(result.lines):
    print(f'  Line {i}: "{line.text}" (complete={line.is_complete})')

# Also test with the built-in test file to confirm model works
wav_path2 = os.path.join(get_assets_path(), "two_cities.wav")
audio2, sr2 = load_wav_file(wav_path2)
result2 = t.transcribe_without_streaming(audio2, sample_rate=sr2)
print(f"\nTest file result: {len(result2.lines)} lines")
for i, line in enumerate(result2.lines[:3]):
    print(f'  Line {i}: "{line.text}"')
