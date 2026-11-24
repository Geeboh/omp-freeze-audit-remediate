#!/usr/bin/env python3
"""Build deterministic ZIP and offline installer from a clean tracked candidate."""
from __future__ import annotations
import base64
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def run_git(*args: str) -> str:
    return subprocess.check_output(["git", "-C", str(ROOT), *args], text=True).strip()

def metadata() -> dict:
    return json.loads((ROOT / "package.json").read_text())

def allowlisted_files() -> list[Path]:
    contract = json.loads((ROOT / "scripts/release-allowlist.json").read_text())
    paths = contract["paths"]
    tracked = run_git("ls-files", "--cached", "-z").split("\0")
    untracked = [x for x in run_git("ls-files", "--others", "--exclude-standard", "-z").split("\0") if x]
    if untracked:
        raise ValueError(f"Untracked release inputs are not allowed: {', '.join(untracked[:8])}")
    selected = []
    for rel in tracked:
        if not rel or rel == "MANIFEST.sha256":
            continue
        if any(rel == prefix or rel.startswith(prefix.rstrip("/") + "/") for prefix in paths):
            file = ROOT / rel
            if file.is_symlink() or not file.is_file():
                raise ValueError(f"Unsupported release input: {rel}")
            if rel.startswith((".far/", ".env", ".npmrc")) or any(part in {"credentials", "secrets"} for part in Path(rel).parts):
                raise ValueError(f"Sensitive release input: {rel}")
            selected.append(file)
    required = set(contract["required"]) - {"MANIFEST.sha256"}
    selected_names = {p.relative_to(ROOT).as_posix() for p in selected}
    missing = sorted(required - selected_names)
    if missing:
        raise ValueError(f"Required release inputs missing: {', '.join(missing)}")
    return sorted(selected)

def build(output: Path) -> dict:
    pkg = metadata()
    name, version = pkg["name"], pkg["version"]
    bun_constraint = pkg.get("engines", {}).get("bun", "")
    if not bun_constraint.startswith(">="):
        raise ValueError("package.json must declare a Bun minimum engine")
    bun_version = bun_constraint[2:]
    base = f"{name}-{version}"
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Output must be outside the source package")
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f"{base}.zip"
    installer = output / f"{base}-install.mjs"
    sums = output / f"{base}-SHA256SUMS.txt"
    receipt = output / f"{base}-release-receipt.json"
    for target in [archive, installer, sums, receipt]:
        if target.exists():
            raise ValueError(f"Refusing to overwrite existing artifact: {target}")
    source = allowlisted_files()
    source_commit = run_git("rev-parse", "HEAD")
    commit_epoch = int(run_git("show", "-s", "--format=%ct", "HEAD"))
    stamp = datetime.datetime.fromtimestamp(max(commit_epoch, 315532800), datetime.timezone.utc)
    entries = []
    manifest_lines = []
    for file in source:
        rel = file.relative_to(ROOT).as_posix()
        data = file.read_bytes()
        manifest_lines.append(f"{digest(data)}  {rel}\n")
        entries.append({"path": rel, "data": base64.b64encode(data).decode(), "sha256": digest(data), "mode": 0o755 if file.stat().st_mode & 0o111 else 0o644})
    manifest_data = "".join(manifest_lines).encode()
    entries.append({"path": "MANIFEST.sha256", "data": base64.b64encode(manifest_data).decode(), "sha256": digest(manifest_data), "mode": 0o644})
    entries.sort(key=lambda item: item["path"])
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for entry in entries:
            info = zipfile.ZipInfo(f"{base}/{entry['path']}", date_time=(stamp.year, stamp.month, stamp.day, stamp.hour, stamp.minute, stamp.second))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100000 | entry["mode"]) << 16
            z.writestr(info, base64.b64decode(entry["data"]))
    payload = base64.b64encode(gzip.compress(json.dumps(entries, separators=(",", ":")).encode(), mtime=0)).decode()
    template = (ROOT / "scripts/installer-template.mjs").read_text()
    if template.count("'__FAR_EMBEDDED_PAYLOAD__'") != 1 or template.count("'__FAR_PACKAGE_NAME__'") != 1 or template.count("'__FAR_BUN_VERSION__'") != 1:
        raise ValueError("Installer payload or package sentinel mismatch")
    installer.write_text(template.replace("'__FAR_EMBEDDED_PAYLOAD__'", json.dumps(payload)).replace("'__FAR_PACKAGE_NAME__'", json.dumps(base)).replace("'__FAR_BUN_VERSION__'", json.dumps(bun_version)))
    installer.chmod(0o755)
    sums.write_text("".join(f"{digest(path.read_bytes())}  {path.name}\n" for path in [archive, installer]))
    receipt_data = {"schemaVersion": 1, "product": name, "version": version, "sourceCommit": source_commit, "artifacts": [{"file": p.name, "sha256": digest(p.read_bytes())} for p in [archive, installer]], "manifestSha256": digest(manifest_data), "publication": "NOT_PUBLISHED"}
    receipt.write_text(json.dumps(receipt_data, indent=2) + "\n")
    return {"product": name, "version": version, "sourceCommit": source_commit, "files": len(entries), "zip": str(archive), "installer": str(installer), "checksums": str(sums), "receipt": str(receipt)}

if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python3 scripts/build-release.py /absolute/output/directory")
        print(json.dumps(build(Path(sys.argv[1])), indent=2))
    except Exception as exc:
        print(f"Build failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
