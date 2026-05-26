<script lang="ts">
	// Ported from quorafind/Obsidian-Daily-Notes-Editor (MIT).
	import type TimeManagerPlugin from "../main";
	import type { WorkspaceLeaf } from "obsidian";
	import { TFile, moment } from "obsidian";
	import DailyNote from "./DailyNote.svelte";
	import { inview } from "svelte-inview";
	import type { CustomRange, SelectionMode, TimeField, TimeRange } from "./types";
	import type { Granularity } from "../periodic/types";
	import { granularities, displayConfigs } from "../periodic/types";
	import { onMount } from "svelte";
	import { FileManager, type FileManagerOptions } from "./file-manager";

	export let plugin: TimeManagerPlugin;
	export let leaf: WorkspaceLeaf;
	export let selectedRange: TimeRange = "all";
	export let timeField: TimeField = "mtime";
	export let granularity: Granularity = "day";
	export let selectionMode: SelectionMode = "daily";
	export let folderPath = "";
	export let tag = "";
	export let customRange: CustomRange | undefined = undefined;

	const size = 1;
	let intervalId: number | undefined;

	let renderedFiles: TFile[] = [];
	let filteredFiles: TFile[] = [];
	let visibleNotes: Set<string> = new Set();
	let totalFileCount = 0;
	let dropdownOpen = false;

	function clickOutside(node: HTMLElement) {
		const handle = (e: MouseEvent) => {
			if (!node.contains(e.target as Node)) dropdownOpen = false;
		};
		document.addEventListener("click", handle, true);
		return { destroy() { document.removeEventListener("click", handle, true); } };
	}

	let hasMore = true;
	let firstLoaded = true;
	let loaderRef: HTMLDivElement;
	let scrollEl: HTMLDivElement;

	let fileManager: FileManager;

	$: fileManagerOptions = {
		resolver: plugin,
		app: plugin.app,
		timeRange: selectedRange,
		timeField,
		granularity,
		selectionMode,
		folderPath,
		tag,
		customRange,
	} as FileManagerOptions;

	$: if (
		fileManager &&
		(selectedRange !== fileManager.options.timeRange ||
			timeField !== fileManager.options.timeField ||
			granularity !== fileManager.options.granularity ||
			selectionMode !== fileManager.options.selectionMode ||
			folderPath !== fileManager.options.folderPath ||
			tag !== fileManager.options.tag)
	) {
		fileManager.updateOptions({
			timeRange: selectedRange,
			timeField,
			granularity,
			selectionMode,
			folderPath,
			tag,
			customRange,
		});
		renderedFiles = [];
		visibleNotes.clear();
		filteredFiles = fileManager.getFilteredFiles();
		totalFileCount = filteredFiles.length;
		hasMore = filteredFiles.length > 0;
		firstLoaded = true;
		startFillViewport();
		updateTitleElement();
	}

	onMount(() => {
		fileManager = new FileManager(fileManagerOptions);
		filteredFiles = fileManager.getFilteredFiles();
		totalFileCount = filteredFiles.length;
		hasMore = filteredFiles.length > 0;
		startFillViewport();
		updateTitleElement();
	});

	function handleGranularityChange(g: Granularity) {
		granularity = g;
		selectionMode = "daily";
		// Notify the parent ItemView so it can persist state across sessions.
		// @ts-ignore — DailyNoteView exposes setGranularity
		if (leaf?.view?.setGranularity) leaf.view.setGranularity(g);
	}

	function updateTitleElement() {
		if (!leaf || !leaf.view || !leaf.view.titleEl) return;
		const titleEl = leaf.view.titleEl;
		titleEl.empty();
		let title: string;
		if (selectionMode === "folder") {
			title = `Folder: ${folderPath || "…"}`;
		} else if (selectionMode === "tag") {
			title = `Tag: ${tag || "…"}`;
		} else {
			const label = displayConfigs[granularity].periodicity;
			const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
			const rangeText = selectedRange !== "all" ? ` · ${selectedRange}` : "";
			title = `${capitalised} notes${rangeText}`;
		}
		titleEl.setText(title);
	}

	function startFillViewport() {
		if (!intervalId) {
			intervalId = window.setInterval(infiniteHandler, 1);
		}
	}

	function stopFillViewport() {
		if (intervalId) window.clearInterval(intervalId);
		intervalId = undefined;
	}

	function infiniteHandler() {
		if (leaf.height === 0) return;
		if (!fileManager || !hasMore) return;
		if (filteredFiles.length === 0) {
			hasMore = false;
		} else {
			renderedFiles = [...renderedFiles, ...filteredFiles.splice(0, size)];
			if (firstLoaded) {
				window.setTimeout(() => {
					ensureViewFilled();
					firstLoaded = false;
				}, 100);
			}
		}
	}

	function ensureViewFilled() {
		if (!loaderRef) return;
		const loaderRect = loaderRef.getBoundingClientRect();
		const viewportHeight = window.innerHeight;
		const contentHeight = (scrollEl ?? leaf.view.contentEl).clientHeight || viewportHeight;
		const effectiveHeight = Math.max(viewportHeight, contentHeight) + 200;

		if (loaderRect.top < effectiveHeight) {
			infiniteHandler();
			window.setTimeout(() => {
				if (
					hasMore &&
					loaderRef &&
					loaderRef.getBoundingClientRect().top < effectiveHeight
				) {
					ensureViewFilled();
				}
			}, 50);
		}
	}

	async function createNewDailyNote() {
		const newNote = await fileManager.createNewDailyNote();
		if (newNote) {
			renderedFiles = [newNote, ...renderedFiles];
			visibleNotes.add(newNote.path);
			visibleNotes = visibleNotes;
		}
	}

	export function tick() {
		check();
		renderedFiles = renderedFiles;
	}

	export function check() {
		if (!fileManager) return;
		const hadDailyNote = fileManager.hasCurrentDayNote();
		fileManager.checkCurrentPeriodNote();
		const hasDailyNote = fileManager.hasCurrentDayNote();

		if (hadDailyNote !== hasDailyNote || selectedRange !== "all") {
			filteredFiles = fileManager.getFilteredFiles();
			totalFileCount = filteredFiles.length;
			renderedFiles = [];
			visibleNotes.clear();
			hasMore = filteredFiles.length > 0;
			firstLoaded = true;
			startFillViewport();
		}
	}

	export function fileCreate(file: TFile) {
		fileManager.fileCreate(file);
		const updated = fileManager.getFilteredFiles();
		if (
			updated.some((f) => f.basename === file.basename) &&
			!renderedFiles.some((f) => f.basename === file.basename)
		) {
			renderedFiles = [file, ...renderedFiles];
			visibleNotes.add(file.path);
			visibleNotes = visibleNotes;
		}
	}

	export function fileDelete(file: TFile) {
		fileManager.fileDelete(file);
		renderedFiles = renderedFiles.filter((n) => n.basename !== file.basename);
		if (visibleNotes.has(file.path)) {
			visibleNotes.delete(file.path);
			visibleNotes = visibleNotes;
		}
	}

	function handleNoteVisibilityChange(file: TFile, isVisible: boolean) {
		if (isVisible) visibleNotes.add(file.path);
		else visibleNotes.delete(file.path);
		visibleNotes = visibleNotes;
	}

	// Determine which granularity tabs to show (only enabled ones + daily always shown).
	// This is a prop so DailyNoteView can push a fresh list whenever settings are saved.
	export let enabledGranularities: Granularity[] = granularities.filter(
		(g) => g === "day" || plugin.settings[g].enabled
	);

	// Show the "create note" prompt only in daily mode and when appropriate.
	$: showCreatePrompt =
		selectionMode === "daily" &&
		!fileManager?.hasCurrentDayNote() &&
		(selectedRange === "all" ||
			selectedRange === "week" ||
			selectedRange === "month" ||
			selectedRange === "quarter" ||
			selectedRange === "year");
