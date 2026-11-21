"""Decode the delivered file before counting it toward today's quota."""
from contextlib import closing


def verify_movie(path):
    import imageio_ffmpeg as io
    with closing(io.read_frames(str(path))) as reader:
        metadata = next(reader)
    frames, seconds = io.count_frames_and_secs(str(path))
    if (metadata.get('codec') != 'h264' or metadata.get('audio_codec') != 'aac'
            or metadata.get('source_size') != (1080, 1920) or metadata.get('fps') != 30
            or frames != 900 or abs(seconds - 30) > .02 or abs(metadata.get('duration', 0) - 30) > .04):
        raise ValueError(f'쇼츠 검증 실패: {metadata}, {frames} frames, {seconds}s')
    return {'codec': 'H.264/AAC', 'width': 1080, 'height': 1920, 'fps': 30, 'frames': frames, 'seconds': seconds}
