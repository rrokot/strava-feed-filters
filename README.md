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

This project uses the ReVanced patches Gradle plugin. JDK 17+ and Android SDK
are required. Resolving ReVanced artifacts requires GitHub Packages credentials.

```powershell
$token = gh auth token
.\gradlew.bat build "-PgithubPackagesUsername=rrokot" "-PgithubPackagesPassword=$token"
```

The APK itself is not part of this repository.
