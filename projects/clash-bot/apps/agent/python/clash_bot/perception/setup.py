"""Reproducible, project-local CPU perception setup. No account data is copied."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import urllib.request

from clash_bot.paths import ASSETS_DIR, DATA_DIR, PROJECT_DIR, REQUIREMENTS_DIR

DATA = DATA_DIR
CROP = {
    "repo": "SudhishNeel/clash-royale-detector",
    "revision": "5cebaf527242a6a848c79ba697d5568d3f403276",
    "file": "crop_classifier/model.pt",
    "sha256": "0a3b5189e0b3f639dc4b57ba96aaea8d2783263900ce5417f58a3939aa333ade",
    "size": 88542374,
}
PROPOSAL_SHA = "4cf422370650b1d18647cffc05e02bf75fdc2fbdb1f8ef983f4b8d6f8ea908b3"


def digest(path):
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def download(url, target, expected, size):
    if target.exists() and target.stat().st_size == size and digest(target) == expected:
        return
    temporary = target.with_suffix(target.suffix + ".download")
    try:
        with urllib.request.urlopen(url, timeout=30) as response, temporary.open("wb") as output:
            total = 0
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > size:
                    raise ValueError("Unexpected model size")
                output.write(chunk)
        if total != size or digest(temporary) != expected:
            raise ValueError("Model checksum mismatch: " + target.name)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--verify-only", action="store_true")
    options = args.parse_args()
    directory = DATA / "counterpush/detector"
    python = DATA / "qwen/.venv/bin/python"
    if not python.exists():
        raise SystemExit("먼저 yarn workspace @side/clash-bot qwen:setup 을 실행해주세요.")
    lock = DATA / "qwen/selfplay/lock.json"
    if lock.exists() and not options.verify_only:
        owner = json.loads(lock.read_text())
        try:
            os.kill(owner["pid"], 0)
        except ProcessLookupError:
            pass
        else:
            raise SystemExit("실행 중인 봇을 stop으로 종료한 뒤 인식 모델을 준비해주세요.")
    if not options.verify_only:
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
        hand = ASSETS_DIR / "counterpush/hand-templates"
        for source in hand.rglob("*.png"):
            target = DATA / "templates" / source.relative_to(hand)
            if not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, target)
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
