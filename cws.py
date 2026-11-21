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


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

EXTENSION_ID = "jdefobolefeekjbgaclabbcffmebamdo"
API = "https://chromewebstore.googleapis.com"
SCOPE = "https://www.googleapis.com/auth/chromewebstore"
UPLOAD_POLL_INTERVAL_SECONDS = 5
MAX_UPLOAD_STATUS_POLLS = 60


def setting(name: str) -> str:
    if value := os.environ.get(name):
        return value
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and key.strip() == name:
                return value.strip().strip("\"'")
    sys.exit(f"Set {name} in the environment or in {ENV_PATH}")


def get_store_access_token() -> str:
    if token := os.environ.get("CWS_ACCESS_TOKEN"):
        return token
    gcloud = shutil.which("gcloud")
    if gcloud is None:
        sys.exit("Set CWS_ACCESS_TOKEN or install the gcloud CLI")
    command = [gcloud, "auth", "print-access-token",
               f"--impersonate-service-account={setting('CWS_SERVICE_ACCOUNT')}", f"--scopes={SCOPE}"]
    return subprocess.run(command, check=True, capture_output=True, text=True).stdout.strip()


class StoreItem:
    def __init__(self) -> None:
        self.path = f"publishers/{setting('CWS_PUBLISHER_ID')}/items/{EXTENSION_ID}"
        self.token = get_store_access_token()

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


def describe_revision(revision: dict | None) -> str:
    if not revision:
        return "none"
    versions = ", ".join(channel.get("crxVersion", "?") for channel in revision.get("distributionChannels", []))
    return f"{versions or '?'} ({revision.get('state')})"


def status(item: StoreItem) -> None:
    result = item.call("fetchStatus")
    print(f"published: {describe_revision(result.get('publishedItemRevisionStatus'))}")
    print(f"submitted: {describe_revision(result.get('submittedItemRevisionStatus'))}")
    if "lastAsyncUploadState" in result:
        print(f"last upload: {result['lastAsyncUploadState']}")


def publish(item: StoreItem, zip_path: Path) -> None:
    upload = item.call("upload", "POST", zip_path.read_bytes(), "application/zip", upload=True)
    upload_state = upload.get("uploadState")
    for _ in range(MAX_UPLOAD_STATUS_POLLS):
        if upload_state != "IN_PROGRESS":
            break
        time.sleep(UPLOAD_POLL_INTERVAL_SECONDS)
        upload_state = item.call("fetchStatus").get("lastAsyncUploadState")
    if upload_state != "SUCCEEDED":
        sys.exit(f"Upload of {zip_path.name} ended as {upload_state}: {json.dumps(upload)}")
    print(f"Uploaded {upload.get('crxVersion', zip_path.name)}")

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
    item = StoreItem()
    if args.command == "status":
        status(item)
    else:
        publish(item, args.zip)


if __name__ == "__main__":
    main()
