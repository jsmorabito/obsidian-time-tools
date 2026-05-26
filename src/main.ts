import "./obsidian-augmentations";
import { Menu, Plugin, TAbstractFile, TFile, WorkspaceLeaf, moment } from "obsidian";
import {
	DEFAULT_SETTINGS,
	TimeManagerSettings,
	TimeManagerSettingTab,
} from "./settings";
import type { Granularity, PeriodicConfig } from "./periodic/types";
import { registerPeriodicIcons } from "./periodic/icons";
import {
	ensureTodaysDailyNote,
	registerPeriodicCommands,
} from "./periodic/commands";
import { findInPeriodic, openPeriodicNote } from "./periodic/api";
import { TIME_MANAGER_EDITOR_VIEW, DailyNoteView } from "./editor/view";
import { installWorkspacePatches } from "./editor/workspace-patches";
import { TIME_MANAGER_TIMELINE_VIEW, TimelineView } from "./periodic/timeline-view";
import { registerQuickSwitchers } from "./periodic/switcher";
import { maybeMigrateFromDailyNotesCore } from "./periodic/migrate";
import { displayConfigs } from "./periodic/types";
import { registerLeafNavActions } from "./periodic/nav-actions";
import { TIME_MANAGER_SESSIONS_VIEW, SessionsView } from "./sessions/view";
import { SessionManager } from "./sessions/session-manager";

export default class TimeManagerPlugin extends Plugin {
	settings!: TimeManagerSettings;
	sessionManager!: SessionManager;
	private editorRibbon: HTMLElement | null = null;
	private dailyRibbon: HTMLElement | null = null;
	private lastCheckedDay = moment().format("YYYY-MM-DD");

