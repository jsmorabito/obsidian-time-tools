# Obsidian Time Tools — agent context

This is the working document for AI agents working on `obsidian-time-tools`. Read this before touching any file. General Obsidian plugin conventions live in `AGENTS.md`; this file covers what is specific to this codebase.

---

## What this plugin is

**obsidian-time-tools** merges two upstream MIT plugins into one cohesive package:

- [`liamcain/obsidian-periodic-notes`](https://github.com/liamcain/obsidian-periodic-notes) — daily / weekly / monthly / quarterly / yearly note management
- [`quorafind/Obsidian-Daily-Notes-Editor`](https://github.com/quorafind/Obsidian-Daily-Notes-Editor) — scrollable multi-note editor view

It is intended as a foundation for a broader time-management toolkit (tasks, events, agenda) — keep the architecture modular with that future in mind.

Credit both upstream authors in `README.md`. Both originals are MIT; a `NOTICE.md` is included.

---

## Architecture

```
src/
  main.ts                     # Plugin lifecycle only — keep it thin
  settings.ts                 # TimeManagerSettings shape + PluginSettingTab + AddPresetModal
  obsidian-augmentations.ts   # Obsidian type extensions

  periodic/
    types.ts                  # Granularity union, PeriodicConfig, DisplayConfig, displayConfigs
    constants.ts              # DEFAULT_FORMAT, HUMANIZE_FORMAT per granularity
    api.ts                    # PeriodicResolver interface, create/open/find helpers
    discovery.ts              # vault scan — matchPeriodicFile, findPeriodicNotes, getPeriodicNoteForDate
    commands.ts               # registerPeriodicCommands, ensureTodaysDailyNote
    icons.ts                  # registerPeriodicIcons
    migrate.ts                # maybeMigrateFromDailyNotesCore — one-shot import from core plugin
    switcher.ts               # registerQuickSwitchers — related-files + file-options SuggestModals
    timeline-view.ts          # TimelineView ItemView — sidebar showing adjacent periodic notes

  editor/
    types.ts                  # TimeRange, SelectionMode, TimeField, CustomRange
    file-manager.ts           # FileManager — resolves files for daily/folder/tag/horizon modes, filters by range
    view.ts                   # DailyNoteView ItemView — state, actions, menus
    DailyNoteEditorView.svelte # Svelte shell — toolbar, breadcrumb bar, infinite scroll, mode switching
    DailyNote.svelte           # Single embedded note leaf
    leafView.ts               # spawnLeafView, DailyNoteEditor, isDailyNoteLeaf
    workspace-patches.ts      # monkey-around patches for activeLeaf, iterateLeaves, recent-files
    CustomRangeModal.ts       # Date-picker modal for custom time ranges
    up-down-navigation.ts     # CodeMirror extension for cross-note arrow-key navigation
    InboxService.ts           # Scans metadataCache for #inbox tags — returns TaggedInboxItem[] (used by InboxView)
    InboxLine.svelte          # Line-level #inbox hit card (used by DailyNoteEditorView inbox mode)

  inbox/
    types.ts                  # InboxItem (manual store entry), InboxDisplayOptions
    store.ts                  # InboxStore — persisted array of manually-added inbox items (saved to plugin data)
    view.ts                   # InboxView ItemView — LEFT SIDEBAR panel; shows manual items + live #inbox-tagged items
    commands.ts               # registerInboxCommands — open-inbox, add-file-to-inbox, add-file-to-inbox-with-options
    AddToInboxModal.ts        # Modal for adding a file with priority/due date/tags
    SnoozeModal.ts            # Modal for snoozing an inbox item to a future time

  calendar/
    types.ts                  # CalendarSource, CalendarEvent, CALENDAR_COLORS
    calendar-service.ts       # CalendarService — fetches/caches ICS feeds, 15-min TTL
    ics-parser.ts             # parseICS, isEventOnDate — pure ICS parsing (no network)
    EventsStrip.svelte        # Thin events bar rendered below the breadcrumb bar in daily mode

  utils/
    id.ts
    paths.ts                  # getNoteCreationPath
    template.ts               # getTemplateContents, applyTemplateTransformations
    relative-date.ts
```

**Key design rule:** `src/main.ts` only handles plugin lifecycle (onload, onunload, register*, addCommand, addSettingTab). All feature logic lives in the modules above. Keep `main.ts` under ~200 lines.

---

## Settings shape (TimeManagerSettings)

```ts
{
  day / week / month / quarter / year: PeriodicConfig   // enabled, format, folder, templatePath
  createAndOpenEditorOnStartup: boolean
  openNoteOnStartup: Granularity | null                  // open a specific note on layout-ready
  hideFrontmatter: boolean
  hideBacklinks: boolean
  presets: Preset[]                                      // saved folder/tag/daily selections
  migratedFromDailyNotes: boolean                        // one-shot migration guard
  calendarSources: CalendarSource[]                      // ICS/iCal feeds — url or vault-relative file path
}
```

When adding new settings: add the field to `TimeManagerSettings`, add a default in `DEFAULT_SETTINGS`, and add the merge line in `mergeSettings()` in `main.ts`. Do not forget `mergeSettings` — omitting it silently discards saved values on upgrade.

---

## Granularity

The `Granularity` type is `"day" | "week" | "month" | "quarter" | "year"`. The canonical array is `granularities` exported from `src/periodic/types.ts`. **Never hardcode** `["day", "week", "month"]` anywhere — always import and iterate `granularities` so quarterly/yearly are included automatically.

Default formats:
| Granularity | Format |
|---|---|
| day | `YYYY-MM-DD` |
| week | `gggg-[W]ww` |
| month | `YYYY-MM` |
| quarter | `YYYY-[Q]Q` |
| year | `YYYY` |

---

## Editor view — SelectionMode

The multi-note editor (`DailyNoteView` / `DailyNoteEditorView.svelte`) has four selection modes:

- `"daily"` — shows periodic notes for the active granularity, filtered by `TimeRange`
- `"folder"` — shows all markdown files inside a chosen folder path
- `"tag"` — shows all markdown files carrying a chosen tag
- `"horizon"` — shows one embedded column per enabled granularity (today's note for each), side by side

`FileManager` handles the first three. `DailyNoteView.setSelectionMode(mode, pathOrTag)` is the public API — call it from `main.ts` or the settings tab, not by directly mutating `FileManager`.

### Scroll direction

In `"daily"` mode the user can toggle vertical (default, newest-first) or horizontal scroll. Horizontal mode re-sorts oldest-first so the timeline reads left-to-right and silently prepends older notes as the user scrolls left. `DailyNoteView.setScrollDirection()` persists this across sessions.

### Breadcrumb / navigation bar

In `"daily"` mode a breadcrumb bar is rendered below the toolbar showing the focused note's hierarchical context (e.g. `2026 / Q2 / W24`). Each segment is clickable to switch granularity and scroll to that note. The **current** (rightmost) segment has a `▾` chevron that opens a **period-nav dropdown** showing the child periods within the focused period:

| Active granularity | Dropdown shows |
|---|---|
| `year` | Q1–Q4 |
| `quarter` | 3 months |
| `month` | isoWeeks overlapping the month |
| `week` | 7 days (Mon–Sun), date number + 2-letter abbr |
| `day` | *(no dropdown)* |

Clicking a chip switches granularity (if the target granularity is enabled) and navigates to that note, creating it if absent. Today's chip is highlighted in accent color. `getSubPeriods(date, gran)` and `handleSubPeriodClick(sub)` in `DailyNoteEditorView.svelte` own this logic.

**CSS note:** `.tm-breadcrumbs` must **not** have `overflow: hidden` — it would clip the absolutely-positioned dropdown. Use `overflow: visible` (the current default).

### Calendar / Events strip

`CalendarService` (instantiated on `plugin.calendarService`) fetches all enabled `calendarSources`, parses ICS via `ics-parser.ts`, and caches events for 15 minutes. `EventsStrip.svelte` renders a thin row of today's events below the breadcrumb bar in daily mode. Call `plugin.calendarService.invalidate()` after settings changes to clear the cache.

---

## TimeRange

```ts
"all" | "week" | "month" | "quarter" | "year"
| "last-week" | "last-month" | "last-quarter" | "last-year"
| "custom"
```

`"custom"` requires a `CustomRange` (`{ start: string; end: string }` in `YYYY-MM-DD`). Pass it via `DailyNoteView.setCustomRange(cr)`.

---

## View types registered

| Constant | Type string | Class |
|---|---|---|
| `TIME_MANAGER_EDITOR_VIEW` | `"obsidian-time-tools-editor-view"` | `DailyNoteView` |
| `TIME_MANAGER_TIMELINE_VIEW` | `"obsidian-time-tools-timeline-view"` | `TimelineView` |

Both are registered in `main.ts` `onload()` and detached in `onunload()`.

---

## Commands registered

All commands use stable IDs — do not rename after release.

| ID | Description |
|---|---|
| `open-{periodicity}-note` | Open current period note (one per enabled granularity) |
| `open-next-{periodicity}-note` | Open next period note (checkCallback — active file must match) |
| `open-prev-{periodicity}-note` | Open previous period note (checkCallback) |
| `open-multi-note-editor` | Open the editor view |
| `open-timeline-sidebar` | Open the timeline sidebar |
| `open-related-files-switcher` | Fuzzy-switch between periodic notes of the same granularity |
| `open-file-options-switcher` | Action picker for the active periodic note |

---

## Inbox architecture

The plugin has **one** inbox — `src/inbox/InboxView` — a left sidebar panel registered as `TIME_MANAGER_INBOX_VIEW`. Do not build a second inbox or confuse it with the editor's "inbox" selection mode.

**Two item sources render in the same sidebar view:**

| Source | How items get in | How items leave |
|---|---|---|
| **Manual** (`InboxStore`) | User runs "Add file to inbox" command or uses the file-menu action | Dismiss / snooze / dismiss-all |
| **Tagged** (`InboxService`) | File or line carries `#inbox` tag (inline or frontmatter) | Remove the `#inbox` tag from the source |

`InboxService` (`src/editor/InboxService.ts`) scans `metadataCache` synchronously and returns `TaggedInboxItem[]` (a discriminated union of `InboxFileItem` and `InboxInlineItem`). **Note:** the type is named `TaggedInboxItem`, not `InboxItem` — that name is taken by the manual store type in `src/inbox/types.ts`.

`InboxView.renderBody()` calls both `inboxStore.getActiveItems()` and `inboxService.getInboxItems()` and renders them in separate sections ("Active", "Scheduled", "Tagged"). A `vault.modify` + `metadataCache.changed` listener triggers `this.render()` so the Tagged section stays live.

The editor view also has an `"inbox"` `SelectionMode` (source selector → Inbox) which shows the same tagged items in the scrollable multi-note editor — that is a secondary surface, not the primary one.

---

## Deferred features

See `docs/deferred-features.md` for the full decision log. Items tagged **Later** or **Table it** are explicitly out of scope until conditions change. Do not implement them without checking with the project owner first.

Notable items explicitly **skipped**: Calendar Sets, Svelte 4 settings dashboard, NLDates integration.

---

## Patterns to follow

**Adding a new periodic granularity:** Add to the `Granularity` union in `types.ts`, add a format to `constants.ts`, add a `DisplayConfig` entry in `types.ts`, add a settings section via `renderPeriodSection` in `settings.ts`, add a merge line in `mergeSettings` in `main.ts`. Commands, discovery, and the editor toolbar pick up new granularities automatically from the `granularities` array.

**Adding a new editor time range:** Add the string to the `TimeRange` union in `editor/types.ts`, add a case in `FileManager.isDateInRange`, and add a menu item in `DailyNoteView.onOpen` in `view.ts`.

**Adding a new command:** Add it in the appropriate module (`commands.ts` for periodic, `switcher.ts` for switcher-style), not in `main.ts`. Wire the registration call from `main.ts` `onload()`.

**Svelte components:** Use Svelte 4. The project ships Svelte 4 via npm. Do not use Svelte 3 patterns (no `<script context="module">` reactivity model differences). Keep component props typed with `export let`.

**Monkey-patching:** Use `monkey-around` (already a dependency). All patches go in `workspace-patches.ts`, registered via `plugin.register(around(...))` so they unload cleanly.

---

## Build

```bash
npm install       # first time
npm run dev       # watch mode
npm run build     # production (runs tsc -noEmit then esbuild)
```

Build must pass `tsc -noEmit` with no errors before committing. The project uses `"strict": true`.

Output: `main.js` at plugin root (esbuild bundles everything). Do not commit `main.js`.

---

## Common mistakes to avoid

- Hardcoding `["day", "week", "month"]` — use the `granularities` array from `types.ts`
- Forgetting to add a new settings field to `mergeSettings()` in `main.ts`
- Registering a view or event listener outside of `onload` (or without `this.register*`)
- Calling `fileManager.updateOptions()` directly from Svelte — go through `DailyNoteView` methods
- Using `localStorage` — not supported in Obsidian; use `plugin.loadData()` / `saveData()`
- Adding `overflow: hidden` to `.tm-breadcrumbs` or `.tm-breadcrumb-bar` — it clips the period-nav dropdown
- Calling `plugin.calendarService.getEventsForDate()` without handling the async result — it returns a `Promise`
- `import type { Moment } from "obsidian"` — `Moment` is **not** exported from the obsidian package. Use `import type { Moment } from "moment"` instead. This affects `src/periodic/api.ts`, `src/periodic/discovery.ts`, `src/utils/relative-date.ts`, and `src/utils/template.ts`. These files get reverted by a local formatter/hook, so re-apply if the build breaks with `TS2724: '"obsidian"' has no exported member named 'Moment'`.

---

## Editor view — initialisation and scroll architecture (hard-won lessons)

This section documents non-obvious behaviours discovered through extensive debugging. Read before touching `DailyNoteEditorView.svelte` or `view.ts`.

### The `$: if (fileManager) applySearchQuery(searchQuery)` trap

`DailyNoteEditorView.svelte` has a reactive statement that fires `applySearchQuery` whenever `fileManager` or `searchQuery` changes. **This means it fires the instant `fileManager` is assigned in `onMount`.** `applySearchQuery("")` with an empty query unconditionally calls `renderedFiles = []; startFillViewport()`, wiping any custom positioning `onMount` just set up and restarting the infinite-scroll fill from the newest note.

**Guard:** `applySearchQuery` skips the initial call by tracking `_lastSearchQuery`. If both the previous and current query are `""`, it returns early. This must be preserved — removing the guard breaks the "open to today" behaviour.

### `onMount` owns the initial file positioning

For `selectionMode === "daily" && scrollDirection === "vertical"`, `onMount` is responsible for slicing `fileManager.getFilteredFiles()` so that today's note is `renderedFiles[0]`. This must happen **synchronously** in `onMount` before any reactive statements run. The pattern:

```
futureFiles  = allFiles.slice(0, todayIdx).reverse()   // newer than today, for upward scroll
renderedFiles = allFiles.slice(todayIdx, todayIdx + 11) // today + 10 look-ahead
filteredFiles = allFiles.slice(todayIdx + 11)           // older notes, loaded on scroll-down
```

If today's note doesn't exist yet, it's created async and prepended to `renderedFiles`. Set `scrollFocusedFile = todayFile` after positioning so the breadcrumb and `isOnToday` are correct immediately.

### Obsidian's `setEphemeralState` overwrites scroll position on reload

When Obsidian restores a workspace tab (`setState` + `setEphemeralState`), `setEphemeralState` is called **after** `setState` and resets the scroll position to whatever was saved. This happens **after** `onMount` and after `onLayoutReady`. It silently undoes any programmatic `scrollTop = 0` set during mount.

**Fix:** Override `setEphemeralState` in `DailyNoteView` (`view.ts`). Call `super.setEphemeralState(state)` then `window.requestAnimationFrame(() => this.view?.resetScrollToTop?.())`. The one-rAF delay ensures Obsidian's own restore has run first, then we reset to 0.

`setEphemeralState` can fire **twice** on reload (Obsidian calls it once per workspace pane restore pass). `resetScrollToTop` must therefore re-suppress prepend each time it's called — it sets `_prependEnabled = false` and `_wasScrolledDown = false` then re-enables after two rAFs.

### Upward infinite scroll (`futureFiles` / `prependBatch`)

Future notes (dates newer than today) live in `futureFiles` — an oldest-future-first queue. `prependBatch` splices from the front and prepends to `renderedFiles`, compensating `scrollEl.scrollTop` by the added height so the view doesn't jump.

**Do not use IntersectionObserver** to trigger `prependBatch`. The topLoaderRef sentinel is always visible at `scrollTop = 0`, so IO fires immediately on render and causes premature prepend before the user has scrolled. Instead, trigger from `updateFocusFromScroll` (the scroll event handler) with two independent guards:

1. `_prependEnabled` — false during initial mount and after any programmatic scroll-to-top; re-enabled after two rAFs
2. `_wasScrolledDown` — true only after user scrolls ≥ 100px down; resets when prependBatch fires or when Today is clicked

Both must be true for `prependBatch` to run. This makes it structurally impossible for prepend to fire from a programmatic `scrollTop = 0`.

Always use `scrollEl` directly in `prependBatch` for scroll compensation — **not** `getScrollContainer()`. `getScrollContainer()` walks up the DOM looking for `scrollHeight > clientHeight`, but when notes haven't loaded content yet their heights are minimal and the condition fails, returning the wrong outer element.

### `FileManager.fileCreate()` must be called eagerly after vault creates

When `createPeriodicNote` creates a new file, the vault emits a `"create"` event **asynchronously**. The `FileManager` updates its `filteredFiles` in response to that event. But `scrollToFile` calls `fileManager.getFilteredFiles()` immediately after creation — before the event fires — and can't find the new file (`idx === -1`), causing it to return early without updating `scrollFocusedFile`.

**Fix:** After any `createPeriodicNote(...)` call, immediately call `fileManager.fileCreate(newFile)` to register it synchronously. The vault event will still fire later but is a no-op (duplicate guard in `fileCreate`). This applies to `navigateNext`, `navigatePrev`, and `navigateToday`.

### `getScrollContainer()` is unreliable for programmatic scrolls

The helper walks up from `scrollEl` looking for `overflow-y: auto/scroll` with `scrollHeight > clientHeight`. When note content hasn't loaded yet (skeleton/placeholder state), `scrollEl.scrollHeight ≤ scrollEl.clientHeight` and the walk goes past `scrollEl` to some outer Obsidian container. Setting `scrollTop` on that outer container has no visible effect.

For any code that needs to scroll to the top (Today button, `resetScrollToTop`), set `scrollEl.scrollTop = 0` directly. For `scrollToFile` (scrolling to a specific note), the manual `targetTop` calculation in `scrollToFile` has the same flaw — this is a known limitation but acceptable since it only affects the rarely-hit "scroll not quite right" case, not the "completely wrong note" case.
