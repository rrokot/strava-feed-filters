#!/usr/bin/env python3
"""Upload the packaged extension to the Chrome Web Store and submit it for review.

Runs in the Release workflow, which supplies CWS_ACCESS_TOKEN (a short-lived token
of the publisher's service account, issued through Workload Identity Federation)
and CWS_PUBLISHER_ID; see docs/releasing.md.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from project import required_env


EXTENSION_ID = "jdefobolefeekjbgaclabbcffmebamdo"
API = "https://chromewebstore.googleapis.com"
UPLOAD_POLL_INTERVAL_SECONDS = 5
MAX_UPLOAD_STATUS_POLLS = 60


class StoreItem:
    def __init__(self) -> None:
        self.path = f"publishers/{required_env('CWS_PUBLISHER_ID')}/items/{EXTENSION_ID}"
        self.token = required_env("CWS_ACCESS_TOKEN")

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
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("zip", type=Path, help="the store zip built by scripts/build.py")
    args = parser.parse_args()
    publish(StoreItem(), args.zip)


if __name__ == "__main__":
    main()
