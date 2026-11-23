// ==UserScript==
// @name         Strava Feed Filters
// @namespace    https://github.com/rrokot/strava-hide-posts-without-photos
// @version      5.54.1
// @description  Filter your Strava feed by activity type, media, virtual activities, kudos, and ownership. Adds a Following/My Activity toggle.
// @author       https://www.strava.com/athletes/5931245
// @match        https://www.strava.com/dashboard*
// @grant        none
// @run-at       document-idle
// @icon         https://raw.githubusercontent.com/rrokot/strava-feed-filters/main/extension/icon-64.png
// @updateURL    https://raw.githubusercontent.com/rrokot/strava-feed-filters/main/strava-photo-filter-toggle.meta.js
// @downloadURL  https://raw.githubusercontent.com/rrokot/strava-feed-filters/main/strava-photo-filter-toggle.user.js
// ==/UserScript==

(function() {
    'use strict';

    const FEED_CONTAINER_SELECTOR = '.feature-feed';
    const FEED_ENTRY_SELECTOR = '[data-testid="web-feed-entry"]';
    const FEED_FILTER_INPUT_ID = 'feedFilter';
    const FILTER_WRAPPER_ID = 'strava-feed-filter-toggles';
    const FILTER_CONTROL_ROW_ID = 'strava-feed-filter-controls-row';
    const FEED_TYPE_TOGGLE_ID = 'strava-feed-type-toggle';
    const DROPDOWN_REVEAL_ID = 'strava-feed-dropdown-reveal';
    const STYLE_ELEMENT_ID = 'strava-feed-filter-styles';
    const MEDIA_SELECTOR = '[data-testid="photo"], [data-testid="video"]';
    // Strava renders its own generated pictures (e.g. the weight-training muscle
    // heatmap) as "photo" too; they come from sport-image.strava.com, while real
    // uploads come from CloudFront.
    const GENERATED_IMAGE_SELECTOR = 'img[src*="//sport-image.strava.com/"]';
    const ACTIVITY_TAG_SELECTOR = '[data-testid="tag"]';
    const ACTIVITY_TYPE_TITLE_SELECTOR = 'svg[data-testid="activity-icon"] title';
    const UNFILLED_KUDOS_SELECTOR = 'svg[data-testid="unfilled_kudos"]';
    const OWNER_LINK_SELECTOR = '[data-testid="owners-name"], [data-testid="owner-avatar"]';
    const HEADER_ATHLETE_LINK_SELECTOR = 'header a[href*="/athletes/"], nav a[href*="/athletes/"]';
    const UNSTYLED_GIFT_LINK_SELECTOR = 'a[href*="/gift"].btn-primary';
    const ATHLETE_HREF_PATTERN = /\/athletes\/(\d+)/;
    const ACTIVITY_TYPE_FILTER_ID = 'activityType';
    const ACTIVITY_TYPE_STORAGE_KEY = 'stravaHiddenActivityTypes';
    const BUTTON_ACTIVE_COLOR = '#fc5200';
    const BUTTON_INACTIVE_COLOR = '#888';
    const FEED_TAB_INACTIVE_COLOR = '#43423f';
    const ACTIVITY_TYPE_MENU_ROWS_PER_COLUMN = 12;
    const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

    const FOLLOWING_FEED = 'following';
    const MY_ACTIVITY_FEED = 'my_activity';
    const FEED_TYPES = [
        { id: FOLLOWING_FEED, label: 'Following', url: '/dashboard' },
        { id: MY_ACTIVITY_FEED, label: 'My Activity', url: `/dashboard?feed_type=${MY_ACTIVITY_FEED}` }
    ];

    const FEED_FILTERS = [
        {
            id: 'photo',
            title: 'Hide posts without photos or videos',
            storageKey: 'stravaPhotoFilterEnabled',
            defaultEnabled: true,
            hiddenEntryAttribute: 'data-strava-no-media-entry',
            activeBodyClass: 'strava-hide-no-photo',
            hidesEntry: entry => !entry.hasMedia,
            iconFactory: createCameraIcon
        },
        {
            id: 'virtual',
            title: 'Hide virtual activities',
            storageKey: 'stravaVirtualFilterEnabled',
            defaultEnabled: false,
            hiddenEntryAttribute: 'data-strava-virtual-entry',
            activeBodyClass: 'strava-hide-virtual',
            hidesEntry: entry => entry.isVirtual,
            iconFactory: () => createTextIcon('VR')
        },
        {
            id: ACTIVITY_TYPE_FILTER_ID,
            hiddenEntryAttribute: 'data-strava-hidden-activity-type-entry',
            activeBodyClass: 'strava-hide-activity-types',
            hidesEntry: entry => hasOnlyHiddenActivityTypes(entry.activityTypes)
        },
        {
            id: 'unliked',
            title: 'Show posts I have not liked yet',
            storageKey: 'stravaUnlikedFilterEnabled',
            defaultEnabled: false,
            disabledOnMyActivityFeed: true,
            hiddenEntryAttribute: 'data-strava-liked-entry',
            activeBodyClass: 'strava-show-unliked',
            hidesEntry: entry => !entry.hasUnfilledKudosIcon,
            iconFactory: createFilledKudosIcon
        },
        {
            id: 'mine',
            title: 'Hide my own posts',
            storageKey: 'stravaMineFilterEnabled',
            defaultEnabled: false,
            disabledOnMyActivityFeed: true,
            hiddenEntryAttribute: 'data-strava-mine-entry',
            activeBodyClass: 'strava-hide-mine',
            hidesEntry: entry => entry.isMyPost,
            iconFactory: () => createTextIcon('ME')
        }
    ];

    const TOGGLE_FILTERS = FEED_FILTERS.filter(filter => filter.id !== ACTIVITY_TYPE_FILTER_ID);

    let feedObserver = null;
    let feedContainer = null;
    let myAthleteId = null;
    let stravaKudosButtonClass = null;
    let dashboardRefreshScheduled = false;
    const enabledToggleFilters = {};
    const filterControls = {};
    const filterMatchesByEntry = new Map();
    const hiddenActivityTypes = new Set();
    const activityTypeLabels = new Map();

    function installFilterStyles() {
        if (document.getElementById(STYLE_ELEMENT_ID)) {
            return;
        }

        const hideRules = FEED_FILTERS.map(filter => `
            body.${filter.activeBodyClass} ${FEED_CONTAINER_SELECTOR} ${FEED_ENTRY_SELECTOR}[${filter.hiddenEntryAttribute}="true"] {
                display: none !important;
            }
        `).join('');

        const style = document.createElement('style');
        style.id = STYLE_ELEMENT_ID;
        style.textContent = `
            ${hideRules}

            a[href*="/gift"] img {
                display: none !important;
            }
        `;

        document.head.appendChild(style);
    }

    function readStoredPreference(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    function tryPersistPreference(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            return;
        }
    }

    function tryRemoveStoredPreference(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            return;
        }
    }

    function loadFilterPreferences() {
        TOGGLE_FILTERS.forEach(filter => {
            const savedValue = readStoredPreference(filter.storageKey);
            enabledToggleFilters[filter.id] = savedValue === null ? filter.defaultEnabled : savedValue === 'true';
        });

        try {
            const savedTypes = JSON.parse(readStoredPreference(ACTIVITY_TYPE_STORAGE_KEY) || '[]');
            if (Array.isArray(savedTypes)) {
                savedTypes.forEach(savedLabel => {
                    const label = humanizeActivityType(String(savedLabel));
                    const normalized = normalizeText(label);
                    if (normalized) {
                        hiddenActivityTypes.add(normalized);
                        activityTypeLabels.set(normalized, label);
                    }
                });
            }
        } catch {
            tryRemoveStoredPreference(ACTIVITY_TYPE_STORAGE_KEY);
        }
    }

    function saveHiddenActivityTypes() {
        const labels = [...hiddenActivityTypes].map(type => activityTypeLabels.get(type) || type);
        tryPersistPreference(ACTIVITY_TYPE_STORAGE_KEY, JSON.stringify(labels));
    }

    function updateBadge(badge, count) {
        if (badge) {
            badge.textContent = count > 0 ? count : '';
            badge.style.display = count > 0 ? 'block' : 'none';
        }
    }

    function updateButtonStyle(button, enabled) {
        if (button) {
            button.style.color = enabled ? BUTTON_ACTIVE_COLOR : BUTTON_INACTIVE_COLOR;
        }
    }

    function getCurrentFeedType() {
        return new URLSearchParams(window.location.search).get('feed_type') === MY_ACTIVITY_FEED
            ? MY_ACTIVITY_FEED
            : FOLLOWING_FEED;
    }

    function isFilterEnabled(filter) {
        return filter.id === ACTIVITY_TYPE_FILTER_ID
            ? hiddenActivityTypes.size > 0
            : enabledToggleFilters[filter.id];
    }

    function isFilterActiveOnFeed(filter, feedType) {
        return isFilterEnabled(filter) && !(filter.disabledOnMyActivityFeed && feedType === MY_ACTIVITY_FEED);
    }

    function extractAthleteId(href) {
        return href?.match(ATHLETE_HREF_PATTERN)?.[1] || null;
    }

    function findMyAthleteIdInHeader() {
        for (const link of document.querySelectorAll(HEADER_ATHLETE_LINK_SELECTOR)) {
            const athleteId = extractAthleteId(link.getAttribute('href'));
            if (athleteId) {
                return athleteId;
            }
        }
        return null;
    }

    function countEntriesMatchingEachFilter() {
        const counts = {};
        FEED_FILTERS.forEach(filter => {
            counts[filter.id] = 0;
        });

        filterMatchesByEntry.forEach(matches => {
            FEED_FILTERS.forEach(filter => {
                if (matches[filter.id]) {
                    counts[filter.id] += 1;
                }
            });
        });

        return counts;
    }

    function refreshBadges() {
        const counts = countEntriesMatchingEachFilter();
        const feedType = getCurrentFeedType();

        FEED_FILTERS.forEach(filter => {
            const count = isFilterActiveOnFeed(filter, feedType) ? counts[filter.id] : 0;
            updateBadge(filterControls[filter.id]?.badge, count);
        });
    }

    function syncBodyFilterClasses() {
        const feedType = getCurrentFeedType();
        FEED_FILTERS.forEach(filter => {
            document.body.classList.toggle(filter.activeBodyClass, isFilterActiveOnFeed(filter, feedType));
        });
    }

    function syncFilterUi() {
        FEED_FILTERS.forEach(filter => {
            updateButtonStyle(filterControls[filter.id]?.button, isFilterEnabled(filter));
        });
        refreshBadges();
    }

    function toggleFilter(filter) {
        const enabled = !enabledToggleFilters[filter.id];
        enabledToggleFilters[filter.id] = enabled;
        tryPersistPreference(filter.storageKey, String(enabled));
        syncBodyFilterClasses();
        syncFilterUi();
    }

    const VIRTUAL_ACTIVITY_TAG_FRAGMENTS = [
        'virtual',     // en, es, pt
        'virtuel',     // fr, da
        'virtuale',    // it
        'virtuell',    // de, sv, no
        'virtueel',    // nl
        'virtuaali',   // fi
        'wirtualn',    // pl
        'virtuáln',    // cs
        'виртуальн',   // ru
        'віртуальн',   // uk
        'バーチャル',  // ja
        '가상',        // ko
        '虚拟',        // zh-cn
        '虛擬',        // zh-tw
        'sanal'        // tr
    ];

    function isVirtualActivity(entry) {
        const tag = normalizeText(entry.querySelector(ACTIVITY_TAG_SELECTOR)?.textContent);
        return VIRTUAL_ACTIVITY_TAG_FRAGMENTS.some(fragment => tag.includes(fragment));
    }

    function normalizeText(value) {
        return (value || '').trim().toLowerCase();
    }

    function hasUploadedMedia(entry) {
        return [...entry.querySelectorAll(MEDIA_SELECTOR)]
            .some(media => !media.querySelector(GENERATED_IMAGE_SELECTOR));
    }

    function isMyPost(entry) {
        if (!myAthleteId) {
            return false;
        }
        const ownerLink = entry.querySelector(OWNER_LINK_SELECTOR);
        return extractAthleteId(ownerLink?.getAttribute('href')) === myAthleteId;
    }

    // Strava sometimes ships untranslated icon titles such as
    // "strava.activities.types_v2.mountainbikeride". The translations still sit
    // in the page's i18n store under views.activity_types, keyed by the same
    // suffix, so look them up there in the viewer's language.
    const UNTRANSLATED_ACTIVITY_TYPE_PATTERN = /^strava\.activities\.types(?:_v\d+)?\.([a-z0-9_]+)$/i;
    let pageActivityTypeLabels;

    function getPageActivityTypeLabels() {
        if (pageActivityTypeLabels !== undefined) {
            return pageActivityTypeLabels;
        }
        pageActivityTypeLabels = null;
        try {
            const store = window.__NEXT_DATA__?.props?.initialI18nStore;
            if (store && typeof store === 'object') {
                const lang = document.documentElement.lang;
                const locales = [lang, lang?.split('-')[0], ...Object.keys(store)];
                for (const locale of locales) {
                    const labels = locale && store[locale]?.views?.activity_types;
                    if (labels && typeof labels === 'object') {
                        pageActivityTypeLabels = labels;
                        break;
                    }
                }
            }
        } catch {
            // Fall back to showing the raw type key.
        }
        return pageActivityTypeLabels;
    }

    function humanizeActivityType(value) {
        const label = (value || '').trim();
        const match = label.match(UNTRANSLATED_ACTIVITY_TYPE_PATTERN);
        if (!match) {
            return label;
        }
        const pageLabel = getPageActivityTypeLabels()?.[match[1].toLowerCase()];
        if (typeof pageLabel === 'string' && pageLabel.trim()) {
            return pageLabel.trim();
        }
        return match[1].replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
    }

    function getActivityTypes(entry) {
        const types = new Map();
        entry.querySelectorAll(ACTIVITY_TYPE_TITLE_SELECTOR).forEach(title => {
            const label = humanizeActivityType(title.textContent);
            const key = normalizeText(label);
            if (key) {
                types.set(key, label);
            }
        });
        return [...types].map(([key, label]) => ({ key, label }));
    }

    function registerActivityTypes(types) {
        let changed = false;
        types.forEach(({ key, label }) => {
            if (!activityTypeLabels.has(key) || activityTypeLabels.get(key) !== label) {
                activityTypeLabels.set(key, label);
                changed = true;
            }
        });
        if (changed) {
            renderActivityTypeMenu();
        }
    }

    function hasOnlyHiddenActivityTypes(types) {
        return types.length > 0 && types.every(({ key }) => hiddenActivityTypes.has(key));
    }

    function updateTrackedEntry(entry) {
        const activityTypes = getActivityTypes(entry);
        registerActivityTypes(activityTypes);

        const entryDetails = {
            hasMedia: hasUploadedMedia(entry),
            isVirtual: isVirtualActivity(entry),
            hasUnfilledKudosIcon: !!entry.querySelector(UNFILLED_KUDOS_SELECTOR),
            isMyPost: isMyPost(entry),
            activityTypes
        };
        const matches = {};
        FEED_FILTERS.forEach(filter => {
            const matchesFilter = filter.hidesEntry(entryDetails);
            matches[filter.id] = matchesFilter;
            if (matchesFilter) {
                entry.setAttribute(filter.hiddenEntryAttribute, 'true');
            } else {
                entry.removeAttribute(filter.hiddenEntryAttribute);
            }
        });
        filterMatchesByEntry.set(entry, matches);
    }

    function clearEntryAttributes(entry) {
        FEED_FILTERS.forEach(filter => entry.removeAttribute(filter.hiddenEntryAttribute));
    }

    function recheckTrackedEntries() {
        for (const entry of filterMatchesByEntry.keys()) {
            updateTrackedEntry(entry);
        }
    }

    function removeTrackedEntry(entry) {
        if (!filterMatchesByEntry.delete(entry)) {
            return;
        }

        clearEntryAttributes(entry);
    }

    function clearTrackedEntries() {
        for (const entry of filterMatchesByEntry.keys()) {
            clearEntryAttributes(entry);
        }
        filterMatchesByEntry.clear();
    }

    function collectClosestEntry(node, affectedEntries) {
        if (!(node instanceof Element)) {
            return;
        }

        const closestEntry = node.closest(FEED_ENTRY_SELECTOR);
        if (closestEntry) {
            affectedEntries.add(closestEntry);
        }
    }

    function collectEntriesInChangedSubtree(node, affectedEntries) {
        if (!(node instanceof Element)) {
            return;
        }

        if (node.matches(FEED_ENTRY_SELECTOR)) {
            affectedEntries.add(node);
        }

        node.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(entry => {
            affectedEntries.add(entry);
        });

        collectClosestEntry(node, affectedEntries);
    }

    function recheckEntriesAffectedByMutations(mutations) {
        const affectedEntries = new Set();

        mutations.forEach(mutation => {
            collectClosestEntry(mutation.target, affectedEntries);
            mutation.addedNodes.forEach(node => collectEntriesInChangedSubtree(node, affectedEntries));
            mutation.removedNodes.forEach(node => collectEntriesInChangedSubtree(node, affectedEntries));
        });

        affectedEntries.forEach(entry => {
            if (feedContainer && entry.isConnected && feedContainer.contains(entry)) {
                updateTrackedEntry(entry);
            } else {
                removeTrackedEntry(entry);
            }
        });

        refreshBadges();
        applyStravaKudosButtonClass();
    }

    function observeCurrentFeedContainer() {
        const nextFeedContainer = document.querySelector(FEED_CONTAINER_SELECTOR);

        if (nextFeedContainer === feedContainer) {
            return;
        }

        feedObserver?.disconnect();
        feedObserver = null;
        clearTrackedEntries();
        feedContainer = nextFeedContainer;

        if (!feedContainer) {
            refreshBadges();
            return;
        }

        feedObserver = new MutationObserver(recheckEntriesAffectedByMutations);
        feedObserver.observe(feedContainer, { childList: true, subtree: true });
        feedContainer.querySelectorAll(FEED_ENTRY_SELECTOR).forEach(updateTrackedEntry);
        refreshBadges();
        applyStravaKudosButtonClass();
    }

    function createBadge() {
        const badge = document.createElement('span');
        badge.style.cssText = `
            position: absolute;
            top: 0;
            right: 0;
            color: #000;
            font-size: 10px;
            font-weight: 700;
            line-height: 1;
            display: none;
        `;
        return badge;
    }

    function createSvg(viewBox, fill) {
        const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('fill', fill);
        svg.style.display = 'block';
        return svg;
    }

    function createPathIcon(viewBox, pathData) {
        const svg = createSvg(viewBox, 'currentColor');
        const path = document.createElementNS(SVG_NAMESPACE, 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);
        return svg;
    }

    function createTextIcon(label) {
        const svg = createSvg('0 0 16 16', 'none');
        const text = document.createElementNS(SVG_NAMESPACE, 'text');
        text.setAttribute('x', '8');
        text.setAttribute('y', '12');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '800');
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('fill', 'currentColor');
        text.textContent = label;
        svg.appendChild(text);
        return svg;
    }

    function createCameraIcon() {
        return createPathIcon(
            '0 0 24 24',
            'M12 5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm0-2c1.1 0 2 .9 2 2h3.17C18.6 5 19 5.4 19 5.83V7h1c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h1V5.83C5 5.4 5.4 5 5.83 5H9c0-1.1.9-2 2-2zm0 5c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z'
        );
    }

    function createFilledKudosIcon() {
        return createPathIcon(
            '0 0 16 16',
            'M14.625 10.96V9.5l.275-.338A1.94 1.94 0 0013.394 6H8.6l.496-4.055A1.735 1.735 0 007.374 0a.578.578 0 00-.527.34l-2.5 5.556a.667.667 0 01-.184.24L1.243 8.55A.667.667 0 001 9.064v3.603C1 13.403 1.597 14 2.333 14h1.468l1.163.776c.219.146.477.224.74.224h6.171A2.125 2.125 0 0014 12.875v-.395l.112-.13c.331-.387.513-.88.513-1.39z'
        );
    }

    function createStravaShareChevronIcon() {
        return createPathIcon(
            '0 0 16 16',
            'M14.384 5.5L8.796 11.09c-.44.44-1.152.44-1.591 0L1.616 5.5l.884-.884 5.5 5.5 5.5-5.5z'
        );
    }

    function createFunnelIcon() {
        return createPathIcon(
            '0 0 16 16',
            'M1.5 2h13L9.75 7.35v4.4l-3.5 2.25V7.35L1.5 2zm2.22 1.25L7.5 7.51v4.2l1-.64V7.51l3.78-4.26H3.72z'
        );
    }

    function createFilterButton(filter) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = filter.title;
        button.dataset.stravaFilterControl = 'true';
        button.style.cssText = `
            position: relative;
            width: 28px; height: 28px; padding: 4px;
            border: none; cursor: pointer;
            display: inline-flex; align-items: center; justify-content: center;
            line-height: 1; white-space: nowrap;
        `;
        button.appendChild(filter.iconFactory());

        const badge = createBadge();
        button.appendChild(badge);
        updateButtonStyle(button, isFilterEnabled(filter));

        button.addEventListener('click', (event) => {
            event.preventDefault();
            toggleFilter(filter);
        });

        return { button, badge };
    }

    function applyActivityTypeSelection() {
        recheckTrackedEntries();
        saveHiddenActivityTypes();
        syncBodyFilterClasses();
        renderActivityTypeMenu();
        syncFilterUi();
    }

    function setActivityTypeVisible(type, visible) {
        if (visible) {
            hiddenActivityTypes.delete(type);
        } else {
            hiddenActivityTypes.add(type);
        }
        applyActivityTypeSelection();
    }

    function showAllActivityTypes() {
        if (hiddenActivityTypes.size === 0) {
            return;
        }
        hiddenActivityTypes.clear();
        applyActivityTypeSelection();
    }

    function renderActivityTypeMenu() {
        const menu = filterControls[ACTIVITY_TYPE_FILTER_ID]?.menu;
        if (!menu) {
            return;
        }

        menu.replaceChildren();

        const header = document.createElement('div');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:16px; padding:8px 12px 4px;';

        const heading = document.createElement('strong');
        heading.textContent = 'Activity types';
        heading.style.cssText = 'font-size:13px; white-space:nowrap;';
        header.appendChild(heading);

        if (hiddenActivityTypes.size > 0) {
            const showAll = document.createElement('button');
            showAll.type = 'button';
            showAll.textContent = 'Show all';
            showAll.style.cssText = `
                padding:0; border:0; background:none; color:${BUTTON_ACTIVE_COLOR};
                cursor:pointer; font:inherit; font-size:12px; white-space:nowrap;
            `;
            showAll.addEventListener('click', showAllActivityTypes);
            header.appendChild(showAll);
        }
        menu.appendChild(header);

        const types = [...activityTypeLabels.entries()]
            .sort((left, right) => left[1].localeCompare(right[1]));

        if (types.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'Types will appear as activities load.';
            empty.style.cssText = 'padding:4px 12px 11px; color:#666; font-size:12px; white-space:nowrap;';
            menu.appendChild(empty);
            return;
        }

        // Fit every type without scrolling: dense rows, and extra columns
        // (filled top to bottom, so the order stays alphabetical) as the list grows.
        const columns = Math.ceil(types.length / ACTIVITY_TYPE_MENU_ROWS_PER_COLUMN);
        const rows = Math.ceil(types.length / columns);
        const list = document.createElement('div');
        list.style.cssText = `
            display:grid; grid-auto-flow:column; column-gap:12px;
            grid-template-rows:repeat(${rows}, auto);
            padding:0 6px 6px;
        `;
        types.forEach(([type, label]) => {
            const option = document.createElement('label');
            option.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 6px; cursor:pointer; font-size:12px; line-height:16px; white-space:nowrap;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.cssText = 'margin:0; width:13px; height:13px; flex-shrink:0;';
            checkbox.checked = !hiddenActivityTypes.has(type);
            checkbox.addEventListener('change', () => setActivityTypeVisible(type, checkbox.checked));

            const text = document.createElement('span');
            text.textContent = label;
            option.appendChild(checkbox);
            option.appendChild(text);
            list.appendChild(option);
        });
        menu.appendChild(list);
    }

    function closeActivityTypeMenu() {
        const control = filterControls[ACTIVITY_TYPE_FILTER_ID];
        if (!control) {
            return;
        }
        control.menu.style.display = 'none';
        control.button.setAttribute('aria-expanded', 'false');
    }

    function createActivityTypeFilterControl() {
        const root = document.createElement('div');
        root.style.cssText = 'position:relative; display:inline-flex;';

        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Filter by activity type';
        button.dataset.stravaFilterControl = 'true';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.style.cssText = `
            position:relative;
            width:28px; height:28px; padding:4px;
            border:none; cursor:pointer;
            display:inline-flex; align-items:center; justify-content:center;
            line-height:1; white-space:nowrap;
        `;
        button.appendChild(createFunnelIcon());

        const badge = createBadge();
        button.appendChild(badge);

        const menu = document.createElement('div');
        menu.setAttribute('role', 'menu');
        menu.style.cssText = `
            position:absolute; top:34px; right:0; z-index:1000;
            display:none; min-width:190px;
            color:#242428; background:#fff;
            border:1px solid #d8d8d8; border-radius:4px;
            box-shadow:0 4px 14px rgba(0,0,0,.18);
        `;

        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const opening = menu.style.display === 'none';
            menu.style.display = opening ? 'block' : 'none';
            button.setAttribute('aria-expanded', String(opening));
        });
        root.addEventListener('click', event => event.stopPropagation());
        root.appendChild(button);
        root.appendChild(menu);

        return { root, button, badge, menu };
    }

    const NAV_LINK_STYLE_PROPERTIES = [
        'color', 'fontSize', 'fontWeight', 'lineHeight', 'fontFamily',
        'padding', 'letterSpacing', 'display', 'alignItems', 'height',
        'textTransform'
    ];

    function findInactiveNavLink() {
        const currentPath = window.location.pathname;
        const links = document.querySelectorAll('.global-nav a.nav-link, .nav-bar a.nav-link');
        for (const link of links) {
            if (link.pathname && link.pathname !== currentPath) {
                return link;
            }
        }
        return null;
    }

    function copyNavLinkStyle(target, navLinkStyle) {
        if (!navLinkStyle) {
            return;
        }
        NAV_LINK_STYLE_PROPERTIES.forEach(property => {
            target.style[property] = navLinkStyle[property];
        });
        target.style.textDecoration = 'none';
    }

    function getInactiveNavLinkStyle() {
        const reference = findInactiveNavLink();
        return reference ? getComputedStyle(reference) : null;
    }

    function createFeedTypeToggle() {
        const container = document.createElement('div');
        container.id = FEED_TYPE_TOGGLE_ID;
        container.style.cssText = 'display:inline-flex; gap:8px; flex-shrink:0;';

        FEED_TYPES.forEach(feedType => {
            const tab = document.createElement('a');
            tab.href = feedType.url;
            tab.textContent = feedType.label;
            tab.dataset.feedType = feedType.id;
            tab.style.cursor = 'pointer';
            tab.style.borderBottom = '2px solid transparent';
            tab.addEventListener('click', (event) => {
                event.preventDefault();
                if (feedType.id !== getCurrentFeedType()) {
                    window.location.assign(feedType.url);
                }
            });
            container.appendChild(tab);
        });

        applyFeedTypeToggleState(container);
        return container;
    }

    function applyFeedTypeToggleState(container) {
        const current = getCurrentFeedType();
        const navLinkStyle = getInactiveNavLinkStyle();
        container.querySelectorAll('[data-feed-type]').forEach(tab => {
            copyNavLinkStyle(tab, navLinkStyle);
            const active = tab.dataset.feedType === current;
            tab.style.borderBottomColor = active ? BUTTON_ACTIVE_COLOR : 'transparent';
            tab.style.textDecoration = 'none';
            // Strava's header no longer always has a .nav-link to copy from;
            // without one the tab would keep the browser's blue link color.
            tab.style.fontWeight = active ? '700' : (navLinkStyle?.fontWeight || '400');
            tab.style.color = active ? '#000' : (navLinkStyle?.color || FEED_TAB_INACTIVE_COLOR);
        });
    }

    function mountFeedControlsIfNeeded() {
        if (document.getElementById(FILTER_WRAPPER_ID)) {
            return;
        }

        const feedSourceForm = document.getElementById(FEED_FILTER_INPUT_ID)?.closest('form');
        if (!feedSourceForm) {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.id = FILTER_WRAPPER_ID;
        wrapper.style.cssText = 'display:flex; align-items:center; flex-shrink:0; gap:5px;';

        FEED_FILTERS.forEach(filter => {
            if (filter.id === ACTIVITY_TYPE_FILTER_ID) {
                const control = createActivityTypeFilterControl();
                filterControls[filter.id] = control;
                wrapper.appendChild(control.root);
                renderActivityTypeMenu();
                return;
            }
            const control = createFilterButton(filter);
            filterControls[filter.id] = control;
            wrapper.appendChild(control.button);
        });

        const controlsRow = document.createElement('div');
        controlsRow.id = FILTER_CONTROL_ROW_ID;
        controlsRow.style.cssText = 'display:flex; align-items:center; flex-wrap:nowrap; gap:32px; width:max-content; max-width:100%;';

        const feedSourceControls = document.createElement('div');
        feedSourceControls.style.cssText = 'display:flex; align-items:center; gap:6px; flex-shrink:0;';

        feedSourceForm.style.flexShrink = '0';
        feedSourceForm.style.display = 'none';
        feedSourceForm.parentNode.insertBefore(controlsRow, feedSourceForm);
        feedSourceControls.appendChild(createFeedTypeToggle());
        feedSourceControls.appendChild(createFeedSourceDropdownButton(feedSourceForm));
        feedSourceControls.appendChild(feedSourceForm);
        controlsRow.appendChild(feedSourceControls);
        controlsRow.appendChild(wrapper);
        syncFilterUi();
    }

    function createFeedSourceDropdownButton(feedSourceForm) {
        const button = document.createElement('button');
        button.id = DROPDOWN_REVEAL_ID;
        button.type = 'button';
        button.title = 'Show more feed sources';
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', 'false');
        button.style.cssText = `
            border:none; cursor:pointer;
            padding:2px 4px; line-height:0; flex-shrink:0;
            display:inline-flex; align-items:center; justify-content:center;
        `;
        button.appendChild(createStravaShareChevronIcon());
        button.addEventListener('click', (event) => {
            event.preventDefault();
            const opening = feedSourceForm.style.display === 'none';
            feedSourceForm.style.display = opening ? '' : 'none';
            button.setAttribute('aria-expanded', String(opening));
        });
        return button;
    }

    function applyStravaKudosButtonClass() {
        if (!stravaKudosButtonClass) {
            const kudosButton = document.querySelector('[data-testid="kudos_button"]');
            if (!kudosButton) {
                return;
            }
            stravaKudosButtonClass = kudosButton.className;
        }
        document.querySelectorAll(`#${FILTER_WRAPPER_ID} [data-strava-filter-control="true"]`).forEach(button => {
            if (button.dataset.stravaClassApplied !== 'true') {
                button.className = stravaKudosButtonClass;
                button.dataset.stravaClassApplied = 'true';
            }
        });
        const reveal = document.getElementById(DROPDOWN_REVEAL_ID);
        if (reveal && reveal.dataset.stravaClassApplied !== 'true') {
            reveal.className = stravaKudosButtonClass;
            reveal.dataset.stravaClassApplied = 'true';
        }
    }

    function styleGiftLinksAsNavLinks() {
        const unstyledGiftLinks = document.querySelectorAll(UNSTYLED_GIFT_LINK_SELECTOR);
        if (unstyledGiftLinks.length === 0) {
            return;
        }

        const navLinkStyle = getInactiveNavLinkStyle();
        unstyledGiftLinks.forEach(link => {
            link.classList.remove('btn', 'btn-sm', 'btn-primary', 'experiment');
            link.classList.add('nav-link');
            copyNavLinkStyle(link, navLinkStyle);
        });
    }

    function scheduleDashboardRefresh() {
        if (dashboardRefreshScheduled) {
            return;
        }

        dashboardRefreshScheduled = true;
        requestAnimationFrame(refreshDashboardAfterDomChange);
    }

    function refreshDashboardAfterDomChange() {
        dashboardRefreshScheduled = false;
        mountFeedControlsIfNeeded();
        styleGiftLinksAsNavLinks();

        const previousAthleteId = myAthleteId;
        myAthleteId ??= findMyAthleteIdInHeader();
        observeCurrentFeedContainer();
        if (myAthleteId !== previousAthleteId) {
            recheckTrackedEntries();
            refreshBadges();
        }
        syncBodyFilterClasses();
    }

    function syncFeedTypeToggle() {
        const toggle = document.getElementById(FEED_TYPE_TOGGLE_ID);
        if (toggle) {
            applyFeedTypeToggleState(toggle);
        }
    }

    function syncFiltersAfterFeedNavigation() {
        syncBodyFilterClasses();
        refreshBadges();
        syncFeedTypeToggle();
    }

    function initialize() {
        loadFilterPreferences();
        installFilterStyles();
        syncBodyFilterClasses();
        mountFeedControlsIfNeeded();
        styleGiftLinksAsNavLinks();
        myAthleteId = findMyAthleteIdInHeader();
        observeCurrentFeedContainer();
        new MutationObserver(scheduleDashboardRefresh).observe(document.body, { childList: true, subtree: true });
        syncFilterUi();
        navigation.addEventListener('currententrychange', syncFiltersAfterFeedNavigation);
        document.addEventListener('click', closeActivityTypeMenu);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeActivityTypeMenu();
            }
        });
    }

    initialize();
})();
