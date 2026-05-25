import { Notice, TFile } from "obsidian";
import type TimeManagerPlugin from "../main";
import {
	createPeriodicNote,
	findInPeriodic,
	getPeriodicNote,
	openPeriodicNote,
} from "./api";
import { displayConfigs, type Granularity } from "./types";

/**
 * Register all periodic-note commands for the granularities currently enabled
 * in settings. Called once on load — settings changes reload the plugin via
 * the standard Obsidian flow (toggle off / on) if the user wants new commands
 * to appear immediately. We mention this in the settings tab description.
 */
export function registerPeriodicCommands(plugin: TimeManagerPlugin): void {
	const granularities: Granularity[] = ["day", "week", "month"];

	for (const granularity of granularities) {
		const config = displayConfigs[granularity];
		if (!plugin.settings[granularity].enabled) continue;

		plugin.addCommand({
			id: `open-${config.periodicity}-note`,
			name: config.labelOpenPresent,
			callback: () =>
				openPeriodicNote(plugin, granularity, window.moment()).catch((err) => {
					console.error(err);
					new Notice(`Time Manager: failed to open ${config.relativeUnit}'s note`);
				}),
		});

		plugin.addCommand({
			id: `open-next-${config.periodicity}-note`,
			name: `Open next ${config.periodicity} note`,
			checkCallback: (checking: boolean) => {
				const activeFile = plugin.app.workspace.getActiveFile();
				if (!activeFile) return false;
				const meta = findInPeriodic(plugin, activeFile.path);
				if (!meta || meta.granularity !== granularity) return false;
				if (!checking) {
					const next = meta.date.clone().add(1, granularity);
					openPeriodicNote(plugin, granularity, next).catch(console.error);
				}
				return true;
			},
		});

		plugin.addCommand({
			id: `open-prev-${config.periodicity}-note`,
			name: `Open previous ${config.periodicity} note`,
			checkCallback: (checking: boolean) => {
				const activeFile = plugin.app.workspace.getActiveFile();
				if (!activeFile) return false;
				const meta = findInPeriodic(plugin, activeFile.path);
				if (!meta || meta.granularity !== granularity) return false;
				if (!checking) {
					const prev = meta.date.clone().subtract(1, granularity);
					openPeriodicNote(plugin, granularity, prev).catch(console.error);
				}
				return true;
			},
		});
	}
}

export async function ensureTodaysDailyNote(
	plugin: TimeManagerPlugin
): Promise<TFile | null> {
	if (!plugin.settings.day.enabled) return null;
	const today = window.moment();
	const existing = getPeriodicNote(plugin, "day", today);
	if (existing) return existing;
	try {
		return await createPeriodicNote(plugin, "day", today);
	} catch (err) {
		console.error("Time Manager: ensureTodaysDailyNote failed", err);
		return null;
	}
}
