# strava-feed-filters

One source ships two ways: `strava-photo-filter-toggle.user.js` is the userscript and
the single source of truth, including the version in its `// @version` line.

- Edit the userscript, never the generated files. Then run `python scripts/build.py`:
  it regenerates `extension/content.js`, the `strava-photo-filter-toggle.meta.js` stub
  (Tampermonkey polls it for updates) and the manifest version, and builds the store zip
  in `dist/`. CI fails if a committed generated file is stale.
- `python scripts/check.py` checks the userscript, rebuilds and lints the extension, as CI
  does. The repo keeps no Node dependencies; the web-ext version is pinned there.
- Release with `python scripts/release.py patch|minor|major`, which checks, bumps, commits
  and tags; `git push --follow-tags` then publishes to GitHub and both stores through
  `.github/workflows/release.yml`. Push tags only when asked. See `docs/releasing.md`.
- Store publishing runs only in the Release workflow (`scripts/cws.py` for Chrome,
  `web-ext sign` for Firefox); store credentials live only in GitHub environments, not
  locally. Shared paths and version parsing live in `scripts/project.py`.
