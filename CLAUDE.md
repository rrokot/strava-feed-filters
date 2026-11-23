# strava-feed-filters

- `strava-photo-filter-toggle.user.js` is the only source. Never edit the files
  `scripts/build.py` generates from it.
- Don't rename the userscript or change its `@namespace`: installed copies update
  through them.
- Pushing to `main` ships to Tampermonkey users at once; they poll the `.meta.js` stub there.
- Push tags only when asked: a `v*` tag publishes to both stores.
