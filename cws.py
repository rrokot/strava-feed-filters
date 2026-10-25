#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


# Talks to the Chrome Web Store API v2 as the publisher's service account, with a
# short-lived access token and no stored keys (see docs/releasing.md):
#
#   python cws.py status               print the published and submitted versions
#   python cws.py publish <zip>        upload a package and submit it for review
#
# The Release workflow runs `publish` with CWS_ACCESS_TOKEN issued through Workload
# Identity Federation. Run locally, the token is minted with gcloud by impersonating
# CWS_SERVICE_ACCOUNT. Settings come from the environment or from .env next to this file.
# The API cannot edit the store listing; that stays in the Developer Dashboard.

ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

EXTENSION_ID = "jdefobolefeekjbgaclabbcffmebamdo"
API = "https://chromewebstore.googleapis.com"
SCOPE = "https://www.googleapis.com/auth/chromewebstore"
POLL_INTERVAL = 5
POLL_ATTEMPTS = 60


def setting(name: str) -> str:
    if value := os.environ.get(name):
        return value
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == name:
                return value.strip().strip("\"'")
    sys.exit(f"Set {name} in the environment or in {ENV_PATH}")


def access_token() -> str:
    if token := os.environ.get("CWS_ACCESS_TOKEN"):
        return token
    gcloud = shutil.which("gcloud")
    if gcloud is None:
        sys.exit("Set CWS_ACCESS_TOKEN or install the gcloud CLI")
    command = [gcloud, "auth", "print-access-token",
               f"--impersonate-service-account={setting('CWS_SERVICE_ACCOUNT')}", f"--scopes={SCOPE}"]
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout.strip()


class Item:
    def __init__(self) -> None:
        self.path = f"publishers/{setting('CWS_PUBLISHER_ID')}/items/{EXTENSION_ID}"
        self.token = access_token()

    def call(self, action: str, method: str = "GET", body: bytes | None = None,
             content_type: str | None = None, upload: bool = False) -> dict:
        url = f"{API}{'/upload' if upload else ''}/v2/{self.path}:{action}"
        headers = {"Authorization": f"Bearer {self.token}"}
        if content_type:
            headers["Content-Type"] = content_type
        req = urllib.request.Request(url, data=body, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            sys.exit(f"{method} {url} failed: HTTP {error.code} {error.read().decode(errors='replace')}")


def describe(revision: dict | None) -> str:
    if not revision:
        return "none"
    versions = ", ".join(channel.get("crxVersion", "?") for channel in revision.get("distributionChannels", []))
    return f"{versions or '?'} ({revision.get('state')})"


def status(item: Item) -> None:
    result = item.call("fetchStatus")
    print(f"published: {describe(result.get('publishedItemRevisionStatus'))}")
    print(f"submitted: {describe(result.get('submittedItemRevisionStatus'))}")
    if "lastAsyncUploadState" in result:
        print(f"last upload: {result['lastAsyncUploadState']}")


def publish(item: Item, zip_path: Path) -> None:
    result = item.call("upload", "POST", zip_path.read_bytes(), "application/zip", upload=True)
    state = result.get("uploadState")
    # Large packages are processed asynchronously; fetchStatus reports when they finish.
    for _ in range(POLL_ATTEMPTS):
        if state != "IN_PROGRESS":
            break
        time.sleep(POLL_INTERVAL)
        state = item.call("fetchStatus").get("lastAsyncUploadState")
    if state != "SUCCEEDED":
        sys.exit(f"Upload of {zip_path.name} ended as {state}: {json.dumps(result)}")
    print(f"Uploaded {result.get('crxVersion', zip_path.name)}")

    body = json.dumps({"publishType": "DEFAULT_PUBLISH"}).encode()
    published = item.call("publish", "POST", body, "application/json")
    if warnings := published.get("warningInfo"):
        print(f"Warnings: {json.dumps(warnings)}", file=sys.stderr)
    if published.get("state") not in ("PENDING_REVIEW", "STAGED", "PUBLISHED"):
        sys.exit(f"Submission ended as {published.get('state')}: {json.dumps(published)}")
    print(f"Submission is {published['state']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish the extension to the Chrome Web Store.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("status")
    commands.add_parser("publish").add_argument("zip", type=Path)
    args = parser.parse_args()
    item = Item()
    if args.command == "status":
        status(item)
    else:
        publish(item, args.zip)


if __name__ == "__main__":
    main()