</script>

<div class="tm-shell">
	<div class="tm-toolbar" role="toolbar" aria-label="Note view controls">
		{#if selectionMode === "daily"}
			<div class="tm-switcher-wrap" use:clickOutside>
				<button
					class="tm-switcher-btn"
					class:tm-switcher-btn--open={dropdownOpen}
					on:click|stopPropagation={() => (dropdownOpen = !dropdownOpen)}
					aria-haspopup="listbox"
					aria-expanded={dropdownOpen}
				>
					<svg class="tm-switcher-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
						<rect x="2" y="2" width="5" height="5" rx="1"/>
						<rect x="9" y="2" width="5" height="5" rx="1"/>
						<rect x="2" y="9" width="5" height="5" rx="1"/>
						<rect x="9" y="9" width="5" height="5" rx="1"/>
					</svg>
					<span class="tm-switcher-label">
						{displayConfigs[granularity].periodicity.charAt(0).toUpperCase() +
							displayConfigs[granularity].periodicity.slice(1)}
					</span>
					<svg class="tm-switcher-chevron" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M4 6l4 4 4-4"/>
					</svg>
				</button>
				{#if dropdownOpen}
					<div class="tm-switcher-dropdown" role="listbox">
						{#each enabledGranularities as g}
							<button
								class="tm-switcher-option"
								class:tm-switcher-option--active={granularity === g}
								role="option"
								aria-selected={granularity === g}
								on:click={() => { handleGranularityChange(g); dropdownOpen = false; }}
							>
								{#if granularity === g}
									<svg class="tm-option-check" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
										<path d="M3 8l4 4 6-7"/>
									</svg>
								{:else}
									<span class="tm-option-check-spacer"></span>
								{/if}
								{displayConfigs[g].periodicity.charAt(0).toUpperCase() +
									displayConfigs[g].periodicity.slice(1)}
							</button>
						{/each}
					</div>
				{/if}
			</div>
			<span class="tm-result-count">
				{totalFileCount}
				{totalFileCount === 1 ? "result" : "results"}
			</span>
		{:else}
			<span class="tm-toolbar-mode-label">
				{selectionMode === "folder"
					? `📁 ${folderPath || "folder"}`
					: `🏷 ${tag || "tag"}`}
			</span>
			<button
				class="tm-toolbar-btn tm-toolbar-btn--secondary"
				on:click={() => {
					selectionMode = "daily";
					// @ts-ignore
					if (leaf?.view?.setSelectionMode) leaf.view.setSelectionMode("daily");
				}}
			>
				← Back to daily
			</button>
		{/if}
	</div>
	<div class="tm-note-view" bind:this={scrollEl}>
		{#if renderedFiles.length === 0}
			<div class="tm-stock">
				<div class="tm-stock-text">No files found</div>
			</div>
		{/if}
		{#if showCreatePrompt}
			<div class="tm-blank-day" on:click={createNewDailyNote} aria-hidden="true">
				<div class="tm-blank-day-text">
					{displayConfigs[granularity].labelOpenPresent.replace("Open", "Create")}
				</div>
			</div>
		{/if}
		{#each renderedFiles as file (file.path)}
			<div
				class="tm-note-wrapper"
				use:inview={{
					rootMargin: "80%",
					unobserveOnEnter: false,
					root: scrollEl,
				}}
				on:inview_change={({ detail }) =>
					handleNoteVisibilityChange(file, detail.inView)}
			>
				<DailyNote {file} {plugin} {leaf} shouldRender={visibleNotes.has(file.path)} />
			</div>
		{/each}
		<div
			bind:this={loaderRef}
			class="tm-view-loader"
			use:inview={{ root: scrollEl }}
			on:inview_init={startFillViewport}
			on:inview_change={infiniteHandler}
			on:inview_leave={stopFillViewport}
		/>
		{#if !hasMore}
			<div class="tm-no-more">— No more results —</div>
		{/if}
	</div>
</div>

<style>
	.tm-shell {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	.tm-toolbar {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px 8px;
		background-color: var(--background-primary);
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tm-toolbar-mode-label {
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		margin-right: 4px;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tm-note-view {
		flex: 1;
		overflow-y: auto;
	}

	/* Legacy btn styles — still used by the folder/tag "back" button */
	.tm-toolbar-btn {
		all: unset;
		cursor: pointer;
		padding: 3px 12px;
		border-radius: var(--radius-s);
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		transition: background-color 80ms ease, color 80ms ease;
	}

	.tm-toolbar-btn:hover {
		background-color: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.tm-toolbar-btn--secondary {
		color: var(--text-muted);
		font-size: var(--font-ui-smaller);
	}

	/* Bases-style switcher chip */
	.tm-switcher-wrap {
		position: relative;
	}

	.tm-switcher-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: var(--radius-s);
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		cursor: pointer;
		transition: background-color 80ms ease, color 80ms ease;
		user-select: none;
	}

	.tm-switcher-btn:hover,
	.tm-switcher-btn--open {
		background-color: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.tm-switcher-icon {
		flex-shrink: 0;
		opacity: 0.7;
	}

	.tm-switcher-label {
		font-weight: 500;
	}

	.tm-switcher-chevron {
		flex-shrink: 0;
		opacity: 0.6;
		transition: transform 120ms ease;
	}

	.tm-switcher-btn--open .tm-switcher-chevron {
		transform: rotate(180deg);
	}

	.tm-result-count {
		font-size: var(--font-ui-small);
		color: var(--text-faint);
		padding: 0 4px;
	}

	.tm-switcher-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: var(--layer-menu);
		min-width: 140px;
		background-color: var(--background-primary);
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-m);
		box-shadow: var(--shadow-l);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.tm-switcher-option {
		all: unset;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 5px 10px;
		border-radius: var(--radius-s);
		font-size: var(--font-ui-small);
		color: var(--text-normal);
		cursor: pointer;
		transition: background-color 60ms ease;
	}

	.tm-switcher-option:hover {
		background-color: var(--background-modifier-hover);
	}

	.tm-switcher-option--active {
		color: var(--text-accent);
	}

	.tm-option-check {
		flex-shrink: 0;
		color: var(--text-accent);
	}

	.tm-option-check-spacer {
		display: inline-block;
		width: 12px;
		flex-shrink: 0;
	}

	.tm-stock {
		height: 1000px;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}

	.tm-stock-text {
		text-align: center;
	}

	.tm-no-more {
		margin-left: auto;
		margin-right: auto;
		text-align: center;
		color: var(--text-muted);
		padding: var(--size-4-4) 0;
	}

	.tm-blank-day {
		display: flex;
		margin-left: auto;
		margin-right: auto;
		max-width: var(--file-line-width);
		color: var(--color-base-40);
		padding-top: 20px;
		padding-bottom: 20px;
		transition: all 300ms;
		cursor: pointer;
	}

	.tm-blank-day:hover {
		padding-top: 40px;
		padding-bottom: 40px;
		transition: padding 300ms;
	}

	.tm-blank-day-text {
		margin-left: auto;
		margin-right: auto;
		text-align: center;
	}

	.tm-note-wrapper {
		width: 100%;
	}
</style>
