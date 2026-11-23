#!/usr/bin/env python3
"""Check the userscript, regenerate the derived files and lint the extension.

CI runs this on every push, and scripts/release.py runs it before tagging, so a
release can't be tagged with a script the stores would reject.
"""
import shutil
import subprocess
import sys

from build import EXTENSION_DIR, build
from project import ROOT, USER_SCRIPT_PATH


WEB_EXT = "web-ext@10.8.0"


def run(*command: str) -> None:
    executable = shutil.which(command[0])
    if executable is None:
        sys.exit(f"{command[0]} is not installed")
    if subprocess.run([executable, *command[1:]], cwd=ROOT).returncode != 0:
        sys.exit(f"{' '.join(command)} failed")


def check() -> None:
    run("node", "--check", str(USER_SCRIPT_PATH))
    print(build())
    run("npx", "--yes", WEB_EXT, "lint", f"--source-dir={EXTENSION_DIR}")


if __name__ == "__main__":
    check()
