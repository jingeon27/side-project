"""Private recording validation and 24kHz mono normalization."""
from ..assets import asset_path, asset_url
from ..media import ffmpeg
from .store import identifier


def normalize(root, request):
    import numpy as np
    import soundfile as sf
    upload_id = identifier(request['uploadId'])
    audio_format = request['format']
    if audio_format not in ('wav', 'flac', 'ogg', 'mov', 'matroska', 'mp3'):
        raise ValueError('지원하지 않는 녹음 형식입니다')
    source = root / 'voice-uploads' / upload_id / 'source'
    output = asset_path(root, 'wav')
    try:
        # Force a real media demuxer and disallow network protocols/playlists.
        ffmpeg('-protocol_whitelist', 'file,pipe', '-f', audio_format, '-i', source,
               '-map', '0:a:0', '-vn', '-ac', '1', '-ar', '24000', '-t', '30.1', '-c:a', 'pcm_s16le', output)
        audio, rate = sf.read(output, dtype='float32')
        if not 1 <= len(audio) / rate <= 30 or not np.isfinite(audio).all() or float(np.max(np.abs(audio))) < 0.0001:
            raise ValueError('1초 이상의 소리가 있는 녹음이 필요합니다')
        return {'asset': asset_url(output), 'duration': round(len(audio) / rate, 3)}
    except BaseException:
        output.unlink(missing_ok=True)
        raise
