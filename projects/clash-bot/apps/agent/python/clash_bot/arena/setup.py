"""Install only the pinned native Mac engine into the existing project venv."""

import hashlib
import json
import platform
import subprocess
import sys
import tarfile
import urllib.request

from clash_bot.downloads import download
from clash_bot.paths import CONTRACTS_DIR, DATA_DIR, RUNTIME_PYTHON
from clash_bot.runtime_guard import refuse_while_running


def main():
    spec = json.loads((CONTRACTS_DIR / "arena.json").read_text())
    if sys.platform != "darwin" or platform.machine() != "arm64":
        raise RuntimeError("The pinned engine wheel currently supports Apple Silicon macOS.")
    python = RUNTIME_PYTHON
    if not python.exists():
        raise RuntimeError(
            "Run runtime:setup first; the local arena uses the project Python environment."
        )
    refuse_while_running("자가대국 엔진을 준비")
    metadata = json.load(
        urllib.request.urlopen(
            f"https://pypi.org/pypi/royalesim/{spec['version']}/json", timeout=20
        )
    )
    asset = next(row for row in metadata["urls"] if row["filename"] == spec["wheel"])
    if asset["digests"]["sha256"] != spec["sha256"]:
        raise ValueError("Pinned wheel identity changed")
    path = DATA_DIR / "arena/vendor" / spec["wheel"]
    path.parent.mkdir(parents=True, exist_ok=True)
    # A partial earlier download is replaced instead of failing its checksum on every run.
    download(asset["url"], path, spec["sha256"], asset["size"])
    source_asset = next(row for row in metadata["urls"] if row["filename"].endswith(".tar.gz"))
    if source_asset["digests"]["sha256"] != spec["sourceSHA256"]:
        raise ValueError("Pinned engine source identity changed")
    source = path.parent / source_asset["filename"]
    download(source_asset["url"], source, spec["sourceSHA256"], source_asset["size"])
    with tarfile.open(source) as archive:
        name = f"royalesim-{spec['version']}/data/derived/{spec['tableFile']}"
        table = archive.extractfile(name).read()
    if hashlib.sha256(table).hexdigest() != spec["tableSHA256"]:
        raise ValueError("Pinned source card table checksum mismatch")
    output = DATA_DIR / "arena/rules/source" / spec["tableFile"]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(table)
    subprocess.run([str(python), "-m", "pip", "install", "--no-deps", str(path)], check=True)
    print(
        json.dumps(
            {
                "installed": True,
                "engine": spec["engine"],
                "version": spec["version"],
                "sha256": spec["sha256"],
            }
        )
    )


if __name__ == "__main__":
    main()
