// Ported from quorafind/Obsidian-Daily-Notes-Editor (MIT).
// MVP scope: daily mode only. Folder/tag mode, custom date range, and the
// "save preset" workflow are tracked in docs/deferred-features.md.
import {
	ItemView,
	Menu,
	Scope,
	TAbstractFile,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import type TimeManagerPlugin from "../main";
import DailyNoteEditorView from "./DailyNoteEditorView.svelte";
import type { TimeField, TimeRange } from "./types";

export const TIME_MANAGER_EDITOR_VIEW = "time-manager-editor-view";

export class DailyNoteView extends ItemView {
	view!: DailyNoteEditorView;
	plugin: TimeManagerPlugin;
	scope: Scope;

	selectedRange: TimeRange = "all";
	timeField: TimeField = "mtime";

	constructor(leaf: WorkspaceLeaf, plugin: TimeManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.scope = new Scope(plugin.app.scope);
	}

	getMode = () => "source";

	getViewType(): string {
		return TIME_MANAGER_EDITOR_VIEW;
	}

	getDisplayText(): string {
		return "Daily notes";
	}

	getIcon(): string {
		return "calendar-range";
	}

	private onFileCreate = (file: TAbstractFile) => {
		if (file instanceof TFile) this.view?.fileCreate(file);
	};

	private onFileDelete = (file: TAbstractFile) => {
		if (file instanceof TFile) this.view?.fileDelete(file);
	};

	setSelectedRange(range: TimeRange) {
		this.selectedRange = range;
		this.view?.$set({ selectedRange: range });
	}

	setTimeField(field: TimeField) {
		this.timeField = field;
		this.view?.$set({ timeField: field });
	}

	getState(): Record<string, unknown> {
		const state = super.getState();
		return {
			...state,
			timeField: this.timeField,
			selectedRange: this.selectedRange,
		};
	}

	async setState(state: unknown, result?: any): Promise<void> {
		await super.setState(state, result);
		if (state && typeof state === "object" && !this.view) {
			const cs = state as { timeField?: TimeField; selectedRange?: TimeRange };
			if (cs.timeField) this.timeField = cs.timeField;
			if (cs.selectedRange) this.selectedRange = cs.selectedRange;

			this.view = new DailyNoteEditorView({
				target: this.contentEl,
				props: {
					plugin: this.plugin,
					leaf: this.leaf,
					selectedRange: this.selectedRange,
					timeField: this.timeField,
				},
			});

			this.app.workspace.onLayoutReady(this.view.tick.bind(this));

			this.registerInterval(
				window.setInterval(() => this.view.check(), 1000 * 60 * 60)
			);
		}
	}

	async onOpen(): Promise<void> {
		this.scope.register(["Mod"], "f", () => {
			// No-op: prevent the global find handler from hijacking inside our view.
		});

		this.addAction("clock", "Select time field", (e) => {
			const menu = new Menu();
			const add = (title: string, field: TimeField) => {
				menu.addItem((item) => {
					item.setTitle(title);
					item.setChecked(this.timeField === field);
					item.onClick(() => this.setTimeField(field));
				});
			};
			add("Creation time", "ctime");
			add("Modification time", "mtime");
			add("Creation time (reverse)", "ctimeReverse");
			add("Modification time (reverse)", "mtimeReverse");
			add("Name (A–Z)", "name");
			add("Name (Z–A)", "nameReverse");
			menu.showAtMouseEvent(e);
		});

		this.addAction("calendar-range", "Select date range", (e) => {
			const menu = new Menu();
			const add = (title: string, range: TimeRange) => {
				menu.addItem((item) => {
					item.setTitle(title);
					item.setChecked(this.selectedRange === range);
					item.onClick(() => this.setSelectedRange(range));
				});
			};
			add("All notes", "all");
			add("This week", "week");
			add("This month", "month");
			add("This year", "year");
			add("Last week", "last-week");
			add("Last month", "last-month");
			add("Last year", "last-year");
			menu.showAtMouseEvent(e as MouseEvent);
		});

		this.addAction("refresh", "Refresh", () => {
			if (this.view) {
				this.view.check();
				this.view.tick();
				this.view.$set({ selectedRange: this.selectedRange });
			}
		});

		this.registerEvent(this.app.vault.on("create", this.onFileCreate));
		this.registerEvent(this.app.vault.on("delete", this.onFileDelete));
	}

	onPaneMenu(menu: Menu, source: "more-options" | "tab-header" | string): void {
		if (source === "tab-header" || source === "more-options") {
			menu.addItem((item) => {
				// @ts-ignore — unofficial pinned API
				item.setIcon(this.leaf.pinned ? "pin-off" : "pin");
				// @ts-ignore
				item.setTitle(this.leaf.pinned ? "Unpin" : "Pin");
				item.onClick(() => this.leaf.togglePinned());
			});
		}
	}

	public refreshForNewDay(): void {
		if (this.view) {
			this.view.check();
			this.view.tick();
			this.view.$set({ selectedRange: this.selectedRange });
		}
	}
}
