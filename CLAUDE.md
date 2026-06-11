# Obsidian Time Tools — agent context

This is the working document for AI agents working on `obsidian-time-tools`. Read this before touching any file. General Obsidian plugin conventions live in `AGENTS.md`; this file covers what is specific to this codebase.

---

## What this plugin is

**obsidian-time-tools** merges two upstream MIT plugins into one cohesive package:

- [`liamcain/obsidian-periodic-notes`](https://github.com/liamcain/obsidian-periodic-notes) — daily / weekly / monthly / quarterly / yearly note management
- [`quorafind/Obsidian-Daily-Notes-Editor`](https://github.com/quorafind/Obsidian-Daily-Notes-Editor) — scrollable multi-note editor view

It is a full time-management toolkit: periodic notes, multi-note editor, inbox, calendar grid, agenda/tasks sidebar, sessions, recently-viewed panel, and natural-language date input.

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
    half-year.ts              # Half-year helpers: startOfHalfYear, endOfHalfYear, parseHalfYear, etc.
    nav-actions.ts            # registerLeafNavActions — prev/next/open-in-view leaf buttons
    DatePickerModal.ts        # Date-picker modal used by NL dates
    trigger-provider.ts       # obsidian-objects @ trigger integration

  editor/
    types.ts                  # TimeRange, SelectionMode, TimeField, CustomRange,
                              # BreadcrumbSeg, SubPeriod, IEditorLeafView
    file-manager.ts           # FileManager — resolves files for daily/folder/tag/horizon modes, filters by range
    file-menu.ts              # registerFileMenuHandlers — file-menu event handler (extracted from main.ts)
    view.ts                   # DailyNoteView ItemView — state, actions, menus
    DailyNoteEditorView.svelte # Main Svelte shell — composes sub-components, owns scroll + file state
    EditorToolbar.svelte      # Toolbar with all dropdowns; dispatches events to parent
    BreadcrumbBar.svelte      # Breadcrumb segments + period-nav dropdown + prev/next/today
    EventsSidePanel.svelte    # Events + targets side panel (opened via toolbar toggle)
    HorizonView.svelte        # Horizon mode — one column per enabled granularity
    DailyNote.svelte          # Single embedded note leaf with hover-reveal actions
    InboxLine.svelte          # Line-level #inbox hit card (inbox SelectionMode)
    leafView.ts               # spawnLeafView, DailyNoteEditor, isDailyNoteLeaf
    workspace-patches.ts      # monkey-around patches for activeLeaf, iterateLeaves, recent-files
    CustomRangeModal.ts       # Date-picker modal for custom time ranges
    SelectTargetModal.ts      # Folder/tag picker modals
    up-down-navigation.ts     # CodeMirror extension for cross-note arrow-key navigation
    InboxService.ts           # Scans metadataCache for inbox tags — returns TaggedInboxItem[]

  inbox/
    types.ts                  # InboxItem (manual store entry), InboxDisplayOptions
    store.ts                  # InboxStore — persisted array of manually-added inbox items
    view.ts                   # InboxView ItemView — LEFT SIDEBAR panel
    commands.ts               # registerInboxCommands — open-inbox, add-file-to-inbox, etc.
    AddToInboxModal.ts        # Modal for adding a file with priority/due date/tags
    SnoozeModal.ts            # Modal for snoozing an inbox item to a future time

  calendar/
    types.ts                  # CalendarSource, CalendarEvent, CALENDAR_COLORS
    calendar-service.ts       # CalendarService — fetches/caches ICS feeds, 15-min TTL
    ics-parser.ts             # parseICS, isEventOnDate — pure ICS parsing (no network)
    EventsStrip.svelte        # Thin events bar (legacy — largely replaced by EventsSidePanel)
    AgendaView.ts             # AgendaView ItemView — RIGHT SIDEBAR; period header, toolbar,
                              #   Tasks/Targets toggle, calendar events
    TaskService.ts            # getTasksForPeriod, toggleTask — checkbox tasks across a period
    TasksPanel.svelte         # Interactive task list with All/Open/Done filter tabs
    CalendarView.ts           # CalendarView ItemView — MAIN EDITOR TAB calendar grid
    CalendarGrid.svelte       # Day/week/month/year/horizon grid — note dots, event dots, target chips
    TargetDatePanel.svelte    # Left sidebar panel inside CalendarView — lists files by targetDate range
    CalendarInboxPanel.svelte # Left sidebar panel inside CalendarView — inbox items
    CalendarChainsPanel.svelte # Left sidebar panel inside CalendarView — task chains
    drag-state.ts             # Shared drag payload store for calendar drag-and-drop

  sessions/                   # Focus session timer and session notes
  recently-viewed/            # Recently-viewed file panel
  nldates/                    # Natural-language date parsing and autosuggest
  target-date/                # targetDate frontmatter service — surface notes in agenda

  utils/
    id.ts
    paths.ts                  # getNoteCreationPath
    template.ts               # getTemplateContents, applyTemplateTransformations,
                              #   getTemplateVariableReference
    relative-date.ts
    Icon.svelte               # Wraps setIcon() for use in Svelte templates
    Toggle.svelte             # Wraps Obsidian's ToggleComponent for use in Svelte templates
    display-title.ts          # getPeriodicDisplay — primary/secondary label for note titles
```

**Key design rule:** `src/main.ts` only handles plugin lifecycle (onload, onunload, register*, addCommand, addSettingTab). All feature logic lives in the modules above. Keep `main.ts` under ~250 lines.

**File-menu handlers** live in `src/editor/file-menu.ts`, registered via `registerFileMenuHandlers(plugin)`. Do not put file-menu logic in `main.ts`.

---

## Settings shape (TimeManagerSettings)

```ts
{
  // Periodic note config (one per granularity)
  day / week / month / quarter / "half-year" / year: PeriodicConfig
    // { enabled, format, folder, templatePath }

  // Startup
  createAndOpenEditorOnStartup: boolean
  openNoteOnStartup: Granularity | null

  // Editor display
  hideFrontmatter: boolean
  hideBacklinks: boolean

  // Saved source presets
  presets: Preset[]

  // Sessions
  sessionsFolder: string

  // Recently-viewed panel
  rvMaxItems: number
  rvShowTimestamp: boolean
  rvShowPath: boolean
  recentFiles: RecentFileEntry[]

  // Migration guard
  migratedFromDailyNotes: boolean

  // Natural-language dates
  nlDates: NLDatesSettings

  // Calendar integration (ICS feeds)
  calendarSources: CalendarSource[]

  // Inbox
  inboxDisplay: InboxDisplayOptions
  inboxTags: string[]           // tags that feed the inbox (without #)
  inboxExcludeTags: string[]
  readTaggedItems: string[]     // "path" or "path:line" keys — pruned on saveSettings()
  inboxAutoRemoveDone: boolean

  // Ribbon icons (all opt-in; only ribbonEditor defaults true)
  ribbonDaily: boolean
  ribbonEditor: boolean
  ribbonInbox: boolean

  // View placement
  timelineSide: "left" | "right"
  agendaSide:   "left" | "right"
  inboxSide:    "left" | "right"

  // AgendaView work section
  agendaWorkSection: "tasks" | "targets"
  agendaTaskFilter:  "all" | "open" | "done"
}
```

**Rule:** When adding a new settings field: add it to `TimeManagerSettings`, add a default in `DEFAULT_SETTINGS`, and add the merge line in `mergeSettings()` in `main.ts`. Omitting `mergeSettings` silently discards saved values on upgrade.

**`readTaggedItems` pruning:** `saveSettings()` automatically removes keys whose source file no longer exists in the vault. Do not grow this array without a corresponding prune path.

---

## Granularity

The `Granularity` type is `"day" | "week" | "month" | "quarter" | "half-year" | "year"`. The canonical array is `granularities` exported from `src/periodic/types.ts`. **Never hardcode** `["day", "week", "month"]` anywhere — always import and iterate `granularities`.

Default formats:
| Granularity | Format |
|---|---|
| day | `YYYY-MM-DD` |
| week | `gggg-[W]ww` |
| month | `YYYY-MM` |
| quarter | `YYYY-[Q]Q` |
| half-year | `YYYY-[H]H` |
| year | `YYYY` |

Half-year helpers (`startOfHalfYear`, `endOfHalfYear`, `parseHalfYear`, `isSameHalfYear`, `formatHalfYear`, `addHalfYears`, `halfOf`) all live in `src/periodic/half-year.ts`. Moment.js has no native half-year unit — never try to use `moment.add(1, "half-year")`.

---

## Editor view — SelectionMode

The multi-note editor (`DailyNoteView` / `DailyNoteEditorView.svelte`) has five selection modes:

- `"daily"` — periodic notes for the active granularity, filtered by `TimeRange`
- `"folder"` — all markdown files inside a chosen folder path
- `"tag"` — all markdown files carrying a chosen tag
- `"horizon"` — one embedded column per enabled granularity (today's note for each)
- `"inbox"` — files/lines tagged with the configured inbox tag(s)

`FileManager` handles daily/folder/tag. `DailyNoteView.setSelectionMode(mode, pathOrTag)` is the public API — call it from `main.ts` or the settings tab, not by directly mutating `FileManager`.

### Component structure

`DailyNoteEditorView.svelte` is the shell. It owns all file/scroll state and composes four sub-components:

| Component | Responsibility |
|---|---|
| `EditorToolbar.svelte` | All toolbar dropdowns; dispatches events up |
| `BreadcrumbBar.svelte` | Breadcrumb segments + period-nav dropdown + prev/next/today |
| `EventsSidePanel.svelte` | Events + targets side panel (shown beside the note list) |
| `HorizonView.svelte` | Horizon mode multi-column layout |

Each sub-component dispatches events; the parent handles all state mutations and file operations. Do not let sub-components mutate `FileManager` or scroll state directly.

### Calling back to the parent leaf view

`DailyNoteEditorView.svelte` accesses `DailyNoteView` methods via a typed helper to avoid `@ts-ignore`:

```ts
// In DailyNoteEditorView.svelte
function callView(): IEditorLeafView | null {
    return (leaf?.view as unknown as IEditorLeafView) ?? null;
}
// Usage:
callView()?.setGranularity?.(g);
callView()?.setScrollDirection?.("vertical");
```

`IEditorLeafView` is defined in `src/editor/types.ts`. Adding a new method that the Svelte component needs to call back: add it to `IEditorLeafView` first.

### Viewport fill loop

The infinite-scroll fill uses a **rAF-based loop** (`startFillViewport` / `runFillLoop`), not `setInterval`. The loop appends one batch, checks whether the loader sentinel is still in view, and either schedules the next frame or stops. Do not replace this with `setInterval` — the rAF approach avoids hot polling and self-terminates when the viewport is satisfied.

### Breadcrumb / navigation bar

In `"daily"` mode a breadcrumb bar is rendered below the toolbar. The current segment has a `▾` that opens a period-nav dropdown:

| Active granularity | Dropdown shows |
|---|---|
| `year` | Q1–Q4 |
| `quarter` | 3 months |
| `month` | isoWeeks overlapping the month |
| `week` | 7 days (Mon–Sun) |
| `day` | *(no dropdown)* |

**CSS note:** `.tm-breadcrumbs` must **not** have `overflow: hidden` — it clips the absolutely-positioned dropdown.

### Scroll architecture (hard-won lessons)

See the full section at the bottom of this file.

---

## CSS class naming

All plugin-owned selectors use the `tm-` prefix. Subsystem sub-prefixes:

| Prefix | Subsystem |
|---|---|
| `tm-` | shared / multi-note editor |
| `tm-pnp-` | Periodic Note Panel (AgendaView sidebar) |
| `tm-tdm-` | Target Date Modal |
| `tm-timeline-` | Timeline sidebar |
| `tm-nav-` | Leaf nav controls |
| `tm-inbox-` | Inbox panel |
| `tm-cal-` | Calendar grid (CalendarView) |
| `tm-tasks-` | Tasks panel (AgendaView Tasks tab) |
| `rv-` | Recently Viewed panel |

The `rv-` prefix is legacy and will be unified to `tm-rv-` in a future pass. Do not use the old bare `inbox-` prefix — it was renamed to `tm-inbox-` in a previous pass.

All styles live in `styles.css` (global) or in component `<style>` blocks (Svelte-scoped). The two are functionally equivalent for Obsidian plugins (no Shadow DOM), but Svelte warns on unused selectors, so keep component styles in the component.

---

## View types registered

| Constant | Type string | Class | Default location |
|---|---|---|---|
| `TIME_MANAGER_EDITOR_VIEW` | `"obsidian-time-tools-editor-view"` | `DailyNoteView` | Main editor tab |
| `TIME_MANAGER_TIMELINE_VIEW` | `"obsidian-time-tools-timeline-view"` | `TimelineView` | Right sidebar |
| `TIME_MANAGER_SESSIONS_VIEW` | `"obsidian-time-tools-sessions-view"` | `SessionsView` | Main editor tab |
| `VIEW_TYPE_RECENTLY_VIEWED` | `"obsidian-time-tools-recently-viewed"` | `RecentlyViewedView` | Left sidebar |
| `TIME_MANAGER_INBOX_VIEW` | `"obsidian-time-tools-inbox-view"` | `InboxView` | Left sidebar |
| `TIME_MANAGER_AGENDA_VIEW` | `"obsidian-time-tools-agenda-view"` | `AgendaView` | Right sidebar |
| `TIME_MANAGER_CALENDAR_VIEW` | `"obsidian-time-tools-calendar-view"` | `CalendarView` | Main editor tab |

**Type string stability:** These strings are stored in saved workspace state. Never rename them after the plugin has been installed by users — doing so breaks workspace restore.

Default sidebar placement is configurable via `timelineSide`, `agendaSide`, `inboxSide` settings (left/right).

---

## Commands registered

All commands use stable IDs — do not rename after release.

| ID | Description |
|---|---|
| `open-{periodicity}-note` | Open current period note (one per enabled granularity) |
| `open-next-{periodicity}-note` | Open next period note |
| `open-prev-{periodicity}-note` | Open previous period note |
| `open-multi-note-editor` | Open the timeline editor view |
| `open-new-time-note-view` | Always opens a fresh editor tab |
| `open-timeline-sidebar` | Open the timeline sidebar |
| `open-agenda-view` | Open the agenda panel |
| `open-calendar-view` | Open the calendar grid tab |
| `open-sessions-view` | Open the sessions view |
| `open-recently-viewed` | Open the recently-viewed panel |

---

## Inbox architecture

The plugin has **one** inbox — `src/inbox/InboxView` — a left sidebar panel registered as `TIME_MANAGER_INBOX_VIEW`. Do not build a second inbox.

`InboxService` is a **singleton** on `plugin.inboxService`. Never instantiate `new InboxService(app)` separately — reuse the singleton. Both `InboxView` and `DailyNoteEditorView.svelte` use `plugin.inboxService` directly.

**Frontmatter keys written by InboxService:**
- `inbox-snooze` — ISO timestamp; item is hidden until this time
- `inbox-added` — ISO timestamp; when the file was added to the inbox

These are user-facing frontmatter keys — do not rename them. They are distinct from CSS class names (which use `tm-inbox-*`).

**`readTaggedItems`** keys: `"path/to/file.md"` for file items, `"path/to/file.md:42"` for inline items. Pruned automatically on `saveSettings()`.

---

## AgendaView architecture

`AgendaView` is a right-sidebar panel that activates when a periodic note is focused. It contains:

1. **Period header** — granularity badge + human-readable period title
2. **Toolbar** — prev/next nav, create note, open-in-editor
3. **Work section** — Tasks | Targets toggle (see below)
4. **Calendar events** — ICS events for the period, grouped by day

### Tasks / Targets toggle

The work section has two tabs persisted to `agendaWorkSection` setting:

- **Tasks tab** — mounts `TasksPanel.svelte` (a Svelte component)
- **Targets tab** — renders `targetDate` frontmatter files via vanilla JS

**Critical:** `AgendaView.render()` calls `this._tasksPanel.$destroy()` before `contentEl.empty()`. If you add more Svelte components to AgendaView, destroy them the same way — failing to do so leaks component memory when the panel re-renders.

### `refresh()` vs `refreshImmediate()`

- `refresh()` — debounced 200ms; safe to call on high-frequency events like `metadataCache.changed`
- `refreshImmediate()` — synchronous; used for low-frequency vault create/delete events

### TaskService

`getTasksForPeriod(plugin, granularity, date)` returns `Map<TFile, TaskItem[]>`. Sources included:
1. All periodic notes (any enabled granularity) whose parsed date falls within the period
2. All notes with `targetDate` frontmatter pointing within the period

`toggleTask(plugin, item)` uses `vault.process` for atomic toggling — it is undo-safe.

---

## CalendarView architecture

`CalendarView` is a main editor tab (`getLeaf(true)`). It mounts `CalendarGrid.svelte` and persists state via `getState()` / `setState()`:

```ts
// State shape
{ viewType: "day" | "week" | "month" | "year" | "horizon", anchorDate: "YYYY-MM-DD" }
```

`CalendarGrid.svelte` exposes `getViewType()` and `getAnchorDate()` as exported functions so `CalendarView.getState()` can read them back.

The grid fetches events from `plugin.calendarService.getEventsForRange()` and checks note existence via `getPeriodicNote()` — both are synchronous/cached lookups appropriate for calling per-cell on every render.

When calendar sources change, `refreshCalendarViews()` in `main.ts` triggers a re-render by calling `grid.$set({ anchorDate: ... })`, which causes `CalendarGrid`'s reactive `fetchEvents` to re-fire.

### View modes

`CalendarGrid` supports five view modes, selected via the toolbar:

| Mode | Description |
|---|---|
| `"day"` | Hourly time grid; all-day target chips in header bar; timed chips at hour slots |
| `"week"` | 7-column layout; period-bar targets; per-day all-day chips; timed hour slots |
| `"month"` | 5–6 week rows × 7 day cells; period-bar targets; per-cell block chips |
| `"year"` | 4×3 mini-month grid; period-bar targets only |
| `"horizon"` | One band per enabled granularity stacked vertically; target chips per band |

### Side panels

Three toggleable left panels are mounted inside `CalendarGrid` (not in `CalendarView`):

| Panel | Toggle button | Component |
|---|---|---|
| Targets | Target icon | `TargetDatePanel.svelte` |
| Inbox | Inbox icon | `CalendarInboxPanel.svelte` |
| Chains | Chain icon | `CalendarChainsPanel.svelte` |

Only one panel can be open at a time — opening one closes the others.

### Target date chips

Target chips (`tm-cal-target-chip`) appear in every view mode. They are styled with neutral gray Obsidian variables (not orange) so that status icons stand out:

```css
background: var(--background-modifier-hover);
color: var(--text-muted);
border: 1px solid var(--background-modifier-border);
```

Each chip reads the file's `status` frontmatter field via `getFileStatus(tf)` and renders an inline SVG status icon (`tm-cal-target-chip-status`) to the left of the filename. The same status icon logic exists in `TargetDatePanel.svelte` for the left sidebar panel. Supported statuses and their icons:

| Status | Icon |
|---|---|
| `Backlog` | Dashed circle (gray `#A1A1A1`) |
| `Todo` | Plain ring (gray `#A1A1A1`) |
| `In Progress` | Half-filled circle (amber `#BD8E37`) |
| `Done` | Filled circle + checkmark (purple `#8E68F5`) |
| `Cancelled` | Filled circle + X (gray `#A1A1A1`) |

Files without a `status` frontmatter field show no icon. The SVG is injected via `{@html statusSvg(status)}` — content is hardcoded, not user-supplied, so `{@html}` is safe here.

### Right-click context menu

Right-clicking an empty calendar cell opens a `Menu` for creating a new note at that date/granularity, with optional template selection via `TemplateSuggestModal`. This is handled in `showNewNoteMenu()` in `CalendarGrid.svelte`.

### Double-click to drill down

Double-clicking an empty day cell in month view switches the grid to day view for that date.

---

## Template variables

`applyTemplateTransformations` in `src/utils/template.ts` handles `{{variable}}`, `{{variable:FORMAT}}`, and `{{variable±Nd:FORMAT}}` syntax for all granularities. The named variable per granularity:

| Granularity | Named variable |
|---|---|
| day | `{{date}}`, `{{yesterday}}`, `{{tomorrow}}`, `{{time}}` |
| week | `{{week}}`, `{{monday}}` … `{{sunday}}` |
| month | `{{month}}` |
| quarter | `{{quarter}}` |
| half-year | `{{half-year}}` |
| year | `{{year}}` |

All granularities also get `{{date:FORMAT}}` / `{{date±Nd:FORMAT}}` using the note's own date.

`getTemplateVariableReference(granularity)` returns a `string[][]` table of `[variable, description]` pairs, used in the settings tab to render the collapsible reference under each template path field.

---

## Mobile support

`Platform.isMobile` (from `"obsidian"`) is used in two places:

1. **`EditorToolbar.svelte`** — hides Sort/Filter/Properties/scroll-direction controls on mobile; shows a search icon + ⋯ overflow button instead. The ⋯ opens an Obsidian `Menu` with all the hidden options.
2. **`DailyNoteEditorView.svelte` `onMount`** — if `Platform.isMobile && scrollDirection === "horizontal"`, silently resets to vertical.

`body.is-mobile` CSS overrides live in `styles.css` §4. Use this selector (not `@media`) for mobile-specific layout — Obsidian sets it on the body element.

---

## Patterns to follow

**Adding a new periodic granularity:** Add to the `Granularity` union in `types.ts`, add a format to `constants.ts`, add a `DisplayConfig` entry in `types.ts`, add a settings section via `periodicNotePage` in `settings.ts`, add a merge line in `mergeSettings` in `main.ts`. Commands, discovery, and the editor toolbar pick up new granularities automatically from the `granularities` array.

**Adding a new editor time range:** Add the string to the `TimeRange` union in `editor/types.ts`, add a case in `FileManager.isDateInRange`, and add a menu item in `DailyNoteView.onOpen` in `view.ts`.

**Adding a new command:** Add it in the appropriate module (`commands.ts` for periodic, `switcher.ts` for switcher-style), not in `main.ts`. Wire the registration call from `main.ts` `onload()`.

**Adding a new view:** Register in `main.ts` `onload()`. Add its type string to the table above. Add an `open{ViewName}()` method to the plugin class following the existing pattern. If it takes a sidebar placement setting, add the setting and wire it through.

**Mounting a Svelte component inside an `ItemView`:** The component must be `$destroy()`'d in `onClose()` (and before any `contentEl.empty()` call during re-renders). Pattern:

```ts
private _component: MyComponent | null = null;

async onOpen() {
    this._component = new MyComponent({ target: this.contentEl, props: { ... } });
}

async onClose() {
    this._component?.$destroy();
    this._component = null;
}

private render() {
    this._component?.$destroy();  // ← before empty()
    this._component = null;
    this.contentEl.empty();
    // ... rebuild
    this._component = new MyComponent({ target: ..., props: ... });
}
```

**Svelte components:** Use Svelte 4. Keep component props typed with `export let`. Use `createEventDispatcher` for child → parent communication; keep all state mutations in the parent.

**Icon usage in Svelte:** Use `<Icon name="..." size={N} />` from `src/utils/Icon.svelte`. It wraps `setIcon()` so icons adapt to theme changes. Do not use inline `<svg>` elements for standard Lucide icons.

**Toggle usage in Svelte:** Use `<Toggle value={...} onChange={...} />` from `src/utils/Toggle.svelte`. It wraps Obsidian's `ToggleComponent`, so toggles match the native Obsidian style.

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

- **Hardcoding `["day", "week", "month"]`** — use `granularities` from `types.ts`
- **Forgetting `mergeSettings()`** — omitting the merge line silently discards saved values on upgrade
- **Registering a view or event listener outside of `onload`** — always use `this.register*`
- **Calling `fileManager.updateOptions()` directly from Svelte** — go through `DailyNoteView` methods
- **Using `localStorage`** — not supported in Obsidian; use `plugin.loadData()` / `saveData()`
- **Adding `overflow: hidden` to `.tm-breadcrumbs` or `.tm-breadcrumb-bar`** — clips the period-nav dropdown
- **Calling `plugin.calendarService.getEventsForDate()` without await** — it returns a `Promise`
- **`import type { Moment } from "obsidian"`** — `Moment` is not exported from the obsidian package. Use `import type { Moment } from "moment"` instead.
- **Instantiating `new InboxService(app)`** — use `plugin.inboxService` (singleton). Creating a second instance causes double-scanning and inconsistent state.
- **Using the old `inbox-` CSS prefix** — it was renamed to `tm-inbox-`. All inbox panel classes are now `tm-inbox-*`.
- **Forgetting to `$destroy()` Svelte components before `contentEl.empty()`** — leaks component event listeners and reactive subscriptions. Always destroy before clearing the DOM.
- **Renaming view type strings** — these are stored in saved workspace JSON. Renaming breaks workspace restore for existing users.
- **Using `setInterval` for the viewport fill loop** — the fill loop uses rAF (`startFillViewport` / `runFillLoop`). Do not replace it with a polling interval.
- **Half-year moment arithmetic** — `moment.add(1, "half-year")` does not work. Use `addHalfYears(date, 1)` from `half-year.ts`.
- **Calling `eventsForDay(day)` (or any helper that reads a reactive variable through a function body) inside a Svelte template** — Svelte 4 does NOT track reactive dependencies inside called function bodies when they appear in template markup (it only tracks direct variable references). The result is that the template never re-renders when the underlying data changes. Always inline the Map lookup directly: `eventsByDay.get(dayKey(day)) ?? []`. The same rule applies to `{@const}`, `{#each}`, and `{#if}` blocks.
- **`import ICAL from "ical.js"` — the correct ESM default import** — do not use `const ICAL = require("ical.js") as typeof import("ical.js")`. The CJS build exports the namespace directly; `typeof import("ical.js")` is the ESM types which have `export default`, making the cast wrong and all members missing. Use `import ICAL from "ical.js"` with `allowSyntheticDefaultImports: true`.
- **`CalendarView.onOpen` must guard against double-grid creation** — Obsidian sometimes calls `setState` before `onOpen` when restoring a saved workspace. If `setState`'s `else` branch creates the grid first, `onOpen` will overwrite `this.grid` with a new default-state instance, discarding the restored state. Always guard: `if (this.grid) return;` at the top of `onOpen`.
- **`CalendarService` caches raw ICS text, not pre-parsed events** — `parseICSInRange` must be called with the specific date range for each request so recurring events are correctly expanded for that range. Do not cache `CalendarEvent[]` arrays; cache the raw ICS string and re-call `parseICSInRange(raw, id, color, rangeStart, rangeEnd)` per fetch.
- **Timed calendar chips (hour-slot chips) must use `clearTimeSlot`, not `clearTargetDate`** — `clearTargetDate` removes the `targetDate` frontmatter entirely, which deletes the chip from all views. `clearTimeSlot` only removes `startTime`/`endTime`, converting the chip back to an all-day chip. The × button on `hourChips` must call `clearTimeSlot`.
- **Drag-and-drop in month view requires `e.preventDefault()` in `dragover`** — without it the browser never fires `drop`. All day-cell `dragover` handlers must call `e.preventDefault()` unconditionally (not gated on payload type), otherwise drops silently fail in month view but work in other views.
- **Do not use `{@html}` for user-supplied content** — it is only safe for hardcoded SVG strings (e.g., `statusSvg()`). Any content derived from file names, frontmatter values, or vault data must go through Svelte's template binding (`{value}`) to be escaped.

---

## Calendar (ICS) architecture

`CalendarService` (`src/calendar/calendar-service.ts`) fetches ICS sources, caches the **raw text** per source (15-min TTL), and calls `parseICSInRange` on each request:

```
CalendarGrid.svelte
  → plugin.calendarService.getEventsForRange(start, end)
    → getAllEventsForRange(start, end)
      → getEventsForSource(source, start, end)   ← catches per-source errors, returns [] on failure
        → fetchRaw(source)                        ← fetches URL or reads vault file; caches raw string
        → parseICSInRange(raw, id, color, start, end)  ← ical.js expansion; returns CalendarEvent[]
    → iterate days in [start, end], group by YYYY-MM-DD key
```

`parseICSInRange` in `src/calendar/ics-parser.ts` uses `ical.js` for full RFC 5545 support (RRULE expansion, VTIMEZONE, RECURRENCE-ID exceptions, EXDATE). It replaces the previous hand-rolled parser which had RRULE UNTIL and timezone bugs.

**`CalendarEvent` no longer has `rrule`, `exdates`, or `recurrenceId` fields** — all recurrence handling is done internally by `ical.js`. Events returned by `parseICSInRange` are already fully expanded individual occurrences.

---

## Editor view — initialisation and scroll architecture (hard-won lessons)

This section documents non-obvious behaviours. Read before touching `DailyNoteEditorView.svelte` or `view.ts`.

### The `$: if (fileManager) applySearchQuery(searchQuery)` trap

`DailyNoteEditorView.svelte` has a reactive statement that fires `applySearchQuery` whenever `fileManager` or `searchQuery` changes. **This fires the instant `fileManager` is assigned in `onMount`.** The guard in `applySearchQuery` checks `if (!query && !prevQuery) return` — if both the previous and current query are `""`, it returns early. This prevents the reactive fire from wiping the today-positioning set up in `onMount`. Do not remove this guard.

### `onMount` owns the initial file positioning

For `selectionMode === "daily" && scrollDirection === "vertical"`, `onMount` slices `fileManager.getFilteredFiles()` so that today's note is `renderedFiles[0]`:

```
futureFiles   = allFiles.slice(0, todayIdx).reverse()   // newer than today
renderedFiles = allFiles.slice(todayIdx, todayIdx + 11) // today + 10 look-ahead
filteredFiles = allFiles.slice(todayIdx + 11)           // older notes, loaded on scroll-down
```

### Obsidian's `setEphemeralState` overwrites scroll position on reload

`setEphemeralState` is called after `setState` and resets scroll position. Override it in `DailyNoteView` (`view.ts`): call `super.setEphemeralState(state)` then `window.requestAnimationFrame(() => this.view?.resetScrollToTop?.())`. The rAF delay ensures Obsidian's restore runs first.

`setEphemeralState` can fire **twice** on reload. `resetScrollToTop` re-suppresses prepend each time by setting `_prependEnabled = false` and `_wasScrolledDown = false`, then re-enables after two rAFs.

### Upward infinite scroll (`futureFiles` / `prependBatch`)

Do not use `IntersectionObserver` to trigger `prependBatch` — the topLoaderRef sentinel is always visible at `scrollTop = 0`. Trigger from `updateFocusFromScroll` with two guards:

1. `_prependEnabled` — false during mount and after programmatic scroll-to-top
2. `_wasScrolledDown` — true only after user scrolls ≥ 100px down

Always use `scrollEl.scrollTop` directly for compensation, not `getScrollContainer()`.

### `FileManager.fileCreate()` must be called eagerly after vault creates

After any `createPeriodicNote(...)` call, immediately call `fileManager.fileCreate(newFile)` to register it synchronously. The vault `"create"` event fires asynchronously and `scrollToFile` will fail with `idx === -1` if called before then.

### `getScrollContainer()` is unreliable for programmatic scrolls

For any code that needs to scroll to the top, set `scrollEl.scrollTop = 0` directly.
