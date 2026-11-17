"""FLUX.2 Klein scene images with an optional character reference."""
import random
from ..assets import asset_path, asset_url, owned_asset
from ..catalog import IMAGE_MODEL_DIRECTORY

# Klein works on 16 px latents; the video model crops these to its own size.
SIZES = {
    "draft": {"16:9": (1024, 576), "9:16": (576, 1024), "1:1": (768, 768)},
    "standard": {"16:9": (1360, 768), "9:16": (768, 1360), "1:1": (1024, 1024)},
}
REFERENCE_INSTRUCTION = " Keep the faces, hairstyles, body types and clothing of the people in the reference image identical."


def image_plan(request):
    width, height = SIZES[request.get("quality", "draft")][request.get("ratio", "16:9")]
    prompt = request["prompt"] + (REFERENCE_INSTRUCTION if request.get("reference") else "")
    seed = request.get("seed", -1)
    return {"width": width, "height": height, "prompt": prompt, "seed": seed if seed >= 0 else random.randrange(2**31)}


def generate_image(root, request, progress, examples_dir):
    import mlx.core as mx
    from mflux.models.common.config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit
    mx.set_cache_limit(256 * 1024**2)
    mx.set_memory_limit(20 * 1024**3)
    plan = image_plan(request)
    reference = owned_asset(root, request["reference"], "png", examples_dir) if request.get("reference") else None
    progress("FLUX.2 Klein 로컬 모델을 불러오는 중")
    # Setup saved the weights in 8 bits; mflux reads that level from the files instead of quantizing again.
    model = (Flux2KleinEdit if reference else Flux2Klein)(
        model_path=str(root / "local/models" / IMAGE_MODEL_DIRECTORY), model_config=ModelConfig.flux2_klein_4b())
    progress("인물 기준 이미지를 참고해 장면을 그리는 중" if reference else "장면 이미지를 그리는 중")
    result = model.generate_image(seed=plan["seed"], prompt=plan["prompt"], num_inference_steps=4,
                                  width=plan["width"], height=plan["height"],
                                  **({"image_paths": [str(reference)]} if reference else {}))
    path = asset_path(root, "png")
    # Save pixels only; mflux metadata would copy the story prompt into the file.
    result.image.save(path)
    return {"asset": asset_url(path)}
