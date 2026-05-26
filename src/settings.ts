import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type TimeManagerPlugin from "./main";
import {
	DEFAULT_DAILY_NOTE_FORMAT,
	DEFAULT_MONTHLY_NOTE_FORMAT,
	DEFAULT_QUARTERLY_NOTE_FORMAT,
	DEFAULT_WEEKLY_NOTE_FORMAT,
	DEFAULT_YEARLY_NOTE_FORMAT,
} from "./periodic/constants";
import type { Granularity, PeriodicConfig } from "./periodic/types";

// ── Preset ────────────────────────────────────────────────────────────────────

export type PresetSelectionMode = "daily" | "folder" | "tag";

export interface Preset {
	id: string;
	name: string;
	selectionMode: PresetSelectionMode;
	folderPath?: string;
	tag?: string;
	timeRange?: string;
}

// ── Settings shape ────────────────────────────────────────────────────────────

export interface TimeManagerSettings {
	day: PeriodicConfig;
	week: PeriodicConfig;
	month: PeriodicConfig;
	quarter: PeriodicConfig;
	year: PeriodicConfig;

	// Startup behaviour
	createAndOpenEditorOnStartup: boolean;
	/** If set, open this granularity's current note on layout-ready. */
	openNoteOnStartup: Granularity | null;

	// Editor view display toggles
	hideFrontmatter: boolean;
	hideBacklinks: boolean;

	// Presets (folder / tag mode)
	presets: Preset[];

	// Sessions
	sessionsFolder: string;

	// Migration: track whether we have already offered to import Daily Notes core settings.
	migratedFromDailyNotes: boolean;
}

export const DEFAULT_SETTINGS: TimeManagerSettings = {
	day: {
		enabled: true,
		format: DEFAULT_DAILY_NOTE_FORMAT,
		folder: "",
		templatePath: "",
	},
	week: {
		enabled: false,
		format: DEFAULT_WEEKLY_NOTE_FORMAT,
		folder: "",
		templatePath: "",
	},
	month: {
		enabled: false,
		format: DEFAULT_MONTHLY_NOTE_FORMAT,
		folder: "",
		templatePath: "",
	},
	quarter: {
		enabled: false,
		format: DEFAULT_QUARTERLY_NOTE_FORMAT,
		folder: "",
		templatePath: "",
	},
	year: {
		enabled: false,
		format: DEFAULT_YEARLY_NOTE_FORMAT,
		folder: "",
		templatePath: "",
	},
	createAndOpenEditorOnStartup: false,
	openNoteOnStartup: null,
	hideFrontmatter: false,
	hideBacklinks: false,
	presets: [],
	sessionsFolder: "Sessions",
	migratedFromDailyNotes: false,
};

// ── Settings tab ──────────────────────────────────────────────────────────────

export class TimeManagerSettingTab extends PluginSettingTab {
	plugin: TimeManagerPlugin;

