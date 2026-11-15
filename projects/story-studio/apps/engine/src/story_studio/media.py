"""CPU-only media conversion and Korean subtitle composition."""
from pathlib import Path
import re
import subprocess
from .assets import asset_path, asset_url, owned_asset


def ffmpeg(*arguments):
    import imageio_ffmpeg
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_threads", "1", "-y", *map(str, arguments[:-1]), "-threads", "2", str(arguments[-1])], check=True)


def compose(root, request, examples_dir, progress):
    """Mux local video and Korean voice, burn subtitles, concatenate normalized clips."""
    import soundfile as sf
    import tempfile
    progress("한국어 목소리와 자막을 영상에 넣는 중")
    with tempfile.TemporaryDirectory(dir=root / "local") as folder:
        folder = Path(folder)
        parts = []
        for index, scene in enumerate(request["scenes"]):
            video = owned_asset(root, scene["video"], "mp4", examples_dir)
            voice = owned_asset(root, scene["voice"], "wav", examples_dir) if scene.get("voice") else None
            duration = max(2, sf.info(voice).duration + 0.4) if voice else scene["duration"]
            # ffmpeg's filter receives only generated temporary paths; user text lives in the SRT file.
            srt = folder / f"caption-{index}.srt"
            caption = re.sub(r"[<>]", "", scene["caption"]).replace("-->", "→")
            srt.write_text("1\n00:00:00,000 --> 00:30:00,000\n" + caption + "\n", encoding="utf-8")
            output = folder / f"part-{index}.mp4"
            subtitle_path = str(srt).replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
            style = "FontName=Apple SD Gothic Neo,FontSize=20,Outline=2,Shadow=0,MarginV=24,Alignment=2"
            filters = f"setpts={duration / scene['duration']}*PTS,fps=24,subtitles=filename='{subtitle_path}':force_style='{style}'"
            inputs = ["-i", str(video), "-i", str(voice)] if voice else ["-i", str(video), "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono"]
            ffmpeg(*inputs, "-vf", filters, "-map", "0:v:0", "-map", "1:a:0", "-af", "apad", "-t", str(duration),
                   "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "24000", "-ac", "1", output)
            parts.append(output)
        listing = folder / "parts.txt"
        listing.write_text("\n".join("file '" + str(part).replace("'", "'\\''") + "'" for part in parts), encoding="utf-8")
        path = asset_path(root, "mp4")
        ffmpeg("-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", "-movflags", "+faststart", path)
    return {"asset": asset_url(path)}
