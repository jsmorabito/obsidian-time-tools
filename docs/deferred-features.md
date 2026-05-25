# Deferred features

Features from the two upstream plugins that were intentionally excluded from Time Manager 0.1.0 (the MVP), grouped by source. Each entry is a candidate for a future release — they were skipped to keep the merge tight and the surface area reviewable, not because they're unwanted.

## From obsidian-periodic-notes

- **Quarterly and yearly periodic notes.** The current `Granularity` union is `day | week | month`. Restoring the wider union touches `src/periodic/types.ts`, `src/periodic/constants.ts`, settings UI, and command registration.
- **Calendar Sets.** Upstream supports multiple independent sets of periodic-note configurations, with an active set and a switcher. Time Manager has exactly one configuration per granularity. Restoring this requires a settings shape change (`calendarSets: CalendarSet[]`, `activeCalendarSet: string`) and a manager class.
- **Svelte settings dashboard.** Upstream has a rich Svelte 3 dashboard with a router, breadcrumbs, and per-period detail pages. Time Manager uses a plain `PluginSettingTab`. If we want a richer settings UI, we'd build it in Svelte 4 from scratch since Svelte 3 is end-of-life.
- **Periodic-notes cache.** Upstream maintains an in-memory cache keyed by calendar set / granularity / date and listens to vault events to keep it warm. Time Manager rescans `vault.getMarkdownFiles()` on each query. For very large vaults this becomes a bottleneck — when it matters, restore something like the upstream `cache.ts`.
- **Timeline complication.** Sidebar component showing adjacent periodic notes for the active file.
- **Quick-switcher integrations.** The "calendar set switcher", "related files switcher", and "file options switcher" patch into Obsidian's quick switcher.
- **NLDates integration.** Command that uses the Natural Language Dates plugin to open a periodic note by parsing a date expression.
- **Auto-open on startup.** Upstream can open a configured periodic note on layout-ready. We support this for the editor view, not for a specific periodic note. Easy to add later.
- **Migration from the legacy Daily Notes core plugin.** Upstream detects an existing Daily Notes core configuration and ports the format/folder/template into its own settings. Worth adding to make adoption painless.
- **File menu integrations** — adding "Open related periodic note" / etc to the file context menu.
- **Locale override.** A setting to force a moment locale different from Obsidian's. The first-week-of-year and week-start values come from the locale.

## From Obsidian-Daily-Notes-Editor

- **Folder selection mode.** "Show all notes inside folder X in the multi-note editor." Tied to the `setSelectionMode("folder", path)` API and the `SelectTargetModal`. The full upstream `FileManager` had branches for this — we kept only the `daily` branch.
- **Tag selection mode.** Same shape but driven by a tag instead of a folder path.
- **Preset list.** Save folder/tag selections as named presets and surface them in the view's action menu and settings tab. Requires reintroducing the `preset` field in settings, the `AddPresetModal`, and the preset list UI in the settings tab.
- **Custom date range.** A modal date-picker for start/end dates that filters the editor view. We dropped the `CustomRangeModal` to keep the view header simple.
- **Quarterly and "last quarter" time ranges in the editor view.** Upstream supported `quarter` and `last-quarter` in `TimeRange`. We can add these once quarterly periodic notes are restored.
- **Arrow-up / arrow-down navigation between embedded editors** (`createUpDownNavigationExtension` / `UpAndDownNavigate.ts`). A CodeMirror extension that lets the cursor leave the top/bottom of one embedded note and land in the adjacent one.
- **Recent Files plugin integration.** Upstream patches `recent-files-obsidian` so notes opened inside the editor view don't pollute the recent-files list. We skipped the recent-files patch but kept the equivalent patch for Obsidian's built-in recent-opened-file tracking.
- **"Open daily notes for this folder" file-menu item.** Right-clicking a folder offered a one-click way to enter folder mode. Gone with the folder mode.
- **Funding metadata / icon set.** The upstream `addIconList()` adds a single decorative `daily-note` icon that we don't use. Easy to add if we want a custom ribbon icon for the editor view.

## Cross-cutting things worth deciding before adding the above

- Whether to ship a richer Svelte 4 settings UI or stay on the plain `PluginSettingTab` long-term.
- Whether the editor view should accept any periodic note (weekly/monthly), not just daily, once weekly/monthly are well-tested.
- Whether to introduce a proper in-memory cache for periodic-note discovery, with vault-event listeners — and what API to expose for future modules.
