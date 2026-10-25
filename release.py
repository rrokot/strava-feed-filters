#!/usr/bin/env python3
import argparse
import re
import subprocess
import sys
from pathlib import Path


# Bumps the version in the userscript header, regenerates the derived files, and commits
# and tags the result, like `npm version`. Pushing the tag starts the Release workflow,
# which publishes to GitHub, the Chrome Web Store and Firefox Add-ons:
#
#   python release.py patch          # or minor / major
#   git push --follow-tags

ROOT = Path(__file__).resolve().parent
USER_SCRIPT_PATH = ROOT / "strava-photo-filter-toggle.user.js"
VERSION_PATTERN = re.compile(r"^(// @version\s+)(\d+)\.(\d+)\.(\d+)$", re.MULTILINE)


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def bumped(match: re.Match, part: str) -> str:
    major, minor, patch = (int(group) for group in match.groups()[1:])
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
    match = VERSION_PATTERN.search(source)
    if match is None:
        sys.exit(f"{USER_SCRIPT_PATH.name} has no X.Y.Z // @version line")
    version = bumped(match, args.part)
    USER_SCRIPT_PATH.write_text(VERSION_PATTERN.sub(rf"\g<1>{version}", source, count=1),
                                encoding="utf-8", newline="\n")

    subprocess.run([sys.executable, str(ROOT / "package-extension.py")], check=True)
    git("commit", "--all", "--message", f"Release {version}")
    git("tag", "--annotate", f"v{version}", "--message", f"Release {version}")
    print(f"Tagged v{version}; publish it with: git push --follow-tags")


if __name__ == "__main__":
    main()
