"""Offline inference worker. One GPU job at a time; JSON protocol over stdin/stdout."""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
import uuid

os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1", DO_NOT_TRACK="1")
PROTOCOL = sys.stdout
STATE = {}


def clear_active():
    if not STATE.get('root'):
        return
    active = STATE['root'] / 'local/active.json'
    try:
        if json.loads(active.read_text())['pid'] == os.getpid():
            active.unlink(missing_ok=True)
    except (OSError, ValueError, KeyError):
        pass


def emit(value):
    try:
        print(json.dumps(value, ensure_ascii=False), file=PROTOCOL, flush=True)
    except (BrokenPipeError, OSError):
        pass


def stop_worker(signum, frame):
    STATE['cancelled'] = True
    raise InterruptedError('사용자가 생성을 중단했습니다')


def save_task(status, **fields):
    if not STATE.get('taskId'):
        return
    folder = STATE['root'] / 'tasks'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (STATE['taskId'] + '.json')
    temporary = folder / (STATE['taskId'] + '.' + str(uuid.uuid4()) + '.partial')
    temporary.write_text(json.dumps({'id': STATE['taskId'], 'status': status, 'ownerPid': os.getpid(), **fields}, ensure_ascii=False))
    temporary.replace(target)


def progress(message):
    save_task('RUNNING' if STATE.get('running') else 'PENDING', progress=message)
    emit({"progress": message})


def asset_path(root, extension):
    folder = root / "assets"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / f"{uuid.uuid4()}.{extension}"


def asset_url(path):
    return "/api/assets/" + path.name


def owned_asset(root, url, extension):
    if not re.fullmatch(r"/api/assets/[a-f0-9-]{36}\." + extension, url):
        raise ValueError("지원하지 않는 로컬 파일 경로입니다")
    path = root / "assets" / url.split("/")[-1]
    if not path.is_file():
        path = Path(__file__).resolve().parents[2] / "public/examples" / url.split("/")[-1]
        if not path.is_file():
            raise ValueError("원본 파일을 찾을 수 없습니다")
    return path


def generate_text(root, request):
    import mlx.core as mx
    from mlx_vlm import generate, load
    from mlx_vlm.prompt_utils import apply_chat_template
    from mlx_vlm.structured import build_json_schema_logits_processor
    mx.set_cache_limit(256 * 1024**2)
    mx.set_memory_limit(20 * 1024**3)
    progress("Qwen 3.8 로컬 모델을 불러오는 중")
    model, processor = load(str(root / "local/models/text"), trust_remote_code=False)
    messages = [{"role": "system", "content": request["system"]},
                {"role": "user", "content": json.dumps(request["input"], ensure_ascii=False)}]
    prompt = apply_chat_template(processor, model.config, messages, enable_thinking=False)
    progress("한국어 원고를 작성하는 중")
    result = generate(model, processor, prompt, max_tokens=request.get("maxTokens", 5000),
                      temperature=0.6, verbose=False, enable_thinking=False,
                      logits_processors=[build_json_schema_logits_processor(processor.tokenizer, request["schema"])])
    return json.loads(result.text)


def generate_voice(root, request):
    import mlx.core as mx
    import numpy as np
    import soundfile as sf
    from mlx_audio.tts.utils import load_model
    mx.set_cache_limit(256 * 1024**2)
    progress("한국어 음성 모델을 불러오는 중")
    model = load_model(root / "local/models/voice")
    text = re.sub(r"(?m)^[^\n:]{1,24}:\s*", "", request["text"]).strip()
    progress("한국어 목소리를 만드는 중")
    chunks = []
    sample_rate = 24000
    for result in model.generate(text=text, voice="Sohee", lang_code="Korean",
                                 instruct="차분하고 따뜻한 한국어 이야기 내레이션", max_tokens=4096,
                                 split_pattern=r"\n+", verbose=False):
        chunks.append(np.asarray(result.audio))
        sample_rate = result.sample_rate
    if not chunks:
        raise ValueError("음성 모델이 소리를 반환하지 않았습니다")
    audio = np.concatenate(chunks)
    if not np.isfinite(audio).all() or np.abs(audio).max() < 0.0001:
        raise ValueError("생성한 음성이 비어 있습니다")
    path = asset_path(root, "wav")
    sf.write(path, audio, sample_rate)
    return {"asset": asset_url(path), "duration": round(len(audio) / sample_rate, 3)}


