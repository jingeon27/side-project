"""Synthesize the closing-bell exhibit recording for the case page and its Shorts."""

import json
from pathlib import Path
import tempfile

from story_studio.media import ffmpeg
from story_studio.shorts.audio import RATE

WEB = Path(__file__).resolve().parent.parent / "apps/web"


def exhibit_recording():
    import numpy as np

    case = json.loads((WEB / "src/music-roll/case.json").read_text(encoding="utf-8"))
    lead, duration = .10, .78
    cues = [(second, second + lead, second + lead + duration) for second in case["strikes"]]
    time = np.arange(round(duration * RATE)) / RATE
    ring = sum(
        gain * np.exp(-decay * time) * np.sin(2 * np.pi * frequency * time)
        for frequency, gain, decay in ((880, .23, 5.8), (2218, .095, 9.4), (3510, .045, 14))
    )
    ring *= np.minimum(time / .002, 1) * np.minimum((duration - time) / .04, 1)
    recording = np.zeros(round(cues[-1][2] * RATE))
    for _, start, _ in cues:
        sample = round(start * RATE)
        recording[sample:sample + len(ring)] += ring
    return recording, cues


if __name__ == "__main__":
    import soundfile as sf

    recording, _ = exhibit_recording()
    target = WEB / "public/assets/music-roll-recording.mp3"
    with tempfile.TemporaryDirectory() as scratch:
        master = Path(scratch) / "recording.wav"
        sf.write(master, recording, RATE, subtype="PCM_24")
        ffmpeg("-i", master, "-codec:a", "libmp3lame", "-q:a", 3, target)
