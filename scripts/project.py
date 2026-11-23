"""Paths, the version and settings shared by the project scripts."""
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
USER_SCRIPT_PATH = ROOT / "strava-photo-filter-toggle.user.js"

# The userscript's // @version line is the only place the version is written by hand.
VERSION_PATTERN = re.compile(
    r"^(?P<prefix>// @version\s+)(?P<version>(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+))$",
    re.MULTILINE,
)


def find_version(userscript: str) -> re.Match[str]:
    version_match = VERSION_PATTERN.search(userscript)
    if version_match is None:
        sys.exit(f"{USER_SCRIPT_PATH.name} has no X.Y.Z // @version line")
    return version_match


def required_env(name: str) -> str:
    if value := os.environ.get(name):
        return value
    sys.exit(f"{name} is not set")
