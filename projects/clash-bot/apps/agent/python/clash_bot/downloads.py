"""Pinned downloads that never leave a partial or unverified file in place."""

import hashlib
import urllib.request


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
                    raise ValueError("Unexpected download size: " + target.name)
                output.write(chunk)
        if total != size or digest(temporary) != expected:
            raise ValueError("Download checksum mismatch: " + target.name)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
