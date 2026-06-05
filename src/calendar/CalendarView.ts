/**
 * CalendarView — main editor tab showing a month/week calendar grid.
 *
 * Displays daily note existence dots, ICS calendar event dots, and week
 * number links to weekly notes. Clicking a day opens or creates that
 * day's note directly.
 *
 * View type and anchor date are persisted via getState/setState so the
 * calendar remembers where you were when Obsidian restarts.
 */
import { ItemView, WorkspaceLeaf, moment } from "obsidian";
import type TimeManagerPlugin from "../main";
import CalendarGrid from "./CalendarGrid.svelte";

export const TIME_MANAGER_CALENDAR_VIEW = "obsidian-time-tools-calendar-view";

export class CalendarView extends ItemView {
	plugin: TimeManagerPlugin;
	grid: CalendarGrid | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TimeManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return TIME_MANAGER_CALENDAR_VIEW; }
	getDisplayText(): string { return "Calendar"; }
	getIcon(): string { return "calendar"; }

	async onOpen(): Promise<void> {
		this.grid = new CalendarGrid({
			target: this.contentEl,
			props: {
				plugin:          this.plugin,
				viewType:        "month",
				anchorDate:      moment().format("YYYY-MM-DD"),
			},
		});
	}

	async onClose(): Promise<void> {
		this.grid?.$destroy();
		this.grid = null;
	}

	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			viewType:   this.grid?.getViewType()  ?? "month",
			anchorDate: this.grid?.getAnchorDate() ?? moment().format("YYYY-MM-DD"),
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async setState(state: any, result: any): Promise<void> {
		await super.setState(state, result);
		const vt = (state?.viewType  as "month" | "week" | "day" | "year") ?? "month";
		const ad = (state?.anchorDate as string)          ?? moment().format("YYYY-MM-DD");
		if (this.grid) {
			this.grid.$set({ viewType: vt, anchorDate: ad });
		} else {
			// setState called before onOpen — create the grid now.
			this.grid = new CalendarGrid({
				target: this.contentEl,
				props: { plugin: this.plugin, viewType: vt, anchorDate: ad },
			});
		}
	}
}
