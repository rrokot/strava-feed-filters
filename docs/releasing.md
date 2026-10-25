# Releasing

```sh
python release.py patch   # or minor / major: bumps, regenerates, commits and tags
git push --follow-tags
```

The version lives only in the userscript's `// @version` line; `package-extension.py`
copies it into `strava-photo-filter-toggle.meta.js` and `extension/manifest.json`.

Pushing to `main` updates Tampermonkey users right away: they poll the `.meta.js` stub
on `main`. The `v*` tag starts the Release workflow, which checks that the tag matches
the userscript version, packages and lints the extension, and then:

- creates a GitHub release with the store zip and the userscript;
- uploads the zip to the Chrome Web Store and submits it for review;
- signs the same zip as a listed Firefox Add-ons version and submits it for review.

Each store job runs in its own GitHub environment (`chrome-web-store`,
`firefox-add-ons`), where approval rules can be added.

## Chrome Web Store access

Publishing uses the Chrome Web Store API v2 as a service account with Workload Identity
Federation: GitHub's OIDC token is exchanged for a short-lived access token, so no keys
or refresh tokens are stored anywhere. The Google Cloud project, the service account and
the `github` Workload Identity pool are shared with the publisher's other extensions and
are described in
[bechdeltest-enhanced](https://github.com/rrokot/bechdeltest-enhanced/blob/main/docs/releasing.md#chrome-web-store-access).
This repository only needs to be allowed to impersonate the service account:

```sh
gcloud iam service-accounts add-iam-policy-binding SERVICE_ACCOUNT_EMAIL \
  --role=roles/iam.workloadIdentityUser \
  --member=principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/rrokot/strava-feed-filters
```

`python cws.py status` run locally mints its token with `gcloud` by impersonating the
same service account, which needs `roles/iam.serviceAccountTokenCreator` on it for your
own Google account. It reads `CWS_SERVICE_ACCOUNT` and `CWS_PUBLISHER_ID` from the
environment or from `.env`.

## Firefox Add-ons access

`web-ext sign` authenticates with an AMO API key pair from
https://addons.mozilla.org/en-US/developers/addon/api/key/. `python amo.py show` and
`set-links` use the same pair from `.env`.

## Secrets

Each store job reads its secrets from its own GitHub environment (**Settings →
Environments**), so no other job can see them. Both environments accept deployments
only from `v*` tags.

| Environment | Secret | Value |
| --- | --- | --- |
| `chrome-web-store` | `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/OWNER` |
| `chrome-web-store` | `CWS_SERVICE_ACCOUNT` | The service account's email |
| `chrome-web-store` | `CWS_PUBLISHER_ID` | Developer Dashboard → **Settings** |
| `firefox-add-ons` | `AMO_JWT_ISSUER` | AMO API key: JWT issuer |
| `firefox-add-ons` | `AMO_JWT_SECRET` | AMO API key: JWT secret |
