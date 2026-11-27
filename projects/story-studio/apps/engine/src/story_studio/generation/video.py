"""Wan2.2 TI2V video from a scene image or text with bounded local resources."""
import sys
from ..assets import asset_path, asset_url, owned_asset
from ..catalog import VIDEO_MODEL_DIRECTORY
from ..media import ffmpeg

FPS = 24
# TI2V-5B needs sizes divisible by 32 and was trained at 720p; the draft keeps 480p.
PLANS = {
    "draft": {"sizes": {"16:9": (832, 480), "9:16": (480, 832), "1:1": (640, 640)}, "frames": 49, "steps": 12},
    "standard": {"sizes": {"16:9": (1280, 704), "9:16": (704, 1280), "1:1": (928, 928)}, "frames": 81, "steps": 30},
}


def video_plan(request):
    plan = PLANS[request.get("quality", "draft")]
    width, height = plan["sizes"][request.get("ratio", "16:9")]
    duration = min(15, max(2, request.get("duration", 5)))
    # Generate real-time 24 fps motion (4n+1 frames) up to the quality budget, then fit the scene length.
    frames = min(plan["frames"], int(duration * FPS // 4) * 4 + 1)
    tiling = request.get("tiling", "aggressive")
    if tiling not in ("aggressive", "auto"):
        raise ValueError("영상 타일 방식은 aggressive 또는 auto여야 합니다")
    return {"width": width, "height": height, "duration": duration, "frames": frames, "steps": plan["steps"],
            "tiling": tiling}


def generate_video(root, request, progress, examples_dir):
    import mlx.core as mx
    from mlx_video.models.wan_2.generate import generate_video as generate_wan
    from mlx_video.models.wan_2.utils import load_vae_decoder
    from transformers import AutoTokenizer
    from unittest.mock import patch
    mx.set_cache_limit(256 * 1024**2)
    mx.set_memory_limit(20 * 1024**3)
    plan = video_plan(request)
    # The scene image becomes the first frame, so the people and place stay the same in motion.
    image = owned_asset(root, request["image"], "png", examples_dir) if request.get("image") else None
    path = asset_path(root, "mp4")
    negatives = "blurry, static, text, subtitles, watermark, disfigured, extra limbs"
    if request.get('format') in ('animation', 'webtoon'):
        negatives += ", live action, photograph"
    progress("장면 이미지에서 움직임을 만드는 중" if image else "Wan 로컬 영상 모델로 장면을 생성하는 중")
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
        generate_wan(str(root / "local/models" / VIDEO_MODEL_DIRECTORY), request["prompt"],
                     negative_prompt=negatives, image=str(image) if image else None,
                     width=plan["width"], height=plan["height"], num_frames=plan["frames"], steps=plan["steps"],
                     guide_scale=5.0, seed=request.get('seed', -1),
                     output_path=str(path), no_compile=True, tiling=plan["tiling"])
    retimed = asset_path(root, "mp4")
    ffmpeg("-i", path, "-vf", f"setpts={plan['duration'] * FPS / plan['frames']}*PTS,fps=24", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", retimed)
    path.unlink(missing_ok=True)
    return {"asset": asset_url(retimed), "duration": plan["duration"]}
