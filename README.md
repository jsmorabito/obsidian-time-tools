# Time Manager

A time-aware note-management plugin for Obsidian. Create and open daily, weekly, and monthly periodic notes, and review them together in a scrollable multi-note editor view.

This plugin started as a merge of two existing community plugins, with the goal of giving them a shared core and growing into a broader time-management toolkit:

- [**Periodic Notes**](https://github.com/liamcain/obsidian-periodic-notes) by Liam Cain — periodic note creation, configurable folders/formats/templates per period.
- [**Daily Notes Editor**](https://github.com/quorafind/Obsidian-Daily-Notes-Editor) by Boninall (Quorafind) — a scrolling, multi-note view that embeds real markdown editors per note.

Both originals are MIT-licensed. Their full notices live in [NOTICE.md](./NOTICE.md).

## Features in this release (0.1.0)

- Configure daily, weekly, and monthly periodic notes with per-period folder, date format, and template.
- Commands per enabled period:
  - Open today's daily note / this week's note / this month's note
  - Open next / previous note relative to the active one
- Ribbon icons for "Open today's daily note" and "Open multi-note editor".
- Multi-note editor view: scrollable list of daily notes with infinite-scroll loading; each row is a real Obsidian editor. Date-range filter (all / week / month / year / last-week / last-month / last-year). Sort by ctime, mtime, or name.
- Optional: hide frontmatter and/or backlinks inside the editor view.
- Optional: on startup, create today's daily note and open the editor view.
- Day-change detection (every 15 minutes) so the editor view refreshes when you cross midnight.

## Not in this release

See [docs/deferred-features.md](./docs/deferred-features.md) for the full list of features from the upstream plugins that are intentionally deferred — quarterly/yearly notes, calendar sets, folder/tag selection modes, custom date ranges, and more.

## Install

This plugin is not yet in the community catalog.

1. Clone or download into `<Vault>/.obsidian/plugins/obsidian-time-manager/`.
2. `npm install`
3. `npm run build`
4. Reload Obsidian → **Settings → Community plugins** → enable **Time Manager**.

## Development

- `npm run dev` — watch-mode build.
- `npm run build` — type-check + production build.
- `npm run lint` — ESLint.

## Credits and license

Time Manager itself is MIT-licensed (see `LICENSE`). It includes code adapted from:

- Periodic Notes © 2021 Liam Cain (MIT)
- Daily Notes Editor © 2022 Boninall / Quorafind (MIT)
- Hover Editor leaf-spawning helper © nothingislost (MIT) — via Daily Notes Editor

Their full license texts are reproduced in [NOTICE.md](./NOTICE.md).
