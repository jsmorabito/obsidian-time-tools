import "./obsidian-augmentations";
import { Menu, Plugin, TAbstractFile, TFile, WorkspaceLeaf, moment } from "obsidian";
import {
	DEFAULT_SETTINGS,
	TimeManagerSettings,
	TimeManagerSettingTab,
} from "./settings";
import { NLDatesModule } from "./nldates/module";
import { registerNLDateCommands } from "./nldates/commands";
import DateSuggest from "./nldates/suggest";
import { handleNLDateURI } from "./nldates/uri-handler";
import type { Granularity, PeriodicConfig } from "./periodic/types";
import { granularities } from "./periodic/types";
import { registerPeriodicIcons } from "./periodic/icons";
import {
	ensureTodaysDailyNote,
	registerPeriodicCommands,
} from "./periodic/commands";
import { findInPeriodic, openPeriodicNote } from "./periodic/api";
import { createPeriodicTriggerProvider } from "./periodic/trigger-provider";
import { TIME_MANAGER_EDITOR_VIEW, DailyNoteView } from "./editor/view";
import { installWorkspacePatches } from "./editor/workspace-patches";
import { TIME_MANAGER_TIMELINE_VIEW, TimelineView } from "./periodic/timeline-view";
import { registerQuickSwitchers } from "./periodic/switcher";
import { maybeMigrateFromDailyNotesCore } from "./periodic/migrate";
import { displayConfigs } from "./periodic/types";
import { registerLeafNavActions } from "./periodic/nav-actions";
import { TIME_MANAGER_SESSIONS_VIEW, SessionsView } from "./sessions/view";
import { SessionManager } from "./sessions/session-manager";
import {
	VIEW_TYPE_RECENTLY_VIEWED,
	RecentlyViewedView,
} from "./recently-viewed/view";

export default class TimeManagerPlugin extends Plugin {
	settings!: TimeManagerSettings;
	sessionManager!: SessionManager;
	nlDates!: NLDatesModule;
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

		// Recently Viewed panel.
		this.registerView(
			VIEW_TYPE_RECENTLY_VIEWED,
			(leaf: WorkspaceLeaf) => new RecentlyViewedView(leaf, this)
		);

		registerPeriodicCommands(this);
		registerQuickSwitchers(this);
		registerLeafNavActions(this);

		// ── Natural Language Dates ──────────────────────────────────────────────
		this.nlDates = new NLDatesModule(this);
		registerNLDateCommands(this, this.nlDates);
		this.registerEditorSuggest(new DateSuggest(this.app, this.nlDates));
		if (this.settings.nlDates.uriHandlerEnabled) {
			this.registerObsidianProtocolHandler(
				"time-tools",
				(params) => void handleNLDateURI(this.nlDates, params)
			);
		}

		this.addCommand({
			id: "open-multi-note-editor",
			name: "Open time note view",
			callback: () => this.openEditorView(),
		});

