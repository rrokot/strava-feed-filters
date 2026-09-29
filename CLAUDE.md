# strava-feed-filters

One source ships two ways: `strava-photo-filter-toggle.user.js` is the userscript and
the single source of truth; `extension/content.js` is generated from it and committed.

- Edit the userscript, never `extension/content.js`. Then run
  `python package-extension.py`: it regenerates `content.js`, validates the manifest, and
  builds the store zip in `dist/`. CI fails if the committed `content.js` is stale.
- `strava-photo-filter-toggle.meta.js` must stay an exact copy of the userscript's
  `==UserScript==` header (Tampermonkey polls it for updates). A release bumps the
  version in the header, the `.meta.js` copy, and `extension/manifest.json`; the
  packaging script refuses any mismatch.
- `amo.py` and `cws.py` talk to the live Firefox Add-ons and Chrome Web Store listings
  using credentials from `.env`. `amo.py show` and `cws.py status` are read-only; run
  `sign`, `set-links` or `publish` only when asked.
- The repo keeps no Node dependencies; lint with
  `npx --yes web-ext lint --source-dir=extension`, as CI does.
