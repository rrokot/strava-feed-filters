#!/usr/bin/env python3
"""Check, bump the version, rebuild, commit and tag a release; pushing the tag publishes it."""
import argparse
import subprocess
import sys

from build import build
from check import check
from project import ROOT, USER_SCRIPT_PATH, VERSION_PATTERN, find_version


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()


def bump_version(version: str, part: str) -> str:
    major, minor, patch = map(int, version.split("."))
    if part == "major":
        return f"{major + 1}.0.0"
    if part == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("part", choices=["patch", "minor", "major"])
    args = parser.parse_args()

    if git("status", "--porcelain", "--untracked-files=no"):
        sys.exit("Commit or stash your changes first")
    if git("branch", "--show-current") != "main":
        sys.exit("Releases are cut from main")

    # Only the version differs after the bump, so a script that passes now passes then.
    check()
    if git("status", "--porcelain", "--untracked-files=no"):
        sys.exit("The generated files were stale; commit the regenerated ones first")

    source = USER_SCRIPT_PATH.read_text(encoding="utf-8")
    version = bump_version(find_version(source).group("version"), args.part)
    USER_SCRIPT_PATH.write_text(
        VERSION_PATTERN.sub(rf"\g<prefix>{version}", source, count=1),
        encoding="utf-8",
        newline="\n",
    )

    print(build())
    git("commit", "--all", "--message", f"Release {version}")
    git("tag", "--annotate", f"v{version}", "--message", f"Release {version}")
    print(f"Tagged v{version}; publish it with: git push --follow-tags")


if __name__ == "__main__":
    main()
