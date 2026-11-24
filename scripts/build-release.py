#!/usr/bin/env python3
"""Build deterministic ZIP and offline Node installer from a clean committed tree."""
from __future__ import annotations

import base64
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def run_git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()


def package_paths(package: dict) -> list[str]:
    tracked = run_git("ls-files", "-z").split("\0")
    tracked_set = {path for path in tracked if path}
    paths: set[str] = set()
    for entry in package.get("files", []):
        entry = entry.rstrip("/")
        if entry in tracked_set:
            paths.add(entry)
            continue
        prefix = f"{entry}/"
        matches = [path for path in tracked_set if path.startswith(prefix)]
        if not matches:
            raise ValueError(f"Package allowlist entry has no tracked files: {entry}")
        paths.update(matches)
    paths.discard("MANIFEST.sha256")
    paths.discard("docs/overhaul")
    paths = {path for path in paths if not path.startswith("docs/overhaul/")}
    if not paths:
        raise ValueError("Package allowlist is empty")
    suspicious = [path for path in paths if Path(path).name in {".env", ".npmrc", "credentials", "credentials.json"} or ".far/" in f"/{path}"]
    if suspicious:
        raise ValueError(f"Secret/state path in package allowlist: {suspicious[0]}")
    return sorted(paths)


def assert_clean() -> str:
    status = run_git("status", "--porcelain=v1", "--untracked-files=all")
    if status:
        raise ValueError("Release source must be clean and committed; build from a disposable clean checkout")
    return run_git("rev-parse", "HEAD")


def source_date_epoch(commit: str) -> int:
    raw = os.environ.get("SOURCE_DATE_EPOCH")
    value = int(raw) if raw else int(run_git("show", "-s", "--format=%ct", commit))
    return max(315532800, value)


def copy_staging(paths: list[str], stage: Path) -> None:
    for relative in paths:
        source = ROOT / relative
        if not source.is_file() or source.is_symlink():
            raise ValueError(f"Package input is not a regular file: {relative}")
        target = stage / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        target.chmod(0o755 if source.stat().st_mode & 0o111 else 0o644)


def build(output: Path) -> dict[str, object]:
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Output must be outside the source package")
    package = json.loads((ROOT / "package.json").read_text())
    name, version = package["name"], package["version"]
    commit = assert_clean()
    basename = f"{name}-{version}"
    archive = output / f"{basename}.zip"
    installer = output / f"{basename}-install.mjs"
    sums = output / f"{basename}-SHA256SUMS.txt"
    receipt = output / f"{basename}-RECEIPT.json"
    if any(path.exists() for path in [archive, installer, sums, receipt]):
        raise ValueError("Refusing to overwrite an existing release artifact")
    output.mkdir(parents=True, exist_ok=True)
    epoch = source_date_epoch(commit)
    date_time = time.gmtime(epoch)[:6]
    paths = package_paths(package)
    with tempfile.TemporaryDirectory(prefix="far-release-stage-", dir=output.parent) as temporary:
        stage = Path(temporary)
        copy_staging(paths, stage)
        manifest_paths = sorted(path for path in paths)
        manifest = "".join(f"{digest((stage / path).read_bytes())}  {path}\n" for path in manifest_paths)
        (stage / "MANIFEST.sha256").write_text(manifest)
        staged_paths = manifest_paths + ["MANIFEST.sha256"]
        entries = []
        for relative in staged_paths:
            source = stage / relative
            data = source.read_bytes()
            entries.append({"path": relative, "data": base64.b64encode(data).decode(), "sha256": digest(data), "mode": 0o755 if source.stat().st_mode & 0o111 else 0o644})
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipped:
            for entry in entries:
                info = zipfile.ZipInfo(f"{basename}/{entry['path']}", date_time=date_time)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = (0o100000 | entry["mode"]) << 16
                zipped.writestr(info, base64.b64decode(entry["data"]))
        payload = base64.b64encode(gzip.compress(json.dumps(entries, separators=(",", ":"), sort_keys=True).encode(), mtime=0)).decode()
        template = (ROOT / "scripts/installer-template.mjs").read_text()
        if template.count("'__FAR_EMBEDDED_PAYLOAD__'") != 1:
            raise ValueError("Installer payload sentinel mismatch")
        installer_text = template.replace("'__FAR_EMBEDDED_PAYLOAD__'", json.dumps(payload)).replace("__FAR_NAME__", name).replace("__FAR_VERSION__", version)
        installer.write_text(installer_text)
        installer.chmod(0o755)
    checksums = "".join(f"{digest(path.read_bytes())}  {path.name}\n" for path in [archive, installer])
    sums.write_text(checksums)
    result = {"schemaVersion": 1, "package": name, "version": version, "sourceCommit": commit, "files": len(staged_paths), "zip": str(archive), "installer": str(installer), "checksums": str(sums), "receipt": str(receipt), "sourceDateEpoch": epoch}
    receipt_data = {"schemaVersion": 1, "product": name, "version": version, "sourceCommit": commit, "files": len(staged_paths), "sourceDateEpoch": epoch, "artifacts": [{"file": path.name, "sha256": digest(path.read_bytes())} for path in [archive, installer, sums]], "publication": "NOT_PUBLISHED"}
    receipt.write_text(json.dumps(receipt_data, indent=2) + "\n")
    return result


if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 scripts/build-release.py /absolute/output/directory")
        print(json.dumps(build(Path(sys.argv[1])), indent=2))
    except Exception as exc:
        print(f"Build failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