def ffmpeg(*arguments):
    import imageio_ffmpeg
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_threads", "1", "-y", *map(str, arguments[:-1]), "-threads", "2", str(arguments[-1])], check=True)


def generate_visual(root, request, still=False):
    import mlx.core as mx
    from mlx_video.models.wan_2.generate import generate_video
    from mlx_video.models.wan_2.utils import load_vae_decoder
    from transformers import AutoTokenizer
    from unittest.mock import patch
    mx.set_cache_limit(256 * 1024**2)
    # A compact local preview. Frames are truly generated by Wan, not a pan over a still image.
    ratio = request.get("ratio", "16:9")
    mx.set_memory_limit(20 * 1024**3)
    draft = request.get('quality', 'draft') == 'draft'
    width, height = ({"16:9": (512, 288), "9:16": (288, 512), "1:1": (384, 384)} if draft else {"16:9": (640, 368), "9:16": (368, 640), "1:1": (480, 480)})[ratio]
    duration = min(15, max(2, request.get("duration", 5)))
    frames = 1 if still else min(33 if draft else 81, int(duration * 8 // 4) * 4 + 1)
    path = asset_path(root, "mp4")
    negatives = "blurry, static, text, subtitles, watermark, disfigured, extra limbs"
    if request.get('format') in ('animation', 'webtoon'):
        negatives += ", live action, photograph"
    progress("Wan 로컬 영상 모델로 장면을 생성하는 중")
    # The pinned upstream loader hardcodes a Hub identifier; route that one tokenizer to our pinned local directory.
    original_loader = AutoTokenizer.from_pretrained
    def compact_encoder(model_path, config):
        # Wan's official t5_dtype is bfloat16. The pinned MLX loader upcasts all
        # weights to float32 (~23 GB); retain bf16 and its float32 attention softmax.
        from mlx_video.models.wan_2.text_encoder import T5Encoder
        encoder = T5Encoder(
            vocab_size=config.t5_vocab_size, dim=config.t5_dim,
            dim_attn=config.t5_dim_attn, dim_ffn=config.t5_dim_ffn,
            num_heads=config.t5_num_heads, num_layers=config.t5_num_layers,
            num_buckets=config.t5_num_buckets, shared_pos=False,
        )
        encoder.load_weights([(key, value.astype(mx.bfloat16)) for key, value in mx.load(str(model_path)).items()])
        mx.eval(encoder.parameters())
        print(f"T5 loaded: active={mx.get_active_memory() / 1024**3:.2f} GiB, peak={mx.get_peak_memory() / 1024**3:.2f} GiB", file=sys.stderr)
        return encoder
    def profiled_decoder(*args, **kwargs):
        print(f"Before VAE: active={mx.get_active_memory() / 1024**3:.2f} GiB, peak={mx.get_peak_memory() / 1024**3:.2f} GiB", file=sys.stderr)
        return load_vae_decoder(*args, **kwargs)
    def local_tokenizer(name, *args, **kwargs):
        if name != "google/umt5-xxl":
            raise ValueError("지원하지 않는 토크나이저입니다")
        kwargs["local_files_only"] = True
        return original_loader(str(root / "local/models/tokenizer"), *args, **kwargs)
    with patch.object(AutoTokenizer, "from_pretrained", side_effect=local_tokenizer), \
         patch("mlx_video.models.wan_2.generate.load_t5_encoder", side_effect=compact_encoder), \
         patch("mlx_video.models.wan_2.generate.load_vae_decoder", side_effect=profiled_decoder):
        generate_video(str(root / "local/models/video"), request["prompt"],
                       negative_prompt=negatives,
                       width=width, height=height, num_frames=frames, steps=12 if draft else 20, guide_scale=5.0, seed=request.get('seed', -1),
                       output_path=str(path), no_compile=True, tiling="aggressive")
    if still:
        image = asset_path(root, "png")
        ffmpeg("-i", path, "-frames:v", 1, image)
        path.unlink(missing_ok=True)
        return {"asset": asset_url(image)}
    # The native pipeline writes 16 fps. Retime to the requested scene length without dropping motion.
    retimed = asset_path(root, "mp4")
    ffmpeg("-i", path, "-vf", f"setpts={duration * 16 / frames}*PTS,fps=24", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", retimed)
    path.unlink(missing_ok=True)
    return {"asset": asset_url(retimed), "duration": duration}


def compose(root, request):
    """Mux local video and Korean voice, burn subtitles, concatenate normalized clips."""
    import soundfile as sf
    import tempfile
    progress("한국어 목소리와 자막을 영상에 넣는 중")
    with tempfile.TemporaryDirectory(dir=root / "local") as folder:
        folder = Path(folder)
        parts = []
        for index, scene in enumerate(request["scenes"]):
            video = owned_asset(root, scene["video"], "mp4")
            voice = owned_asset(root, scene["voice"], "wav") if scene.get("voice") else None
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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    args = parser.parse_args()
    root = Path(args.data_dir).resolve()
    os.nice(10)
    STATE['root'] = root
    signal.signal(signal.SIGTERM, stop_worker)
    os.environ["HF_HOME"] = str(root / "local/cache")
    (root / "local").mkdir(parents=True, exist_ok=True)
    request = json.load(sys.stdin)
    if request.get('taskId'):
        if not re.fullmatch(r'local-[a-f0-9-]{36}', request['taskId']):
            raise ValueError('올바른 로컬 작업이 아닙니다')
        STATE.update(root=root, taskId=request['taskId'], running=False)
    started = time.monotonic()
    with (root / "local/gpu.lock").open("a") as lock:
        progress("로컬 모델 실행 순서를 기다리는 중")
        if request['action'] != 'compose':
            fcntl.flock(lock, fcntl.LOCK_EX)
        STATE['running'] = True
        if request['action'] != 'compose':
            (root / 'local/active.json').write_text(json.dumps({'pid': os.getpid(), 'action': request['action'], 'taskId': request.get('taskId')}))
        with contextlib.redirect_stdout(sys.stderr):
            if request["action"] == "text":
                result = generate_text(root, request)
            elif request["action"] == "voice":
                result = generate_voice(root, request)
            elif request["action"] in ("video", "image"):
                result = generate_visual(root, request, request["action"] == "image")
            elif request["action"] == "compose":
                result = compose(root, request)
            else:
                raise ValueError("지원하지 않는 작업입니다")
        save_task('SUCCEEDED', asset=result['asset']) if STATE.get('taskId') else None
        stats = {"elapsedSeconds": round(time.monotonic() - started, 2)}
        if 'mlx.core' in sys.modules:
            stats['peakMemoryGiB'] = round(sys.modules['mlx.core'].get_peak_memory() / 1024**3, 2)
        emit({"result": result, **stats})
        clear_active()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        traceback.print_exc(file=sys.stderr)
        save_task('FAILED', error='사용자가 영상 생성을 중단했습니다. 원고는 보존됩니다.' if STATE.get('cancelled') else '로컬 영상 생성이 중단되었습니다. 로컬 로그를 확인한 뒤 다시 시도해 주세요.')
        emit({"error": "로컬 모델 실행에 실패했습니다. 프로젝트의 로컬 로그를 확인해 주세요."})
        clear_active()
        sys.exit(1)
