package app.revanced.patches.strava.feedfilters

import app.revanced.patcher.patch.bytecodePatch

@Suppress("unused")
val stravaFeedFiltersPatch = bytecodePatch(
    name = "Strava Feed Filters",
    description = "Research skeleton for hiding selected Strava feed items.",
) {
    compatibleWith("com.strava"("466.12"))

    execute {
        // Intentionally empty until a stable feed-list hook is identified.
        // Current APK clues point at FeedListFragment, FeedListPresenter,
        // GenericFeedContent, and com.strava.modularui.data.FeedActivity.
    }
}
