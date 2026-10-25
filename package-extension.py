#!/usr/bin/env python3
import json
import re
import sys
import zipfile
from pathlib import Path


# Generates everything derived from the userscript and packs extension/ into a store-ready
# zip. The userscript is the only source: its header carries the one version number, which
# this script copies into the .meta.js stub Tampermonkey polls for updates and into the
# manifest, and its body becomes content.js. CI fails if any generated file is stale.
# Generic manifest validation (schema, icon files, AMO rules) is left to web-ext lint.

ROOT = Path(__file__).resolve().parent
EXTENSION_DIR = ROOT / "extension"
MANIFEST_PATH = EXTENSION_DIR / "manifest.json"
USER_SCRIPT_PATH = ROOT / "strava-photo-filter-toggle.user.js"
META_PATH = ROOT / "strava-photo-filter-toggle.meta.js"
CONTENT_PATH = EXTENSION_DIR / "content.js"
DIST_DIR = ROOT / "dist"

METADATA_PATTERN = re.compile(r"(?s)\A(// ==UserScript==\n.*?\n// ==/UserScript==\n)\n")
VERSION_PATTERN = re.compile(r"^// @version\s+(\S+)$", re.MULTILINE)
# Fixed entry timestamps make the zip byte-for-byte reproducible from the same sources.
ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)


def assert_valid(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def write_if_changed(path: Path, text: str) -> None:
    if not path.exists() or path.read_text(encoding="utf-8") != text:
        path.write_text(text, encoding="utf-8", newline="\n")


def zip_extension(zip_path: Path) -> None:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for file_path in sorted(EXTENSION_DIR.iterdir()):
            # Dotfiles are local tool state, not part of the extension.
            if file_path.is_file() and not file_path.name.startswith("."):
                archive.writestr(zipfile.ZipInfo(file_path.name, ZIP_TIMESTAMP), file_path.read_bytes(),
                                 compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)


def main() -> int:
    source = USER_SCRIPT_PATH.read_text(encoding="utf-8")
    assert_valid("\r" not in source, f"{USER_SCRIPT_PATH.name} must use LF line endings")
    metadata = METADATA_PATTERN.match(source)
    assert_valid(metadata is not None, f"{USER_SCRIPT_PATH.name} must start with a metadata block and a blank line")
    version = VERSION_PATTERN.search(metadata.group(1))
    assert_valid(version is not None, f"{USER_SCRIPT_PATH.name} has no // @version line")
    version = version.group(1)

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    # The userscript runs in the page context (@grant none), so the content script does
    # too; an isolated world would make the two builds behave differently.
    content_scripts = manifest.get("content_scripts") or []
    assert_valid(bool(content_scripts), "manifest content_scripts is missing")
    assert_valid(
        all(entry.get("world") == "MAIN" for entry in content_scripts),
        "content scripts must declare \"world\": \"MAIN\" to match the userscript's page context",
    )
    manifest["version"] = version

    write_if_changed(META_PATH, metadata.group(1))
    write_if_changed(MANIFEST_PATH, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    write_if_changed(CONTENT_PATH, source[metadata.end():])

    DIST_DIR.mkdir(exist_ok=True)
    zip_path = DIST_DIR / f"strava-feed-filters-{version}.zip"
    zip_extension(zip_path)
    print(zip_path)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
