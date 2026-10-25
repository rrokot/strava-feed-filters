# strava-feed-filters

One source ships two ways: `strava-photo-filter-toggle.user.js` is the userscript and
the single source of truth, including the version in its `// @version` line.

- Edit the userscript, never the generated files. Then run `python package-extension.py`:
  it regenerates `extension/content.js`, the `strava-photo-filter-toggle.meta.js` stub
  (Tampermonkey polls it for updates) and the manifest version, and builds the store zip
  in `dist/`. CI fails if a committed generated file is stale.
- Release with `python release.py patch|minor|major`, which bumps, commits and tags;
  `git push --follow-tags` then publishes to GitHub and both stores through
  `.github/workflows/release.yml`. Push tags only when asked. See `docs/releasing.md`.
- `amo.py` and `cws.py` talk to the live Firefox Add-ons and Chrome Web Store listings.
  `amo.py show` and `cws.py status` are read-only; run `set-links` or `publish` only
  when asked.
- The repo keeps no Node dependencies; lint with
  `npx --yes web-ext@10.8.0 lint --source-dir=extension`, as CI does.
