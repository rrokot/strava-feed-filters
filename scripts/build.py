#!/usr/bin/env python3
"""Regenerate the files derived from the userscript and package the store zip."""
import json
import re
import sys
import zipfile
from pathlib import Path

from project import ROOT, USER_SCRIPT_PATH, find_version


EXTENSION_DIR = ROOT / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"
CONTENT_SCRIPT_PATH = EXTENSION_DIR / "content.js"
# Tampermonkey polls this stub, not the whole script, to check for updates.
METADATA_STUB_PATH = ROOT / "strava-photo-filter-toggle.meta.js"
DIST_DIR = ROOT / "dist"

METADATA_PATTERN = re.compile(r"(?s)\A(// ==UserScript==\n.*?\n// ==/UserScript==\n)\n")
REPRODUCIBLE_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def write_if_changed(path: Path, text: str) -> None:
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8", newline="\n")


def update_manifest_version(version: str) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    content_scripts = manifest.get("content_scripts")
    if not content_scripts:
        sys.exit("manifest content_scripts is missing")
    if any(script.get("world") != "MAIN" for script in content_scripts):
        sys.exit('content scripts must declare "world": "MAIN" to match the userscript\'s page context')
    manifest["version"] = version
    write_if_changed(MANIFEST_PATH, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")


def zip_extension(zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w") as archive:
        for file_path in sorted(EXTENSION_DIR.iterdir()):
            if not file_path.is_file() or file_path.name.startswith("."):
                continue
            archive.writestr(
                zipfile.ZipInfo(file_path.name, REPRODUCIBLE_ZIP_TIMESTAMP),
                file_path.read_bytes(),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )


def build() -> Path:
    userscript = USER_SCRIPT_PATH.read_text(encoding="utf-8")
    metadata_match = METADATA_PATTERN.match(userscript)
    if metadata_match is None:
        sys.exit(f"{USER_SCRIPT_PATH.name} must start with a metadata block and a blank line")
    version = find_version(metadata_match.group(1)).group("version")

    update_manifest_version(version)
    write_if_changed(METADATA_STUB_PATH, metadata_match.group(1))
    write_if_changed(CONTENT_SCRIPT_PATH, userscript[metadata_match.end():])

    DIST_DIR.mkdir(exist_ok=True)
    zip_path = DIST_DIR / f"strava-feed-filters-{version}.zip"
    zip_extension(zip_path)
    return zip_path


if __name__ == "__main__":
    print(build())
