#!/usr/bin/env python3
import argparse
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
USER_SCRIPT_PATH = ROOT / "strava-photo-filter-toggle.user.js"
VERSION_PATTERN = re.compile(
    r"^(?P<prefix>// @version\s+)(?P<major>\d+)\.(?P<minor>\d+)\.(?P<patch>\d+)$",
    re.MULTILINE,
)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def bump_version(version_match: re.Match[str], part: str) -> str:
    major, minor, patch = map(int, version_match.group("major", "minor", "patch"))
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Bump the version, commit and tag a release.")
    parser.add_argument("part", choices=["patch", "minor", "major"])
    args = parser.parse_args()

    if git("status", "--porcelain", "--untracked-files=no"):
        sys.exit("Commit or stash your changes first")
    if git("branch", "--show-current") != "main":
        sys.exit("Releases are cut from main")

    source = USER_SCRIPT_PATH.read_text(encoding="utf-8")
    version_match = VERSION_PATTERN.search(source)
    if version_match is None:
        sys.exit(f"{USER_SCRIPT_PATH.name} has no X.Y.Z // @version line")
    version = bump_version(version_match, args.part)
    updated_source = VERSION_PATTERN.sub(rf"\g<prefix>{version}", source, count=1)
    USER_SCRIPT_PATH.write_text(updated_source, encoding="utf-8", newline="\n")

    subprocess.run([sys.executable, str(ROOT / "package-extension.py")], check=True)
    git("commit", "--all", "--message", f"Release {version}")
    git("tag", "--annotate", f"v{version}", "--message", f"Release {version}")
    print(f"Tagged v{version}; publish it with: git push --follow-tags")


if __name__ == "__main__":
    main()