		this.addCommand({
			id: "open-new-time-note-view",
			name: "Open new time note view",
			callback: () => this.openNewEditorView(),
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

		this.addCommand({
			id: "open-recently-viewed",
			name: "Open Recently Viewed panel",
			callback: () => this.openRecentlyViewedPanel(),
		});

		// Track file-open events for the Recently Viewed panel.
		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file instanceof TFile) this.trackRecentFile(file);
			})
		);

		this.applyBodyClasses();
		this.configureRibbons();

		// File menu integrations — handles both file and folder items in a single handler.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile) {
					// ── Periodic-note file actions ──────────────────────────────
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
				} else {
					// ── Folder actions ──────────────────────────────────────────
					const folderPath = (file as TAbstractFile).path;

					menu.addItem((item) => {
						item.setTitle("Open notes in multi-note editor (this folder)");
						item.setIcon("calendar-range");
						item.onClick(async () => {
							const { workspace } = this.app;
							const leaf = workspace.getLeaf(true);
							await leaf.setViewState({ type: TIME_MANAGER_EDITOR_VIEW });
							workspace.revealLeaf(leaf);
							(leaf.view as DailyNoteView).setSelectionMode("folder", folderPath);
						});
					});
				}
			})
		);

		this.registerInterval(
			window.setInterval(this.checkDayChange.bind(this), 1000 * 60 * 15)
		);

		this.app.workspace.onLayoutReady(async () => {
			// Initialise the NL date parser now that moment's locale is ready.
			this.nlDates.initialize();

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

			// Register periodic notes into the obsidian-objects @ trigger menu
			// if that plugin is installed. Degrades silently if it isn't.
			this._registerObjectsTrigger();
		});
	}

	private _registerObjectsTrigger(): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const objectsPlugin = (this.app as any).plugins?.plugins?.[
			"filtered-file-commands"
		];
		if (typeof objectsPlugin?.registerTriggerProvider !== "function") return;

		const provider = createPeriodicTriggerProvider(this);
		objectsPlugin.registerTriggerProvider(provider);

		// Clean up when this plugin unloads so objects never holds a dead reference.
		this.register(() =>
			objectsPlugin.unregisterTriggerProvider("obsidian-time-tools")
		);
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_EDITOR_VIEW);
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_TIMELINE_VIEW);
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_SESSIONS_VIEW);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_RECENTLY_VIEWED);
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
			"Open time note view",
			() => this.openEditorView()
		);
	}

	private applyBodyClasses() {
		document.body.classList.toggle("tm-hide-frontmatter", this.settings.hideFrontmatter);
		document.body.classList.toggle("tm-hide-backlinks", this.settings.hideBacklinks);
	}

	async openRecentlyViewedPanel(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_RECENTLY_VIEWED);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = workspace.getLeftLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: VIEW_TYPE_RECENTLY_VIEWED, active: true });
		workspace.revealLeaf(leaf);
	}

	private trackRecentFile(file: TFile): void {
		const entry = {
			path: file.path,
			basename: file.basename,
			extension: file.extension,
			viewedAt: Date.now(),
		};
		// Remove any existing entry for this path, then prepend.
		this.settings.recentFiles = this.settings.recentFiles.filter(
			(f) => f.path !== file.path
		);
		this.settings.recentFiles.unshift(entry);
		// Trim to max.
		if (this.settings.recentFiles.length > this.settings.rvMaxItems) {
			this.settings.recentFiles = this.settings.recentFiles.slice(
				0,
				this.settings.rvMaxItems
			);
		}
		void this.saveSettings();
		this.refreshRecentlyViewedPanel();
	}

	refreshRecentlyViewedPanel(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_RECENTLY_VIEWED)) {
			(leaf.view as RecentlyViewedView).render();
		}
	}

	async openEditorView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW);
		const leaf = existing.length > 0 ? existing[0] : workspace.getLeaf(true);
		if (existing.length === 0) {
			await leaf.setViewState({ type: TIME_MANAGER_EDITOR_VIEW });
		}
		workspace.revealLeaf(leaf);
	}

	/** Always opens a brand-new time note view, even if one already exists. */
	async openNewEditorView(): Promise<void> {
		const { workspace } = this.app;
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_EDITOR_VIEW });
		workspace.revealLeaf(leaf);
	}

	/**
	 * Open (or reuse) the time-notes editor view and scroll it to the given file.
	 * Reuses an existing editor leaf if one is already open.
	 */
	async openEditorViewAndScrollTo(file: TFile, granularity: Granularity): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW);
		let leaf: WorkspaceLeaf;
		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: TIME_MANAGER_EDITOR_VIEW });
		}
		workspace.revealLeaf(leaf);
		const view = leaf.view as DailyNoteView;
		await view.scrollToFile(file, granularity);
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

	// Merge each granularity's PeriodicConfig so that new fields added to the
	// defaults are always present, even after upgrading from an older save file.
	// Iterating `granularities` ensures quarter/year (and any future additions)
	// are never accidentally dropped.
	const periodicMerge = Object.fromEntries(
		granularities.map((g) => [g, { ...defaults[g], ...(saved[g] ?? {}) }])
	) as Pick<TimeManagerSettings, typeof granularities[number]>;

	return {
		...defaults,
		...saved,
		...periodicMerge,
		presets:          saved.presets          ?? defaults.presets,
		sessionsFolder:   saved.sessionsFolder   ?? defaults.sessionsFolder,
		rvMaxItems:       saved.rvMaxItems       ?? defaults.rvMaxItems,
		rvShowTimestamp:  saved.rvShowTimestamp  ?? defaults.rvShowTimestamp,
		rvShowPath:       saved.rvShowPath       ?? defaults.rvShowPath,
		recentFiles:      saved.recentFiles      ?? defaults.recentFiles,
		nlDates:          { ...defaults.nlDates, ...(saved.nlDates ?? {}) },
	};
}

// Re-export the TFile type so other modules don't have to import it just for
// the `PeriodicResolver` interface chain. (No-op at runtime.)
export type { TFile };
