# Contributing

This repository contains experimental ReVanced patches for Strava.

## Current Scope

The project currently targets:

- App package: `com.strava`
- App version: `466.12`

The current patch is a research skeleton. Before implementing behavior, inspect the target APK and identify stable feed-list hooks.

## Before Opening a Pull Request

1. Open an issue describing the hook or behavior you want to change.
2. Keep APK files, decompiled app output, generated builds, and signed APKs out of the repository.
3. Include the Strava version you tested against.
4. Explain how the patch was validated.

## Local Build

Run:

```powershell
.\gradlew.bat build
```

Resolving the ReVanced Gradle plugin may require GitHub Packages credentials.