	// PeriodicResolver implementation.
	getConfig(granularity: Granularity): PeriodicConfig {
		return this.settings[granularity];
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		registerPeriodicIcons();

		// Sessions — manager must be created before any view is mounted.
		this.sessionManager = new SessionManager(this);

		this.addSettingTab(new TimeManagerSettingTab(this.app, this));

		// Editor view + workspace patches must be installed before any leaf of
		// our view type can be created.
		installWorkspacePatches(this);
		this.registerView(
			TIME_MANAGER_EDITOR_VIEW,
			(leaf: WorkspaceLeaf) => new DailyNoteView(leaf, this)
		);

		// Timeline sidebar view.
		this.registerView(
			TIME_MANAGER_TIMELINE_VIEW,
			(leaf: WorkspaceLeaf) => new TimelineView(leaf, this)
		);

		// Sessions view.
		this.registerView(
			TIME_MANAGER_SESSIONS_VIEW,
			(leaf: WorkspaceLeaf) => new SessionsView(leaf, this)
		);

		registerPeriodicCommands(this);
		registerQuickSwitchers(this);
		registerLeafNavActions(this);

		this.addCommand({
			id: "open-multi-note-editor",
			name: "Open multi-note editor",
			callback: () => this.openEditorView(),
		});

		this.addCommand({
			id: "open-timeline-sidebar",
			name: "Open timeline sidebar",
			callback: () => this.openTimelineView(),
		});

		this.addCommand({
			id: "open-sessions-view",
			name: "Open sessions view",
			callback: () => this.openSessionsView(),
		});

		this.applyBodyClasses();
		this.configureRibbons();

		// File menu integrations.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFile)) return;
				const meta = findInPeriodic(this, file.path);
				if (!meta) return;

				const { granularity, date } = meta;
				const cfg = displayConfigs[granularity];
				const periodLabel = cfg.periodicity;

				menu.addSeparator();

				menu.addItem((item) => {
					item.setTitle(`Open previous ${periodLabel} note`);
					item.setIcon("arrow-left");
					item.onClick(() => {
						openPeriodicNote(this, granularity, date.clone().subtract(1, granularity)).catch(
							console.error
						);
					});
				});

				menu.addItem((item) => {
					item.setTitle(`Open next ${periodLabel} note`);
					item.setIcon("arrow-right");
					item.onClick(() => {
						openPeriodicNote(this, granularity, date.clone().add(1, granularity)).catch(
							console.error
						);
					});
				});

				menu.addItem((item) => {
					item.setTitle("Show in timeline sidebar");
					item.setIcon("calendar-range");
					item.onClick(() => this.openTimelineView());
				});
			})
		);

		// "Open daily notes for this folder" — folder context menu.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) return; // only folders
				const folderPath = (file as TAbstractFile).path;

				menu.addItem((item) => {
					item.setTitle("Open notes in multi-note editor (this folder)");
					item.setIcon("calendar-range");
					item.onClick(async () => {
						const { workspace } = this.app;
						const existing = workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW);
						const leaf =
							existing.length > 0 ? existing[0] : workspace.getLeaf(true);
						if (existing.length === 0) {
							await leaf.setViewState({ type: TIME_MANAGER_EDITOR_VIEW });
						}
						workspace.revealLeaf(leaf);
						const view = leaf.view as DailyNoteView;
						view.setSelectionMode("folder", folderPath);
					});
				});
			})
		);

		this.registerInterval(
			window.setInterval(this.checkDayChange.bind(this), 1000 * 60 * 15)
		);

		this.app.workspace.onLayoutReady(async () => {
			// Offer to migrate from Daily Notes core plugin (once).
			await maybeMigrateFromDailyNotesCore(this);

			// Recover any session that was left open from a previous Obsidian run.
			await this.sessionManager.initialize();

			// Auto-open editor view.
			if (this.settings.createAndOpenEditorOnStartup) {
				await ensureTodaysDailyNote(this);
				if (this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW).length === 0) {
					await this.openEditorView();
				}
			}

			// Auto-open specific periodic note.
			const g = this.settings.openNoteOnStartup;
			if (g && this.settings[g].enabled) {
				await openPeriodicNote(this, g, moment()).catch(console.error);
			}
		});
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_EDITOR_VIEW);
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_TIMELINE_VIEW);
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_SESSIONS_VIEW);
		document.body.classList.remove("tm-hide-frontmatter", "tm-hide-backlinks");
	}

	private configureRibbons() {
		this.dailyRibbon?.remove();
		this.editorRibbon?.remove();

		if (this.settings.day.enabled) {
			this.dailyRibbon = this.addRibbonIcon(
				"calendar-day",
				"Open today's daily note",
				() => {
					openPeriodicNote(this, "day", window.moment()).catch(console.error);
				}
			);
		}
		this.editorRibbon = this.addRibbonIcon(
			"calendar-range",
			"Open multi-note editor",
			() => this.openEditorView()
		);
	}

	private applyBodyClasses() {
		document.body.classList.toggle("tm-hide-frontmatter", this.settings.hideFrontmatter);
		document.body.classList.toggle("tm-hide-backlinks", this.settings.hideBacklinks);
	}

	async openEditorView(): Promise<void> {
		const { workspace } = this.app;
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_EDITOR_VIEW });
		workspace.revealLeaf(leaf);
	}

	async openTimelineView(): Promise<void> {
		const { workspace } = this.app;
		// Prefer the right sidebar for the timeline.
		const leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_TIMELINE_VIEW });
		workspace.revealLeaf(leaf);
	}

	async openSessionsView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TIME_MANAGER_SESSIONS_VIEW);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_SESSIONS_VIEW });
		workspace.revealLeaf(leaf);
	}

	private async checkDayChange(): Promise<void> {
		const currentDay = moment().format("YYYY-MM-DD");
		if (currentDay === this.lastCheckedDay) return;
		this.lastCheckedDay = currentDay;

		if (this.settings.day.enabled) await ensureTodaysDailyNote(this);

		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW)) {
			(leaf.view as DailyNoteView).refreshForNewDay?.();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_TIMELINE_VIEW)) {
			(leaf.view as TimelineView).refresh?.();
		}
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<TimeManagerSettings> | null;
		this.settings = mergeSettings(DEFAULT_SETTINGS, saved);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.applyBodyClasses();
		this.configureRibbons();
		// Push the updated enabled-granularities list into any open editor views
		// so their toolbars reflect the change without needing a reload.
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW)) {
			(leaf.view as DailyNoteView).refreshSettings();
		}
	}
}

function mergeSettings(
	defaults: TimeManagerSettings,
	saved: Partial<TimeManagerSettings> | null | undefined
): TimeManagerSettings {
	if (!saved) return JSON.parse(JSON.stringify(defaults));
	return {
		...defaults,
		...saved,
		day:     { ...defaults.day,     ...(saved.day     ?? {}) },
		week:    { ...defaults.week,    ...(saved.week    ?? {}) },
		month:   { ...defaults.month,   ...(saved.month   ?? {}) },
		quarter: { ...defaults.quarter, ...(saved.quarter ?? {}) },
		year:    { ...defaults.year,    ...(saved.year    ?? {}) },
		presets:        saved.presets        ?? defaults.presets,
		sessionsFolder: saved.sessionsFolder ?? defaults.sessionsFolder,
	};
}

// Re-export the TFile type so other modules don't have to import it just for
// the `PeriodicResolver` interface chain. (No-op at runtime.)
export type { TFile };