	constructor(app: App, plugin: TimeManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private renderPeriodSection(
		periodKey: Granularity,
		title: string,
		formatHelp: string
	): void {
		const config = this.plugin.settings[periodKey];

		new Setting(this.containerEl).setName(title).setHeading();

		new Setting(this.containerEl)
			.setName(`Enable ${title.toLowerCase()}`)
			.setDesc(
				`Turn on to register ${title.toLowerCase()} commands. Reload the plugin after changing this to refresh the command palette.`
			)
			.addToggle((toggle) =>
				toggle.setValue(config.enabled).onChange(async (value) => {
					config.enabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(this.containerEl)
			.setName("Date format")
			.setDesc(formatHelp)
			.addText((text) =>
				text
					.setPlaceholder(config.format)
					.setValue(config.format)
					.onChange(async (value) => {
						config.format = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Folder")
			.setDesc(`Folder to store ${title.toLowerCase()}. Leave blank for vault root.`)
			.addText((text) =>
				text
					.setPlaceholder("Notes/Daily")
					.setValue(config.folder)
					.onChange(async (value) => {
						config.folder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(this.containerEl)
			.setName("Template file")
			.setDesc("Path to a markdown file used as a template for new notes.")
			.addText((text) =>
				text
					.setPlaceholder("Templates/Daily.md")
					.setValue(config.templatePath)
					.onChange(async (value) => {
						config.templatePath = value.trim();
						await this.plugin.saveSettings();
					})
			);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Periodic note sections ──────────────────────────────────────────
		this.renderPeriodSection("day",     "Daily notes",     "Moment.js format string, e.g. YYYY-MM-DD.");
		this.renderPeriodSection("week",    "Weekly notes",    "Moment.js format string, e.g. gggg-[W]ww.");
		this.renderPeriodSection("month",   "Monthly notes",   "Moment.js format string, e.g. YYYY-MM.");
		this.renderPeriodSection("quarter", "Quarterly notes", "Moment.js format string, e.g. YYYY-[Q]Q.");
		this.renderPeriodSection("year",    "Yearly notes",    "Moment.js format string, e.g. YYYY.");

		// ── Sessions ────────────────────────────────────────────────────────
		new Setting(containerEl).setName("Sessions").setHeading();

		new Setting(containerEl)
			.setName("Sessions folder")
			.setDesc("Folder where session notes are stored. Leave blank to use the vault root.")
			.addText((text) =>
				text
					.setPlaceholder("Sessions")
					.setValue(this.plugin.settings.sessionsFolder)
					.onChange(async (value) => {
						this.plugin.settings.sessionsFolder = value.trim();
						await this.plugin.saveSettings();
					})
			);

		// ── Multi-note editor view ──────────────────────────────────────────
		new Setting(containerEl).setName("Multi-note editor view").setHeading();

		new Setting(containerEl)
			.setName("Hide frontmatter")
			.setDesc("Hide frontmatter blocks inside notes rendered in the editor view.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideFrontmatter)
					.onChange(async (value) => {
						this.plugin.settings.hideFrontmatter = value;
						document.body.classList.toggle("tm-hide-frontmatter", value);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Hide backlinks")
			.setDesc("Hide backlink panes inside notes rendered in the editor view.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.hideBacklinks)
					.onChange(async (value) => {
						this.plugin.settings.hideBacklinks = value;
						document.body.classList.toggle("tm-hide-backlinks", value);
						await this.plugin.saveSettings();
					})
			);

		// ── Startup ─────────────────────────────────────────────────────────
		new Setting(containerEl).setName("Startup").setHeading();

		new Setting(containerEl)
			.setName("Open editor on startup")
			.setDesc(
				"On startup, create today's daily note if missing and open the multi-note editor."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createAndOpenEditorOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.createAndOpenEditorOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Open periodic note on startup")
			.setDesc(
				"Also open the current note for the chosen granularity when Obsidian loads. Requires that granularity to be enabled above."
			)
			.addDropdown((dd) => {
				dd.addOption("", "None");
				dd.addOption("day",     "Daily note");
				dd.addOption("week",    "Weekly note");
				dd.addOption("month",   "Monthly note");
				dd.addOption("quarter", "Quarterly note");
				dd.addOption("year",    "Yearly note");
				dd.setValue(this.plugin.settings.openNoteOnStartup ?? "");
				dd.onChange(async (value) => {
					this.plugin.settings.openNoteOnStartup = value ? (value as Granularity) : null;
					await this.plugin.saveSettings();
				});
			});

		// ── Presets ─────────────────────────────────────────────────────────
		new Setting(containerEl).setName("Editor presets").setHeading();

		new Setting(containerEl)
			.setName("Add preset")
			.setDesc(
				"Save a named selection (folder, tag, or daily) to quickly switch the editor view."
			)
			.addButton((btn) =>
				btn.setButtonText("Add preset").onClick(() => {
					new AddPresetModal(this.app, this.plugin, () => this.display()).open();
				})
			);

		for (const preset of this.plugin.settings.presets) {
			const desc =
				preset.selectionMode === "folder"
					? `Folder: ${preset.folderPath ?? ""}`
					: preset.selectionMode === "tag"
					? `Tag: ${preset.tag ?? ""}`
					: "Daily notes";

			new Setting(containerEl)
				.setName(preset.name)
				.setDesc(desc)
				.addButton((btn) =>
					btn
						.setButtonText("Delete")
						.setWarning()
						.onClick(async () => {
							this.plugin.settings.presets = this.plugin.settings.presets.filter(
								(p) => p.id !== preset.id
							);
							await this.plugin.saveSettings();
							this.display();
						})
				);
		}
	}
}

// ── Add-preset modal ──────────────────────────────────────────────────────────

export class AddPresetModal extends Modal {
	plugin: TimeManagerPlugin;
	onSave: () => void;

	name = "";
	selectionMode: PresetSelectionMode = "daily";
	folderPath = "";
	tag = "";

	constructor(app: App, plugin: TimeManagerPlugin, onSave: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSave = onSave;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: "Add editor preset" });

		new Setting(contentEl)
			.setName("Preset name")
			.addText((t) => t.setPlaceholder("My preset").onChange((v) => (this.name = v)));

		new Setting(contentEl).setName("Selection mode").addDropdown((dd) => {
			dd.addOption("daily",  "Daily notes");
			dd.addOption("folder", "Folder");
			dd.addOption("tag",    "Tag");
			dd.setValue(this.selectionMode);
			dd.onChange((v) => {
				this.selectionMode = v as PresetSelectionMode;
				this.onOpen();
			});
		});

		if (this.selectionMode === "folder") {
			new Setting(contentEl)
				.setName("Folder path")
				.addText((t) =>
					t.setPlaceholder("Notes/Work").onChange((v) => (this.folderPath = v))
				);
		}

		if (this.selectionMode === "tag") {
			new Setting(contentEl)
				.setName("Tag")
				.addText((t) =>
					t.setPlaceholder("project/work").onChange((v) => (this.tag = v))
				);
		}

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Save")
				.setCta()
				.onClick(async () => {
					if (!this.name.trim()) {
						new Notice("Please enter a preset name.");
						return;
					}
					const preset: Preset = {
						id: crypto.randomUUID(),
						name: this.name.trim(),
						selectionMode: this.selectionMode,
						folderPath:
							this.selectionMode === "folder" ? this.folderPath.trim() : undefined,
						tag: this.selectionMode === "tag" ? this.tag.trim() : undefined,
					};
					this.plugin.settings.presets.push(preset);
					await this.plugin.saveSettings();
					this.onSave();
					this.close();
				})
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
