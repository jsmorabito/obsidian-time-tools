/* eslint-disable @typescript-eslint/no-floating-promises, @typescript-eslint/no-misused-promises, @typescript-eslint/no-unnecessary-type-assertion */
import "./obsidian-augmentations";
import { Plugin, TFile, WorkspaceLeaf, moment } from "obsidian";
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
import { openPeriodicNote } from "./periodic/api";
import { createPeriodicTriggerProvider } from "./periodic/trigger-provider";
import { createDateTriggerProvider } from "./nldates/trigger-provider";
import { TIME_MANAGER_EDITOR_VIEW, DailyNoteView } from "./editor/view";
import { registerFileMenuHandlers } from "./editor/file-menu";
import { installWorkspacePatches } from "./editor/workspace-patches";
import { TIME_MANAGER_TIMELINE_VIEW, TimelineView } from "./periodic/timeline-view";
import { registerQuickSwitchers } from "./periodic/switcher";
import { maybeMigrateFromDailyNotesCore } from "./periodic/migrate";
import { registerLeafNavActions } from "./periodic/nav-actions";
import { TIME_MANAGER_SESSIONS_VIEW, SessionsView } from "./sessions/view";
import { SessionManager } from "./sessions/session-manager";
import {
	VIEW_TYPE_RECENTLY_VIEWED,
	RecentlyViewedView,
} from "./recently-viewed/view";
import { CalendarService } from "./calendar/calendar-service";
import { TIME_MANAGER_AGENDA_VIEW, AgendaView } from "./calendar/AgendaView";
import { TIME_MANAGER_CALENDAR_VIEW, CalendarView } from "./calendar/CalendarView";
import { TIME_MANAGER_INBOX_VIEW, InboxView } from "./inbox/view";
import { registerInboxCommands, addInboxFileMenuItem } from "./inbox/commands";
import { InboxService } from "./editor/InboxService";
import { TargetDateService } from "./target-date/target-date-service";

export default class TimeManagerPlugin extends Plugin {
	settings!: TimeManagerSettings;
	sessionManager!: SessionManager;
	nlDates!: NLDatesModule;
	calendarService!: CalendarService;
	inboxService!: InboxService;
	targetDateService!: TargetDateService;
	dateSuggest!: DateSuggest;
	/** Tracks the objects plugin instance we last registered with, to avoid double-registering. */
	private _registeredWithObjects: unknown = null;
	private editorRibbon: HTMLElement | null = null;
	private dailyRibbon: HTMLElement | null = null;
	private inboxRibbon: HTMLElement | null = null;
	private lastCheckedDay = moment().format("YYYY-MM-DD");

	// PeriodicResolver implementation.
	getConfig(granularity: Granularity): PeriodicConfig {
		return this.settings[granularity];
	}

	async onload(): Promise<void> {
		await this.loadSettings();
		registerPeriodicIcons();

		// Inbox service — must be created before any view is mounted.
		this.inboxService = new InboxService(this.app);

		// Target date service.
		this.targetDateService = new TargetDateService(this.app);

		// Calendar service — must be created before any view is mounted.
		this.calendarService = new CalendarService(this);

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

		// Inbox panel.
		this.registerView(
			TIME_MANAGER_INBOX_VIEW,
			(leaf: WorkspaceLeaf) => new InboxView(leaf, this)
		);

		// Agenda panel.
		this.registerView(
			TIME_MANAGER_AGENDA_VIEW,
			(leaf: WorkspaceLeaf) => new AgendaView(leaf, this)
		);

		// Calendar view.
		this.registerView(
			TIME_MANAGER_CALENDAR_VIEW,
			(leaf: WorkspaceLeaf) => new CalendarView(leaf, this)
		);

		registerPeriodicCommands(this);
		registerQuickSwitchers(this);
		registerLeafNavActions(this);
		registerInboxCommands(this);

		// ── Natural Language Dates ──────────────────────────────────────────────
		this.nlDates = new NLDatesModule(this);
		registerNLDateCommands(this, this.nlDates);
		this.dateSuggest = new DateSuggest(this.app, this.nlDates);
		this.registerEditorSuggest(this.dateSuggest);
		if (this.settings.nlDates.uriHandlerEnabled) {
			this.registerObsidianProtocolHandler(
				"time-tools",
				(params) => void handleNLDateURI(this.nlDates, params)
			);
		}

		this.addCommand({
			id: "open-multi-note-editor",
			name: "Open timeline view",
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
			id: "open-calendar-view",
			name: "Open calendar",
			callback: () => void this.openCalendarView(),
		});

		this.addCommand({
			id: "open-agenda-view",
			name: "Open agenda panel",
			callback: () => void this.openAgendaView(),
		});

		this.addCommand({
			id: "open-sessions-view",
			name: "Open sessions view",
			callback: () => this.openSessionsView(),
		});

		this.addCommand({
			id: "open-recently-viewed",
			// eslint-disable-next-line obsidianmd/ui/sentence-case
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

		// File menu: inbox + periodic-note actions.
		addInboxFileMenuItem(this);

		// Refresh agenda views when any file's frontmatter changes (picks up
		// targetDate additions/removals without needing a full reload).
		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.refreshAgendaViews())
		);

		// File menu integrations — handled in editor/file-menu.ts.
		registerFileMenuHandlers(this);

		this.registerInterval(
			window.setInterval(this.checkDayChange.bind(this), 1000 * 60 * 15)
		);

		// Re-register with obsidian-objects whenever the workspace layout changes
		// (which fires when plugins are toggled). This handles the case where
		// objects is reloaded after time-tools has already run onLayoutReady.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => this._registerObjectsTrigger())
		);

