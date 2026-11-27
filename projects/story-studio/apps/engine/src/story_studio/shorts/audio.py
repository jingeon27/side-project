"""Edit the picture to the voice and arrange an acoustic score around both."""
from functools import lru_cache
from pathlib import Path

from ..media import ffmpeg
from .timing import FPS, LEAD, plan_cuts, score_cues
from .voice import narrate, speaker_for

RATE = 48000
# Times are beats. Pitch intervals are relative to the episode's bass or piano root.
BASS_PART = {
    'tap': [(0, 'bass', 0, .10)],
    'pulse': [(0, 'bass', 0, .16), (1.55, 'shaker', 0, .032), (2.72, 'bass', 7, .09),
              (4.05, 'bass', 3, .13), (5.48, 'shaker', 0, .023), (6.64, 'bass', 5, .10)],
    'steps': [(.15, 'bass', 7, .14), (2.3, 'bass', 3, .11), (4.55, 'bass', 0, .15)],
    'bell': [(0, 'piano', 7, .10)],
    'resolve': [(.2, 'bass', 0, .13), (.35, 'piano', 3, .08), (2.65, 'piano', 7, .09),
                (4.75, 'bass', 0, .10)],
    'silence': [],
}
PIANO_PART = {
    'tap': [(.6, 'piano', 7, .10)],
    'pulse': [(0, 'piano', -5, .12), (2.85, 'piano', 2, .07), (5.2, 'piano', 0, .09)],
    'steps': [(.18, 'piano', 0, .12), (1.56, 'piano', 3, .08), (2.93, 'piano', 7, .10),
              (4.55, 'piano', 5, .075)],
    'bell': [(0, 'piano', 12, .095)],
    'resolve': [(.1, 'piano', 5, .10), (1.9, 'piano', 0, .12)],
    'silence': [],
}


@lru_cache(maxsize=64)
def note(instrument, pitch):
    import numpy as np
    import soundfile as sf
    source, native_rate = sf.read(Path(__file__).with_name('sounds') / f'{instrument}.flac', dtype='float32')
    native_pitch = {'bass': 45, 'piano': 57, 'shaker': 0}[instrument]
    increment = native_rate / RATE * 2 ** ((pitch - native_pitch) / 12)
    positions = np.arange(0, len(source) - 1, increment)
    return np.interp(positions, np.arange(len(source)), source).astype('float32')


def score(episode, cues):
    import numpy as np
    music = np.zeros(RATE * 30, dtype='float32')
    bass_led = episode['theme'] == 'vermilion'
    arrangement = BASS_PART if bass_led else PIANO_PART
    beat = 60 / (78 if bass_led else 67)
    bass_root = 36 + episode['tonic'] % 12
    piano_root = episode['tonic'] if not bass_led else bass_root + 24
    for index, cue in enumerate(cues):
        end = round(cues[index + 1]['at'] * RATE) if index + 1 < len(cues) else len(music)
        section = music[round(cue['at'] * RATE):end]
        repeats = range(0, round(len(section) / RATE / beat) + 1, 8) if cue['mode'] == 'pulse' else [0]
        for bar in repeats:
            for onset, instrument, interval, gain in arrangement[cue['mode']]:
                start = round((bar + onset) * beat * RATE)
                root = {'piano': piano_root, 'bass': bass_root, 'shaker': 0}[instrument]
                sound = note(instrument, root + interval)
                size = min(len(sound), len(section) - start)
                if size > 0:
                    section[start:start + size] += gain * sound[:size]
        fade = min(round(.22 * RATE), len(section))
        if fade:
            section[-fade:] *= np.linspace(1, 0, fade)
    return music


