import { App, PluginSettingTab, Setting } from "obsidian";
import type TimeManagerPlugin from "./main";
import {
	DEFAULT_DAILY_NOTE_FORMAT,
	DEFAULT_MONTHLY_NOTE_FORMAT,
	DEFAULT_WEEKLY_NOTE_FORMAT,
} from "./periodic/constants";
import type { PeriodicConfig } from "./periodic/types";

export interface TimeManagerSettings {
	day: PeriodicConfig;
	week: PeriodicConfig;
	month: PeriodicConfig;

	// Editor view toggles, ported from Daily Notes Editor.
	hideFrontmatter: boolean;
	hideBacklinks: boolean;
	createAndOpenEditorOnStartup: boolean;
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
	hideFrontmatter: false,
	hideBacklinks: false,
	createAndOpenEditorOnStartup: false,
};

export class TimeManagerSettingTab extends PluginSettingTab {
	plugin: TimeManagerPlugin;

	constructor(app: App, plugin: TimeManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private renderPeriodSection(
		periodKey: "day" | "week" | "month",
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

		this.renderPeriodSection(
			"day",
			"Daily notes",
			"Moment.js format string, e.g. YYYY-MM-DD."
		);
		this.renderPeriodSection(
			"week",
			"Weekly notes",
			"Moment.js format string, e.g. gggg-[W]ww."
		);
		this.renderPeriodSection(
			"month",
			"Monthly notes",
			"Moment.js format string, e.g. YYYY-MM."
		);

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
	}
}