		// Refresh the inbox view every minute so snoozed items reappear when their
		// inbox-snooze timestamp expires (InboxService filters them out until then).
		this.registerInterval(
			window.setInterval(() => this.refreshInboxView(), 1000 * 60)
		);

		this.app.workspace.onLayoutReady(() => { void (async () => {
			// Initialise the NL date parser now that moment's locale is ready.
			this.nlDates.initialize();

			// Offer to migrate from Daily Notes core plugin (once).
			await maybeMigrateFromDailyNotesCore(this);

			// Recover any session that was left open from a previous Obsidian run.
			await this.sessionManager.initialize();

			// Refresh inbox on startup so snoozed items that expired while closed reappear.
			this.refreshInboxView();

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

			// Refresh any calendar views that were restored from a previous session.
			// requestUrl (network) is not reliably available during workspace
			// restoration, so we defer the ICS fetch until the layout is ready.
			for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_CALENDAR_VIEW)) {
				(leaf.view as CalendarView).refreshGrid();
			}
		})(); });
	}

	private _registerObjectsTrigger(): void {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
		const objectsPlugin = (this.app as any).plugins?.plugins?.[
			"filtered-file-commands"
		];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		if (typeof objectsPlugin?.registerTriggerProvider !== "function") return;

		// Already registered with this exact instance — nothing to do.
		if (objectsPlugin === this._registeredWithObjects) return;
		this._registeredWithObjects = objectsPlugin;

		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		objectsPlugin.registerTriggerProvider(createPeriodicTriggerProvider(this));

		// Register NL date completions and disable the standalone EditorSuggest
		// so both don't compete for the same @ trigger character.
		// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
		objectsPlugin.registerTriggerProvider(createDateTriggerProvider(this.dateSuggest));
		this.dateSuggest.disable();

		console.debug("[time-tools] Registered trigger providers with obsidian-objects.");

		// Clean up when this plugin unloads so objects never holds dead references.
		this.register(() => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			objectsPlugin.unregisterTriggerProvider("obsidian-time-tools");
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
			objectsPlugin.unregisterTriggerProvider("obsidian-time-tools-dates");
		});
	}

	onunload(): void {
		document.body.classList.remove("tm-hide-frontmatter", "tm-hide-backlinks");
	}

	private configureRibbons() {
		this.dailyRibbon?.remove();
		this.editorRibbon?.remove();
		this.inboxRibbon?.remove();
		this.dailyRibbon  = null;
		this.editorRibbon = null;
		this.inboxRibbon  = null;

		if (this.settings.ribbonDaily && this.settings.day.enabled) {
			this.dailyRibbon = this.addRibbonIcon(
				"calendar-day",
				"Open today's daily note",
				() => { openPeriodicNote(this, "day", window.moment()).catch(console.error); }
			);
		}
		if (this.settings.ribbonEditor) {
			this.editorRibbon = this.addRibbonIcon(
				"calendar-range",
				"Open timeline view",
				() => this.openEditorView()
			);
		}
		if (this.settings.ribbonInbox) {
			this.inboxRibbon = this.addRibbonIcon(
				"inbox",
				"Open inbox",
				() => void this.openInboxView()
			);
		}
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

	/** Re-render any open views that display calendar events. */
	refreshCalendarViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_TIMELINE_VIEW)) {
			(leaf.view as TimelineView).refresh();
		}
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW)) {
			(leaf.view as DailyNoteView).refreshCalendar?.();
		}
		// Re-fetch events in any open calendar view.
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_CALENDAR_VIEW)) {
			// Trigger a reactive update by re-setting the anchorDate prop.
			const view = leaf.view as CalendarView;
			const state = view.getState();
			view.grid?.$set({ anchorDate: state.anchorDate as string });
		}
		this.refreshAgendaViews();
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
		const leaf = this.settings.timelineSide === "left"
			? workspace.getLeftLeaf(false)  ?? workspace.getLeaf(true)
			: workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_TIMELINE_VIEW });
		workspace.revealLeaf(leaf);
	}

	async openCalendarView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TIME_MANAGER_CALENDAR_VIEW);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			(existing[0].view as CalendarView).refreshGrid();
			return;
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_CALENDAR_VIEW });
		workspace.revealLeaf(leaf);
	}

	async openAgendaView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TIME_MANAGER_AGENDA_VIEW);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			(existing[0].view as AgendaView).refresh();
			return;
		}
		const leaf = this.settings.agendaSide === "left"
			? workspace.getLeftLeaf(false)  ?? workspace.getLeaf(true)
			: workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_AGENDA_VIEW });
		workspace.revealLeaf(leaf);
	}

	refreshAgendaViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_AGENDA_VIEW)) {
			(leaf.view as AgendaView).refresh();
		}
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

	async openInboxView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(TIME_MANAGER_INBOX_VIEW);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.settings.inboxSide === "right"
			? workspace.getRightLeaf(false) ?? workspace.getLeaf(true)
			: workspace.getLeftLeaf(false)  ?? workspace.getLeaf(true);
		await leaf.setViewState({ type: TIME_MANAGER_INBOX_VIEW, active: true });
		workspace.revealLeaf(leaf);
	}

	refreshInboxView(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_INBOX_VIEW)) {
			if (leaf.view instanceof InboxView) {
				leaf.view.render();
			}
		}
	}

	async loadSettings(): Promise<void> {
		const saved = (await this.loadData()) as Partial<TimeManagerSettings> | null;
		this.settings = mergeSettings(DEFAULT_SETTINGS, saved);
	}

	async saveSettings(): Promise<void> {
		// Prune read-tracking keys whose source file no longer exists in the vault.
		// This prevents unbounded growth as inbox items come and go over time.
		if (this.settings.readTaggedItems.length > 0) {
			this.settings.readTaggedItems = this.settings.readTaggedItems.filter((key) => {
				const filePath = key.split(":")[0];
				return !!this.app.vault.getAbstractFileByPath(filePath);
			});
		}
		await this.saveData(this.settings);
		this.applyBodyClasses();
		this.configureRibbons();
		// Push the updated enabled-granularities list into any open editor views
		// so their toolbars reflect the change without needing a reload.
		for (const leaf of this.app.workspace.getLeavesOfType(TIME_MANAGER_EDITOR_VIEW)) {
			const v = leaf.view as DailyNoteView;
			if (typeof v.refreshSettings === "function") v.refreshSettings();
		}
	}
}

