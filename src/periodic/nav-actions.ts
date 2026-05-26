/**
 * Periodic-note leaf navigation.
 *
 * When the active leaf contains a periodic note, injects three controls into
 * the leaf's view-actions bar:
 *   ←  previous period note
 *   [date label]  jump to any date via DatePickerModal
 *   →  next period note
 *
 * Controls are removed automatically when the active file changes to a
 * non-periodic note.
 */
import { setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type TimeManagerPlugin from "../main";
import { findInPeriodic, openPeriodicNote } from "./api";
import { displayConfigs } from "./types";
import { DatePickerModal } from "./DatePickerModal";

// Track the currently-injected buttons so we can remove them cleanly.
const state: {
	buttons: HTMLElement[];
	leaf: WorkspaceLeaf | null;
	filePath: string | null;
} = { buttons: [], leaf: null, filePath: null };

function removeInjected(): void {
	for (const el of state.buttons) el.remove();
	state.buttons = [];
	state.leaf = null;
	state.filePath = null;
}

function injectNavButtons(plugin: TimeManagerPlugin, leaf: WorkspaceLeaf, file: TFile): void {
	const meta = findInPeriodic(plugin, file.path);
	if (!meta) { removeInjected(); return; }

	// Already showing the right buttons for this file — nothing to do.
	if (state.leaf === leaf && state.filePath === file.path) return;

	// Remove stale buttons from a previous leaf/file.
	removeInjected();

	const actionsEl = leaf.view?.containerEl?.querySelector<HTMLElement>(".view-actions");
	if (!actionsEl) return;

	const { granularity, date } = meta;
	const cfg = displayConfigs[granularity];

	// ← Prev button
	const prev = makeIconButton(
		`Open previous ${cfg.periodicity} note`,
		"arrow-left",
		() => openPeriodicNote(plugin, granularity, date.clone().subtract(1, granularity)).catch(console.error)
	);

	// Date label — clicking opens the jump-to-date picker.
	const dateLbl = document.createElement("button");
	dateLbl.className = "clickable-icon view-action tm-nav-date-label";
	dateLbl.title = "Jump to date…";
	dateLbl.setAttribute("aria-label", "Jump to date…");
	dateLbl.createSpan({ text: file.basename });
	dateLbl.addEventListener("click", () => {
		new DatePickerModal(plugin.app, granularity, (picked) =>
			openPeriodicNote(plugin, granularity, picked).catch(console.error)
		).open();
	});

	// → Next button
	const next = makeIconButton(
		`Open next ${cfg.periodicity} note`,
		"arrow-right",
		() => openPeriodicNote(plugin, granularity, date.clone().add(1, granularity)).catch(console.error)
	);

	// Prepend so they sit at the left of the existing action icons.
	actionsEl.prepend(next, dateLbl, prev);
	state.buttons = [prev, dateLbl, next];
	state.leaf = leaf;
	state.filePath = file.path;
}

function makeIconButton(title: string, iconId: string, onClick: () => void): HTMLElement {
	const btn = document.createElement("button");
	btn.className = "clickable-icon view-action tm-nav-btn";
	btn.title = title;
	btn.setAttribute("aria-label", title);
	setIcon(btn, iconId);
	btn.addEventListener("click", onClick);
	return btn;
}

export function registerLeafNavActions(plugin: TimeManagerPlugin): void {
	const onLeafChange = () => {
		const leaf = plugin.app.workspace.activeLeaf;
		if (!leaf) { removeInjected(); return; }

		// Only inject into standard markdown leaves — not our own custom views.
		if (leaf.view?.getViewType() !== "markdown") { removeInjected(); return; }

		const file = (leaf.view as any).file as TFile | null;
		if (!file) { removeInjected(); return; }

		injectNavButtons(plugin, leaf, file);
	};

	plugin.registerEvent(plugin.app.workspace.on("active-leaf-change", onLeafChange));
	plugin.registerEvent(plugin.app.workspace.on("file-open", onLeafChange));
}
