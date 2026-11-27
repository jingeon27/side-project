"""Allocate whole video frames around spoken lines, including their release."""
from dataclasses import dataclass
from itertools import accumulate
import math

FPS = 30
FRAMES = 900
LEAD = .12
TAIL = .42
FINAL_TAIL = .65


@dataclass(frozen=True)
class Cut:
    first: int
    frames: int
    speech_seconds: float

    @property
    def start(self):
        return self.first / FPS

    @property
    def end(self):
        return (self.first + self.frames) / FPS


def plan_cuts(shots, durations):
    if len(shots) != len(durations) or not shots:
        raise ValueError('컷과 음성 수가 다릅니다.')
    minimum = [math.ceil((shot.get('voiceLead', LEAD) + length + (FINAL_TAIL if i == len(shots) - 1 else TAIL)) * FPS)
               if length else 1 for i, (shot, length) in enumerate(zip(shots, durations))]
    remaining = FRAMES - sum(minimum)
    if remaining < 0:
        raise ValueError(f'원속도 음성과 말끝 여백에 {sum(minimum) / FPS:.1f}초가 필요합니다. 대사를 줄여 주세요.')
    spare = [max(0, s['seconds'] * FPS - m) for s, m in zip(shots, minimum)]
    total = sum(spare)
    shares = [remaining * room / total if total else 0 for room in spare]
    lengths = [m + math.floor(share) for m, share in zip(minimum, shares)]
    fractions = sorted(range(len(shares)), key=lambda i: shares[i] % 1, reverse=True)
    for i in fractions[:FRAMES - sum(lengths)]:
        lengths[i] += 1
    starts = accumulate([0, *lengths[:-1]])
    return [Cut(start, length, voice) for start, length, voice in zip(starts, lengths, durations)]


def score_cues(episode, cuts):
    # The editor's cue inside a shot follows that shot when speech changes the picture boundaries.
    result = []
    for cue in episode['music']:
        planned = 0
        for shot, cut in zip(episode['shots'], cuts):
            if cue['at'] < planned + shot['seconds']:
                fraction = (cue['at'] - planned) / shot['seconds']
                result.append({**cue, 'at': round(cut.start + fraction * cut.frames / FPS, 4)})
                break
            planned += shot['seconds']
    return result