function mergeSettings(
	defaults: TimeManagerSettings,
	saved: Partial<TimeManagerSettings> | null | undefined
): TimeManagerSettings {
	if (!saved) return JSON.parse(JSON.stringify(defaults)) as TimeManagerSettings;

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
		calendarSources:  saved.calendarSources  ?? defaults.calendarSources,
		inboxDisplay:     { ...defaults.inboxDisplay, ...(saved.inboxDisplay ?? {}) },
		inboxTags:        saved.inboxTags        ?? defaults.inboxTags,
		inboxExcludeTags: saved.inboxExcludeTags ?? defaults.inboxExcludeTags,
		readTaggedItems:      saved.readTaggedItems      ?? defaults.readTaggedItems,
		inboxAutoRemoveDone:  saved.inboxAutoRemoveDone  ?? defaults.inboxAutoRemoveDone,

		calendarInboxTags:        saved.calendarInboxTags        ?? defaults.calendarInboxTags,
		calendarInboxExcludeTags: saved.calendarInboxExcludeTags ?? defaults.calendarInboxExcludeTags,

		ribbonDaily:  saved.ribbonDaily  ?? defaults.ribbonDaily,
		ribbonEditor: saved.ribbonEditor ?? defaults.ribbonEditor,
		ribbonInbox:  saved.ribbonInbox  ?? defaults.ribbonInbox,

		timelineSide: saved.timelineSide ?? defaults.timelineSide,
		agendaSide:   saved.agendaSide   ?? defaults.agendaSide,
		inboxSide:    saved.inboxSide    ?? defaults.inboxSide,

		agendaWorkSection: (saved.agendaWorkSection ?? defaults.agendaWorkSection) as "tasks" | "targets",
		agendaTaskFilter:  (saved.agendaTaskFilter  ?? defaults.agendaTaskFilter)  as "all" | "open" | "done",
	};
}

// Re-export the TFile type so other modules don't have to import it just for
// the `PeriodicResolver` interface chain. (No-op at runtime.)
export type { TFile };
