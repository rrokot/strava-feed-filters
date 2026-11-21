#!/usr/bin/env python3
import argparse
import base64
import hashlib
import hmac
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ENV_PATH = ROOT / ".env"

ADDON = "strava-feed-filters"
API = f"https://addons.mozilla.org/api/v5/addons/addon/{ADDON}/"
REPOSITORY = "https://github.com/rrokot/strava-feed-filters"
LOCALE = "en-US"
JWT_LIFETIME_SECONDS = 60


def load_credentials() -> tuple[str, str]:
    values = {}
    if ENV_PATH.exists():
        for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
            key, sep, value = line.partition("=")
            if sep and not key.strip().startswith("#"):
                values[key.strip()] = value.strip().strip("\"'")
    issuer = values.get("AMO_JWT_ISSUER") or os.environ.get("AMO_JWT_ISSUER")
    secret = values.get("AMO_JWT_SECRET") or os.environ.get("AMO_JWT_SECRET")
    if not issuer or not secret:
        sys.exit(f"Fill AMO_JWT_ISSUER and AMO_JWT_SECRET in {ENV_PATH}")
    return issuer, secret


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_amo_jwt(issuer: str, secret: str) -> str:
    issued_at = int(time.time())
    header = b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    claims = b64url(json.dumps({
        "iss": issuer,
        "jti": secrets.token_hex(16),
        "iat": issued_at,
        "exp": issued_at + JWT_LIFETIME_SECONDS,
    }).encode())
    signature = hmac.new(secret.encode(), f"{header}.{claims}".encode(), hashlib.sha256).digest()
    return f"{header}.{claims}.{b64url(signature)}"


def request(method: str, credentials: tuple[str, str], body: dict | None = None) -> dict:
    addon_request = urllib.request.Request(
        API,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": f"JWT {make_amo_jwt(*credentials)}",
            "Content-Type": "application/json",
            "User-Agent": "strava-feed-filters-amo/1.0",
        },
    )
    try:
        with urllib.request.urlopen(addon_request) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        sys.exit(f"AMO {method} failed: HTTP {error.code} {error.read().decode(errors='replace')}")


def localized_url(url_field: str | dict | None) -> str | None:
    if not isinstance(url_field, dict):
        return url_field
    urls_by_locale = url_field.get("url", url_field)
    if isinstance(urls_by_locale, dict):
        return urls_by_locale.get(LOCALE) or next(iter(urls_by_locale.values()), None)
    return urls_by_locale


def show(credentials: tuple[str, str]) -> None:
    addon = request("GET", credentials)
    print(f"version:  {addon['current_version']['version']}")
    print(f"homepage: {localized_url(addon.get('homepage'))}")
    print(f"support:  {localized_url(addon.get('support_url'))}")


def set_links(credentials: tuple[str, str]) -> None:
    request("PATCH", credentials, {
        "homepage": {LOCALE: REPOSITORY},
        "support_url": {LOCALE: f"{REPOSITORY}/issues"},
    })
    show(credentials)


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage the Firefox Add-ons listing.")
    parser.add_argument("command", choices=["show", "set-links"])
    args = parser.parse_args()
    credentials = load_credentials()
    {"show": show, "set-links": set_links}[args.command](credentials)


if __name__ == "__main__":
    main()
