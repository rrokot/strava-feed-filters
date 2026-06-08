# Strava Diagnostic Patch Design

## Goal

Build the first Android ReVanced patch step for Strava `466.12`: a diagnostic patch that identifies a stable feed hook and logs feed item signals without hiding or changing any feed item.

## Scope

The patch targets package `com.strava` version `466.12`.

This stage only proves that the patch can observe feed data safely. It does not implement filtering, settings UI, or persistence.

## Hook Strategy

Inspect the supplied APK with jadx first, using the known string clues from `README.md`:

- `FeedListFragment`
- `FeedListPresenter.kt`
- `GenericFeedContent`
- `com.strava.modularui.data.FeedActivity`
- `numPhotos=`
- `isVirtual=`
- `hideFromFeed=`

Prefer a hook near feed data transformation or binding, where each feed item is visible before it is rendered. Avoid UI-only hooks if a data-model hook is available, because the future filter needs item fields rather than view text.

## Diagnostic Behavior

The patch should emit logcat lines with a stable prefix:

```text
StravaFeedFilters:
```

Each log line should include whichever fields are available at the hook point:

- feed item class/type
- `numPhotos`
- `isVirtual`
- `hideFromFeed`
- activity/challenge/group indicator if directly available

If a field is not available at the chosen hook point, the diagnostic should omit it rather than guessing.

## Success Criteria

The stage is complete when:

1. The ReVanced project builds successfully.
2. A patched Strava APK can be produced for version `466.12`.
3. Patched Strava opens the feed without crashing.
4. `adb logcat` shows `StravaFeedFilters:` lines while scrolling the feed.
5. The logs show enough feed item signals to design the first real filter, starting with “hide posts without photos”.

## Non-Goals

This stage does not hide feed items.

This stage does not add user settings.

This stage does not support other Strava versions.

This stage does not commit APK files, decompiled output, generated patched APKs, or private signing material.

## Risks

Strava may obfuscate model names or inline feed handling, so the obvious class names may not be the final hook location.

Feed data may be loaded through Kotlin coroutines, Compose, or generated modular UI classes, so the safest hook may be lower-level than the visible fragment/presenter names.

Logging too much can slow feed scrolling. The diagnostic should log compact one-line summaries only.
