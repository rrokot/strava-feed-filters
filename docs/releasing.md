# Releasing

```sh
python scripts/release.py patch   # or minor / major: checks, bumps, regenerates, commits and tags
git push --follow-tags
```

The version lives only in the userscript's `// @version` line; `scripts/build.py`
copies it into `strava-photo-filter-toggle.meta.js` and `extension/manifest.json`.

`release.py` first runs `scripts/check.py` (the userscript parses, the generated files
are current, `web-ext lint` passes), so a broken build is caught before it is tagged.

Pushing to `main` updates Tampermonkey users right away: they poll the `.meta.js` stub
on `main`.

The `v*` tag starts the Release workflow, which checks that the tag matches
the userscript version, runs the same checks, and then:

- creates a GitHub release with the store zip and the userscript;
- uploads the zip to the Chrome Web Store and submits it for review;
- signs the same zip as a listed Firefox Add-ons version and submits it for review.

Each store job runs in its own GitHub environment (`chrome-web-store`,
`firefox-add-ons`), where approval rules can be added.

## Chrome Web Store access

Publishing uses the Chrome Web Store API v2 as a service account with Workload Identity
Federation: GitHub's OIDC token is exchanged for a short-lived access token, so no keys
or refresh tokens are stored anywhere.

A Chrome Web Store publisher can have only one service account, so the Google Cloud side
is shared by all of the publisher's extensions and already exists: one project with the
Chrome Web Store, IAM, IAM Credentials and STS APIs enabled; a service account with no
IAM roles, added in the Developer Dashboard under **Settings → Account**; and a Workload
Identity pool `github` whose OIDC provider accepts only the owner's repositories. This
repository only needs to be allowed to impersonate the service account:

```sh
gcloud iam service-accounts add-iam-policy-binding SERVICE_ACCOUNT_EMAIL \
  --role=roles/iam.workloadIdentityUser \
  --member=principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/rrokot/strava-feed-filters
```

The workflow passes the token and the publisher ID to `scripts/cws.py`, which uploads
the zip and submits it for review. Review status is on the Developer Dashboard.

## Firefox Add-ons access

`web-ext sign` authenticates with an AMO API key pair from
https://addons.mozilla.org/en-US/developers/addon/api/key/. AMO has no keyless option, so
this pair is the project's only long-lived secret and is kept only in the
`firefox-add-ons` environment; regenerate it there if it may have leaked. Review status
is on the Developer Hub.

## Secrets

Each store job reads its secrets from its own GitHub environment (**Settings →
Environments**), so no other job can see them. Both environments accept deployments
only from `v*` tags. Nothing is kept locally: the store scripts run only in CI.

| Environment | Secret | Value |
| --- | --- | --- |
| `chrome-web-store` | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/OWNER` |
| `chrome-web-store` | `CWS_SERVICE_ACCOUNT` | The service account's email |
| `chrome-web-store` | `CWS_PUBLISHER_ID` | Developer Dashboard → **Settings** |
| `firefox-add-ons` | `AMO_JWT_ISSUER` | AMO API key: JWT issuer |
| `firefox-add-ons` | `AMO_JWT_SECRET` | AMO API key: JWT secret |
