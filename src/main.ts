import "./obsidian-augmentations";
import { Plugin, TFile, WorkspaceLeaf, moment } from "obsidian";
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
import { openPeriodicNote } from "./periodic/api";
import { TIME_MANAGER_EDITOR_VIEW, DailyNoteView } from "./editor/view";
import { installWorkspacePatches } from "./editor/workspace-patches";

export default class TimeManagerPlugin extends Plugin {
	settings!: TimeManagerSettings;
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

		this.addSettingTab(new TimeManagerSettingTab(this.app, this));

		// Editor view + workspace patches must be installed before any leaf of
		// our view type can be created.
		installWorkspacePatches(this);
		this.registerView(
			TIME_MANAGER_EDITOR_VIEW,
			(leaf: WorkspaceLeaf) => new DailyNoteView(leaf, this)
		);

		registerPeriodicCommands(this);

		this.addCommand({
			id: "open-multi-note-editor",
			name: "Open multi-note editor",
			callback: () => this.openEditorView(),
		});

		this.applyBodyClasses();
		this.configureRibbons();

		this.registerInterval(
			window.setInterval(this.checkDayChange.bind(this), 1000 * 60 * 15)
		);

		if (this.settings.createAndOpenEditorOnStartup) {
			this.app.workspace.onLayoutReady(async () => {
				await ensureTodaysDailyNote(this);
				if (
					this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW).length > 0
				) {
					return;
				}
				await this.openEditorView();
			});
		}
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(TIME_MANAGER_EDITOR_VIEW);
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

	private async checkDayChange(): Promise<void> {
		const currentDay = moment().format("YYYY-MM-DD");
		if (currentDay === this.lastCheckedDay) return;
		this.lastCheckedDay = currentDay;

		if (this.settings.day.enabled) await ensureTodaysDailyNote(this);

		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW)) {
			(leaf.view as DailyNoteView).refreshForNewDay?.();
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
		day: { ...defaults.day, ...(saved.day ?? {}) },
		week: { ...defaults.week, ...(saved.week ?? {}) },
		month: { ...defaults.month, ...(saved.month ?? {}) },
	};
}

// Re-export the TFile type so other modules don't have to import it just for
// the `PeriodicResolver` interface chain. (No-op at runtime.)
export type { TFile };
