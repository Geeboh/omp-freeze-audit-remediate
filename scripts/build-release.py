#!/usr/bin/env python3
"""Build deterministic ZIP + offline Node installer. No network or third-party dependencies.
Run: python3 scripts/build-release.py /absolute/output/directory
The output directory must be outside the package root.
"""
from __future__ import annotations
import base64
import gzip
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
NAME = 'omp-freeze-audit-remediate-1.0.0'

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def source_files() -> list[Path]:
    result = []
    for p in sorted(ROOT.rglob('*')):
        rel = p.relative_to(ROOT)
        if any(x in {'.git', '.far', '__pycache__', 'node_modules'} for x in rel.parts):
            continue
        if p.is_symlink():
            raise ValueError(f'Symlink in package: {rel}')
        if p.is_file():
            result.append(p)
    return result

def build(output: Path) -> dict[str, str | int]:
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Output must be outside the source package')
    output.mkdir(parents=True, exist_ok=True)
    files = [p for p in source_files() if p.name != 'MANIFEST.sha256']
    manifest = ROOT / 'MANIFEST.sha256'
    manifest.write_text(''.join(f'{digest(p.read_bytes())}  {p.relative_to(ROOT).as_posix()}\n' for p in files))
    files = source_files()
    entries = []
    for p in files:
        data = p.read_bytes()
        entries.append({'path':p.relative_to(ROOT).as_posix(), 'data':base64.b64encode(data).decode(), 'sha256':digest(data), 'mode':0o755 if p.stat().st_mode & 0o111 else 0o644})
    archive = output / f'{NAME}.zip'
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p, e in zip(files, entries):
            info = zipfile.ZipInfo(f'{NAME}/{e["path"]}', date_time=(2026,11,17,0,0,0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o100000 | e['mode']) << 16
            z.writestr(info,p.read_bytes())
    payload = base64.b64encode(gzip.compress(json.dumps(entries,separators=(',',':')).encode(),mtime=0)).decode()
    template = (ROOT / 'scripts/installer-template.mjs').read_text()
    if template.count("'__FAR_EMBEDDED_PAYLOAD__'") != 1:
        raise ValueError('Installer payload sentinel mismatch')
    installer = output / f'{NAME}-install.mjs'
    installer.write_text(template.replace("'__FAR_EMBEDDED_PAYLOAD__'", json.dumps(payload)))
    installer.chmod(0o755)
    sums = output / f'{NAME}-SHA256SUMS.txt'
    sums.write_text(''.join(f'{digest(p.read_bytes())}  {p.name}\n' for p in [archive,installer]))
    return {'files':len(files),'zip':str(archive),'installer':str(installer),'checksums':str(sums)}

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError(__doc__)
        print(json.dumps(build(Path(sys.argv[1])),indent=2))
    except Exception as exc:
        print(f'Build failed: {exc}',file=sys.stderr)
        raise SystemExit(1)
