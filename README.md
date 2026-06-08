# Strava Feed Filters

Experimental ReVanced patch project for Strava Android `466.12`.

This repository is a research skeleton. It targets `com.strava` version `466.12`,
but it does not yet modify the app. The next step is to inspect the target APK
with jadx/apktool and find a stable hook around the feed list data before
implementing filtering.

## Target

- App: Strava
- Package: `com.strava`
- Version: `466.12`

## Initial APK Clues

String scanning of `base.apk` found feed-related symbols around:

- `FeedListFragment`
- `FeedListPresenter.kt`
- `GenericFeedContent`
- `com.strava.modularui.data.FeedActivity`
- `Kudos(hasKudoed=`
- `numPhotos=`
- `isVirtual=`
- `hideFromFeed=`

These are the first places to inspect in jadx.

## Build

This project uses the ReVanced patches Gradle plugin. A modern JDK is required.
Resolving the ReVanced Gradle plugin may require GitHub Packages credentials
(`GITHUB_ACTOR` and `GITHUB_TOKEN`) depending on the local environment.

```powershell
.\gradlew.bat build
```

The APK itself is not part of this repository.

## Current Build Blocker

On the current local machine, Gradle cannot resolve the ReVanced patches plugin:

```text
Plugin [id: 'app.revanced.patches', version: '1.0.0-dev.7'] was not found
Searched in GitHubPackages(https://maven.pkg.github.com/revanced/registry)
```

This needs a working ReVanced registry setup before the skeleton can be built.