def voice_take(path, decoded):
    import numpy as np
    import soundfile as sf
    ffmpeg('-i', path, '-ar', RATE, '-ac', 1, '-c:a', 'pcm_f32le', decoded)
    audio, _ = sf.read(decoded, dtype='float32')
    if not len(audio) or not np.isfinite(audio).all():
        raise ValueError('비어 있거나 읽을 수 없는 녹음입니다.')
    # Detect only the outer silence. Retain the quiet consonants and release around it.
    peak = float(np.max(abs(audio)))
    active = np.flatnonzero(abs(audio) > max(.00025, peak * .0015))
    if peak < .002 or not len(active):
        raise ValueError('음성 파일에서 내레이션을 찾을 수 없습니다.')
    take = audio[max(0, active[0] - round(.065 * RATE)):active[-1] + round(.16 * RATE) + 1]
    voiced = take[abs(take) > peak * .04]
    gain = min(.16 / float(np.sqrt(np.mean(voiced ** 2))), .89 / peak)
    return take * gain


def subtitle_spans(shot, cut, take):
    """Use phrase length as a guide, then snap to a nearby quiet 60 ms of the reading."""
    import numpy as np
    lines = [line.strip() for line in shot['caption'].splitlines() if line.strip()]
    start = cut.first + round(shot.get('voiceLead', LEAD) * FPS)
    length = round(len(take) / RATE * FPS)
    weights = [max(1, len(''.join(line.split()))) for line in lines]
    bounds = [0]
    step = RATE // FPS
    for i in range(1, len(lines)):
        predicted = round(length * sum(weights[:i]) / sum(weights))
        low = max(bounds[-1] + 1, predicted - FPS)
        high = min(length - (len(lines) - i), predicted + FPS)
        if high < low:
            raise ValueError('음성에 맞게 자막 줄 수를 줄여 주세요.')
        def cost(frame):
            pos = frame * step
            window = take[max(0, pos-step):min(len(take), pos+step)]
            return float(np.sqrt(np.mean(window ** 2))) + .016 * abs(frame - predicted) / FPS
        bounds.append(min(range(low, high + 1), key=cost))
    bounds.append(max(bounds[-1] + 1, length))
    return [(start + a, start + b, line) for a, b, line in zip(bounds, bounds[1:], lines)]


def make_mix(episode, source, output, temp, data, cache):
    import numpy as np
    import soundfile as sf
    takes = []
    for i, shot in enumerate(episode['shots']):
        if 'voice' not in shot:
            takes.append(None)
            continue
        raw = (source / shot['recording'] if 'recording' in shot
               else narrate(data, cache, shot['voice'], speaker_for(episode, shot), shot.get('voiceTake', 1)))
        takes.append(voice_take(raw, temp / f'take-{i}.wav'))
    cuts = plan_cuts(episode['shots'], [len(take) / RATE if take is not None else 0 for take in takes])
    cues = score_cues(episode, cuts)
    voice = np.zeros(RATE * 30, dtype='float32')
    captions = []
    for shot, cut, take in zip(episode['shots'], cuts, takes):
        if take is None:
            captions.append([])
            continue
        start = round((cut.start + shot.get('voiceLead', LEAD)) * RATE)
        voice[start:start + len(take)] = take
        captions.append(subtitle_spans(shot, cut, take))
    # Smooth 10 ms envelope. Longer rests let the acoustic decay come through.
    blocks = np.max(np.abs(voice.reshape(-1, RATE // 100)), axis=1)
    active = np.convolve((blocks > .018).astype(float), np.ones(31) / 31, mode='same')
    duck = np.interp(np.arange(len(voice)), np.arange(len(active)) * (RATE // 100), active)
    bed = score(episode, cues) * (.58 - .34 * duck)
    mix = voice + bed
    scale = min(1.0, .94 / max(.01, float(np.max(abs(mix)))))
    for name, samples in [('narration', voice), ('music', bed)]:
        sf.write(output / f'{name}.wav', samples * scale, RATE, subtype='PCM_16')
    raw_mix = temp / 'premaster.wav'
    sf.write(raw_mix, mix * scale, RATE, subtype='PCM_24')
    ffmpeg('-i', raw_mix, '-af', 'loudnorm=I=-16:TP=-1.7:LRA=9', '-ar', RATE, '-c:a', 'pcm_s16le', output / 'mix.wav')
    return cuts, cues, captions
