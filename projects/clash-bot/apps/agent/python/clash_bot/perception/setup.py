"""Reproducible, project-local CPU perception setup. No account data is copied."""

import argparse
import json
import shutil
import subprocess

from clash_bot.downloads import digest, download
from clash_bot.paths import ASSETS_DIR, DATA_DIR, PROJECT_DIR, REQUIREMENTS_DIR, RUNTIME_PYTHON
from clash_bot.runtime_guard import refuse_while_running

DATA = DATA_DIR
CROP = {
    "repo": "SudhishNeel/clash-royale-detector",
    "revision": "5cebaf527242a6a848c79ba697d5568d3f403276",
    "file": "crop_classifier/model.pt",
    "sha256": "0a3b5189e0b3f639dc4b57ba96aaea8d2783263900ce5417f58a3939aa333ade",
    "size": 88542374,
}
PROPOSAL_SHA = "4cf422370650b1d18647cffc05e02bf75fdc2fbdb1f8ef983f4b8d6f8ea908b3"


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--verify-only", action="store_true")
    options = args.parse_args()
    directory = DATA / "counterpush/detector"
    python = RUNTIME_PYTHON
    if not python.exists():
        raise SystemExit("먼저 yarn workspace @side/clash-bot runtime:setup 을 실행해주세요.")
    if not options.verify_only:
        refuse_while_running("인식 모델을 준비")
        directory.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [str(python), "-m", "pip", "install", "-r", str(REQUIREMENTS_DIR / "perception.lock")],
            check=True,
        )
        download(
            f"https://huggingface.co/{CROP['repo']}/resolve/{CROP['revision']}/{CROP['file']}",
            directory / "crop-model.pt",
            CROP["sha256"],
            CROP["size"],
        )
        download(
            "https://raw.githubusercontent.com/Pbatch/ClashRoyaleBuildABot/"
            "f89ecbf309e698cb9fccdfb64a6ff2a930e6541e/clashroyalebuildabot/models/units_M_480x352.onnx",
            directory / "units_M_480x352.onnx",
            PROPOSAL_SHA,
            30896276,
        )
        (directory / "crop-manifest.json").write_text(json.dumps(CROP, indent=2) + "\n")
        exported = directory / "crop-export.json"
        valid_export = (
            exported.exists()
            and (directory / "crop-classes.json").exists()
            and (directory / "crop-classifier.onnx").exists()
        )
        if valid_export:
            previous = json.loads(exported.read_text())
            valid_export = all(
                previous.get(key) == value for key, value in CROP.items()
            ) and digest(directory / "crop-classifier.onnx") == previous.get("onnx_sha256")
        if not valid_export:
            subprocess.run(
                [
                    str(python),
                    "-m",
                    "pip",
                    "install",
                    "-r",
                    str(REQUIREMENTS_DIR / "conversion.lock"),
                ],
                check=True,
            )
            subprocess.run(
                [str(python), "-m", "clash_bot.perception.dino_export", str(directory)], check=True
            )
        for source in (ASSETS_DIR / "counterpush").glob("*"):
            if source.is_file() and not (directory / source.name).exists():
                shutil.copyfile(source, directory / source.name)
        atlas = directory / "atlas.json"
        if (
            not atlas.exists()
            or not (directory / "atlas.npz").exists()
            or json.loads(atlas.read_text()).get("model_sha256")
            != json.loads(exported.read_text())["onnx_sha256"]
        ):
            subprocess.run(
                [str(python), "-m", "clash_bot.perception.build_atlas", str(directory)], check=True
            )
        profile = DATA / "counterpush/profile.json"
        if not profile.exists():
            shutil.copyfile(PROJECT_DIR / "profiles/counterpush.json", profile)
    manifest = json.loads((directory / "crop-export.json").read_text())
    if any(manifest.get(key) != value for key, value in CROP.items()):
        raise ValueError("Unexpected crop model revision")
    for name, expected in [
        ("crop-model.pt", CROP["sha256"]),
        ("crop-classifier.onnx", manifest["onnx_sha256"]),
        ("units_M_480x352.onnx", PROPOSAL_SHA),
    ]:
        if digest(directory / name) != expected:
            raise ValueError("Model checksum mismatch: " + name)
    print(
        json.dumps(
            {
                "verified": True,
                "directory": str(directory),
                "runtime": "CPU ONNX",
                "custom_references_preserved": True,
            }
        )
    )


if __name__ == "__main__":
    main()
