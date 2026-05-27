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
	import { onMount, tick as svelteTick } from "svelte";
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

	/** Number of notes added to the rendered list per infinite-scroll tick. */
	const SCROLL_BATCH_SIZE = 1;
	/** ms to wait before running a search after Svelte flushes reactivity. */
	const SVELTE_SEARCH_FLUSH_MS = 0;
	let intervalId: number | undefined;

	let renderedFiles: TFile[] = [];
	let filteredFiles: TFile[] = [];
	let totalFileCount = 0;
	let visibleNotes: Set<string> = new Set();

	// Toolbar state
	let activeDropdown = "";   // "granularity" | "sort" | "filter" | "properties" | ""
	let showSearch = false;
	let searchQuery = "";
	let searchInputEl: HTMLInputElement;

	// Mirror plugin settings so toolbar toggles update reactively
	let hideFrontmatter = plugin.settings.hideFrontmatter;
	let hideBacklinks   = plugin.settings.hideBacklinks;
	let showEmptyNotes  = true;

	// Sort labels — typed via satisfies after inference
	const sortLabels = {
		date:         "Date (newest first)",
		dateReverse:  "Date (oldest first)",
		mtime:        "Modified (newest first)",
		mtimeReverse: "Modified (oldest first)",
		ctime:        "Created (newest first)",
		ctimeReverse: "Created (oldest first)",
		name:         "Name (A–Z)",
		nameReverse:  "Name (Z–A)",
	};

	const filterLabels = {
		all:            "All notes",
		week:           "This week",
		month:          "This month",
		quarter:        "This quarter",
		year:           "This year",
		"last-week":    "Last week",
		"last-month":   "Last month",
		"last-quarter": "Last quarter",
		"last-year":    "Last year",
		custom:         "Custom range",
	};

	const filterOrder: TimeRange[] = [
		"all", "week", "month", "quarter", "year",
		"last-week", "last-month", "last-quarter", "last-year",
	];

	function closeDropdowns() { activeDropdown = ""; }

	function toggleDropdown(name: string) {
		activeDropdown = activeDropdown === name ? "" : name;
	}

	/**
	 * Unified click-outside action. When `closeSearch` is true the handler also
	 * collapses the search bar if the query is empty, in addition to closing dropdowns.
	 */
	function clickOutside(node: HTMLElement, { closeSearch = false } = {}) {
		const handle = (e: MouseEvent) => {
			if (!node.contains(e.target as Node)) {
				closeDropdowns();
				if (closeSearch && searchQuery === "") showSearch = false;
			}
		};
		document.addEventListener("click", handle, true);
		return { destroy() { document.removeEventListener("click", handle, true); } };
	}

	async function toggleHideFrontmatter() {
		hideFrontmatter = !hideFrontmatter;
		plugin.settings.hideFrontmatter = hideFrontmatter;
		document.body.classList.toggle("tm-hide-frontmatter", hideFrontmatter);
		await plugin.saveSettings();
	}

	async function toggleHideBacklinks() {
		hideBacklinks = !hideBacklinks;
		plugin.settings.hideBacklinks = hideBacklinks;
		document.body.classList.toggle("tm-hide-backlinks", hideBacklinks);
		await plugin.saveSettings();
	}

	/** Returns true when the file has no meaningful body (empty or frontmatter-only). */
	function isNoteEmpty(f: TFile): boolean {
		if (f.stat.size === 0) return true;
		const cache = plugin.app.metadataCache.getFileCache(f);
		if (!cache) return false; // cache not ready — assume not empty
		const sections = cache.sections ?? [];
		if (sections.length === 0) return true;
		return sections.every((s) => s.type === "yaml");
	}

	function applyEmptyFilter(files: TFile[]): TFile[] {
		if (showEmptyNotes) return files;
		return files.filter((f) => !isNoteEmpty(f));
	}

	function toggleShowEmptyNotes() {
		showEmptyNotes = !showEmptyNotes;
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
		filteredFiles = applyEmptyFilter(fileManager.getFilteredFiles());
		totalFileCount = filteredFiles.length;
		hasMore = filteredFiles.length > 0;
		firstLoaded = true;
		startFillViewport();
		updateTitleElement();
	}

	onMount(() => {
		fileManager = new FileManager(fileManagerOptions);
		filteredFiles = applyEmptyFilter(fileManager.getFilteredFiles());
		totalFileCount = filteredFiles.length;
		hasMore = filteredFiles.length > 0;
		startFillViewport();
		updateTitleElement();
	});

	// Re-filter when search query changes (title + content).
	// The generation counter inside applySearchQuery handles stale async results,
	// so calling it on every searchQuery change is safe.
	let _searchGeneration = 0;
	$: if (fileManager) applySearchQuery(searchQuery);

	// Re-filter when the "show empty notes" toggle changes.
	let _prevShowEmptyNotes = true;
	$: if (fileManager && showEmptyNotes !== _prevShowEmptyNotes) {
		_prevShowEmptyNotes = showEmptyNotes;
		filteredFiles = applyEmptyFilter(fileManager.getFilteredFiles());
		renderedFiles = [];
		visibleNotes.clear();
		hasMore = filteredFiles.length > 0;
		firstLoaded = true;
		startFillViewport();
	}

	async function applySearchQuery(q: string) {
		const gen = ++_searchGeneration;
		const query = q.trim().toLowerCase();
		const all = fileManager.getFilteredFiles();

		let matches: TFile[];
		if (!query) {
			matches = all;
		} else {
			const results = await Promise.all(
				all.map(async (f) => {
					if (f.basename.toLowerCase().includes(query)) return f;
					try {
						const content = await plugin.app.vault.cachedRead(f);
						if (content.toLowerCase().includes(query)) return f;
					} catch {
						// ignore unreadable files
					}
					return null;
				})
			);
			if (gen !== _searchGeneration) return; // stale — a newer query is in flight
			matches = results.filter((f): f is TFile => f !== null);
		}

		if (gen !== _searchGeneration) return;
		filteredFiles = applyEmptyFilter(matches);
		renderedFiles = [];
		visibleNotes.clear();
		hasMore = filteredFiles.length > 0;
		firstLoaded = true;
		startFillViewport();
	}

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
			renderedFiles = [...renderedFiles, ...filteredFiles.splice(0, SCROLL_BATCH_SIZE)];
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

	async function createCurrentPeriodNote() {
		const newNote = await fileManager.createCurrentPeriodNote();
		if (newNote) {
			renderedFiles = [newNote, ...renderedFiles];
			visibleNotes.add(newNote.path);
			visibleNotes = visibleNotes;
		}
	}

	function handleSortChange(field: string) {
		timeField = field as TimeField;
		activeDropdown = "";
		// @ts-ignore
		if (leaf?.view?.setTimeField) leaf.view.setTimeField(field);
	}

	function handleFilterChange(range: TimeRange) {
		if (range === "custom") {
			activeDropdown = "";
			// @ts-ignore
			if (leaf?.view?.openCustomRangeModal) leaf.view.openCustomRangeModal();
			return;
		}
		selectedRange = range;
		activeDropdown = "";
		// @ts-ignore
		if (leaf?.view?.setSelectedRange) leaf.view.setSelectedRange(range);
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
			filteredFiles = applyEmptyFilter(fileManager.getFilteredFiles());
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

	/**
	 * Open the time-notes view scrolled to a specific file.
	 *
	 * Forces all notes up-to-and-including the target to be rendered, then
	 * smoothly scrolls the target wrapper into view.  Any active search is
	 * cleared first so the file is always reachable.
	 */
	export async function scrollToFile(targetFile: TFile): Promise<void> {
		// Clear any active search so the full filtered list is visible.
		searchQuery = "";
		showSearch = false;

		// Grab the complete filtered list straight from the manager (the Svelte
		// local `filteredFiles` is a queue that gets spliced, so it may be
		// partially consumed already).
		const allFiles = applyEmptyFilter(fileManager.getFilteredFiles());
		const idx = allFiles.findIndex((f) => f.path === targetFile.path);
		if (idx === -1) return; // not in the current filter

		// Force-render every note from the top down to (and including) the target.
		renderedFiles = allFiles.slice(0, idx + 1);
		filteredFiles = allFiles.slice(idx + 1);
		hasMore = filteredFiles.length > 0;
		firstLoaded = false;

		// Wait for Svelte to flush the DOM, then for the browser to paint.
		await svelteTick();
		await new Promise<void>((r) => requestAnimationFrame(() => r()));

		// Find the wrapper by its data-path attribute and scroll it into view.
		if (!scrollEl) return;
		for (const el of scrollEl.querySelectorAll<HTMLElement>("[data-path]")) {
			if (el.getAttribute("data-path") === targetFile.path) {
				el.scrollIntoView({ behavior: "smooth", block: "start" });
				break;
			}
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
	<div class="tm-toolbar" role="toolbar" aria-label="Note view controls" use:clickOutside>
		{#if selectionMode === "daily"}
			<!-- Granularity switcher chip — daily mode only -->
			<div class="tm-switcher-wrap">
				<button
					class="tm-switcher-btn"
					class:tm-switcher-btn--open={activeDropdown === "granularity"}
					on:click|stopPropagation={() => toggleDropdown("granularity")}
					aria-haspopup="listbox"
					aria-expanded={activeDropdown === "granularity"}
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
				{#if activeDropdown === "granularity"}
					<div class="tm-switcher-dropdown" role="listbox">
						{#each enabledGranularities as g}
							<button
								class="tm-switcher-option"
								class:tm-switcher-option--active={granularity === g}
								role="option"
								aria-selected={granularity === g}
								on:click={() => { handleGranularityChange(g); closeDropdowns(); }}
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

			<div class="tm-toolbar-divider"></div>
		{:else}
			<!-- Mode indicator for folder / tag — replaces granularity chip -->
			<div class="tm-toolbar-mode-indicator">
				{#if selectionMode === "folder"}
					<svg class="tm-mode-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.764c.528 0 1.034.21 1.408.586L8.914 3.5H13.5A1.5 1.5 0 0 1 15 5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12V3.5z"/>
					</svg>
					<span class="tm-toolbar-mode-label">{folderPath || "folder"}</span>
				{:else}
					<svg class="tm-mode-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9.5 2H14v4.5L6.5 14 2 9.5 9.5 2z"/>
						<circle cx="11.5" cy="4.5" r="1" fill="currentColor" stroke="none"/>
					</svg>
					<span class="tm-toolbar-mode-label">{tag || "tag"}</span>
				{/if}
			</div>

			<div class="tm-toolbar-divider"></div>
		{/if}

		<!-- Sort — shown in all modes -->
		<div class="tm-switcher-wrap">
			<button
				class="tm-toolbar-action"
				class:tm-toolbar-action--active={activeDropdown === "sort"}
				on:click|stopPropagation={() => toggleDropdown("sort")}
				aria-haspopup="listbox"
				aria-expanded={activeDropdown === "sort"}
			>
				<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M2 4h7M2 8h5M2 12h3M11 3v10M11 13l3-3M11 13l-3-3"/>
				</svg>
				Sort
			</button>
			{#if activeDropdown === "sort"}
				<div class="tm-switcher-dropdown" role="listbox">
					{#each Object.entries(sortLabels) as [field, label]}
						<button
							class="tm-switcher-option"
							class:tm-switcher-option--active={timeField === field}
							role="option"
							aria-selected={timeField === field}
							on:click={() => handleSortChange(field)}
						>
							{#if timeField === field}
								<svg class="tm-option-check" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3 8l4 4 6-7"/>
								</svg>
							{:else}
								<span class="tm-option-check-spacer"></span>
							{/if}
							{label}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Filter — shown in all modes -->
		<div class="tm-switcher-wrap">
			<button
				class="tm-toolbar-action"
				class:tm-toolbar-action--active={activeDropdown === "filter"}
				class:tm-toolbar-action--applied={selectedRange !== "all" || !showEmptyNotes}
				on:click|stopPropagation={() => toggleDropdown("filter")}
				aria-haspopup="listbox"
				aria-expanded={activeDropdown === "filter"}
			>
				<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<path d="M2 3h12l-5 6v4l-2-1V9L2 3z"/>
				</svg>
				Filter{selectedRange !== "all" ? ` · ${filterLabels[selectedRange] ?? selectedRange}` : ""}
			</button>
			{#if activeDropdown === "filter"}
				<div class="tm-switcher-dropdown" role="listbox">
					{#each filterOrder as range}
						<button
							class="tm-switcher-option"
							class:tm-switcher-option--active={selectedRange === range}
							role="option"
							aria-selected={selectedRange === range}
							on:click={() => handleFilterChange(range)}
						>
							{#if selectedRange === range}
								<svg class="tm-option-check" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3 8l4 4 6-7"/>
								</svg>
							{:else}
								<span class="tm-option-check-spacer"></span>
							{/if}
							{filterLabels[range]}
						</button>
					{/each}
					<div class="tm-dropdown-separator"></div>
					<button
						class="tm-switcher-option"
						class:tm-switcher-option--active={selectedRange === "custom"}
						role="option"
						aria-selected={selectedRange === "custom"}
						on:click={() => handleFilterChange("custom")}
					>
						{#if selectedRange === "custom"}
							<svg class="tm-option-check" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
								<path d="M3 8l4 4 6-7"/>
							</svg>
						{:else}
							<span class="tm-option-check-spacer"></span>
						{/if}
						Custom range…
					</button>
					{#if selectionMode === "daily"}
						<div class="tm-dropdown-separator"></div>
						<label class="tm-prop-toggle">
							<span class="tm-prop-label">Show empty notes</span>
							<button
								class="tm-toggle-btn"
								class:tm-toggle-btn--on={showEmptyNotes}
								role="switch"
								aria-checked={showEmptyNotes}
								on:click|stopPropagation={toggleShowEmptyNotes}
							>
								<span class="tm-toggle-knob"></span>
							</button>
						</label>
					{/if}
				</div>
			{/if}
		</div>

		{#if selectionMode === "daily"}
			<!-- Properties — daily mode only (frontmatter/backlinks only apply there) -->
			<div class="tm-switcher-wrap">
				<button
					class="tm-toolbar-action"
					class:tm-toolbar-action--active={activeDropdown === "properties"}
					class:tm-toolbar-action--applied={hideFrontmatter || hideBacklinks}
					on:click|stopPropagation={() => toggleDropdown("properties")}
					aria-haspopup="dialog"
					aria-expanded={activeDropdown === "properties"}
				>
					<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
						<path d="M2 4h12M2 8h12M2 12h8"/>
					</svg>
					Properties
				</button>
				{#if activeDropdown === "properties"}
					<div class="tm-switcher-dropdown tm-props-dropdown">
						<label class="tm-prop-toggle">
							<span class="tm-prop-label">Hide frontmatter</span>
							<button
								class="tm-toggle-btn"
								class:tm-toggle-btn--on={hideFrontmatter}
								role="switch"
								aria-checked={hideFrontmatter}
								on:click={toggleHideFrontmatter}
							>
								<span class="tm-toggle-knob"></span>
							</button>
						</label>
						<label class="tm-prop-toggle">
							<span class="tm-prop-label">Hide backlinks</span>
							<button
								class="tm-toggle-btn"
								class:tm-toggle-btn--on={hideBacklinks}
								role="switch"
								aria-checked={hideBacklinks}
								on:click={toggleHideBacklinks}
							>
								<span class="tm-toggle-knob"></span>
							</button>
						</label>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Search — shown in all modes -->
		{#if showSearch}
			<div class="tm-search-wrap" use:clickOutside={{ closeSearch: true }}>
				<svg class="tm-search-icon" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="6.5" cy="6.5" r="4"/>
					<path d="M11 11l3 3"/>
				</svg>
				<input
					bind:this={searchInputEl}
					class="tm-search-input"
					type="text"
					placeholder="Search notes…"
					bind:value={searchQuery}
					on:keydown={(e) => { if (e.key === "Escape") { searchQuery = ""; showSearch = false; } }}
				/>
				{#if searchQuery}
					<button class="tm-search-clear" on:click={() => { searchQuery = ""; searchInputEl?.focus(); }} aria-label="Clear search">✕</button>
				{/if}
			</div>
		{:else}
			<button
				class="tm-toolbar-action"
				class:tm-toolbar-action--applied={searchQuery !== ""}
				on:click={() => { showSearch = true; closeDropdowns(); setTimeout(() => searchInputEl?.focus(), 0); }}
			>
				<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="6.5" cy="6.5" r="4"/>
					<path d="M11 11l3 3"/>
				</svg>
				Search
			</button>
		{/if}

		<!-- Note count — always shown, pushed to the right -->
		<span class="tm-toolbar-count" aria-live="polite">
			{totalFileCount} {totalFileCount === 1 ? "note" : "notes"}
		</span>

		{#if selectionMode !== "daily"}
			<!-- Back to daily — folder / tag mode only -->
			<button
				class="tm-toolbar-btn tm-toolbar-btn--secondary"
				on:click={() => {
					selectionMode = "daily";
					// @ts-ignore
					if (leaf?.view?.setSelectionMode) leaf.view.setSelectionMode("daily");
				}}
			>
				<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M10 3L5 8l5 5"/>
				</svg>
				Daily
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
			<div class="tm-blank-day" on:click={createCurrentPeriodNote} aria-hidden="true">
				<div class="tm-blank-day-text">
					{displayConfigs[granularity].labelOpenPresent.replace("Open", "Create")}
				</div>
			</div>
		{/if}
		{#each renderedFiles as file (file.path)}
			<div
				class="tm-note-wrapper"
				data-path={file.path}
				use:inview={{
					rootMargin: "80%",
					unobserveOnEnter: false,
					root: scrollEl,
				}}
				on:inview_change={({ detail }) =>
					handleNoteVisibilityChange(file, detail.inView)}
			>
				<DailyNote {file} {plugin} {leaf} shouldRender={visibleNotes.has(file.path)} {granularity} {selectionMode} />
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
		flex: 1;
		min-height: 200px;
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

.tm-blank-day-text {
		margin-left: auto;
		margin-right: auto;
		text-align: center;
	}

	.tm-note-wrapper {
		width: 100%;
	}

	/* ── Mode indicator (folder / tag) — replaces granularity chip in non-daily modes ── */

	.tm-toolbar-mode-indicator {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		font-size: var(--font-ui-small);
		color: var(--text-muted);
		max-width: 160px;
		overflow: hidden;
	}

	.tm-mode-icon {
		flex-shrink: 0;
		opacity: 0.7;
	}

	/* ── Note count — pushed to the right of the toolbar ── */

	.tm-toolbar-count {
		margin-left: auto;
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
		white-space: nowrap;
		padding: 2px 6px;
	}

	/* ── Bases-style action buttons (Sort / Filter / Properties / Search) ── */

	.tm-toolbar-divider {
		width: 1px;
		height: 16px;
		background-color: var(--background-modifier-border);
		margin: 0 2px;
		flex-shrink: 0;
	}

	.tm-toolbar-action {
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
		white-space: nowrap;
	}

	.tm-toolbar-action:hover {
		background-color: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	.tm-toolbar-action--active {
		background-color: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	/* Highlight when a non-default value is applied */
	.tm-toolbar-action--applied {
		color: var(--text-accent);
	}

	/* ── Dropdown separator ── */

	.tm-dropdown-separator {
		height: 1px;
		background-color: var(--background-modifier-border);
		margin: 4px 0;
	}

	/* ── Properties panel ── */

	.tm-props-dropdown {
		min-width: 200px;
	}

	.tm-prop-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		gap: 16px;
		cursor: default;
	}

	.tm-prop-label {
		font-size: var(--font-ui-small);
		color: var(--text-normal);
	}

	.tm-toggle-btn {
		all: unset;
		position: relative;
		width: 28px;
		height: 16px;
		border-radius: 8px;
		background-color: var(--background-modifier-border);
		cursor: pointer;
		transition: background-color 120ms ease;
		flex-shrink: 0;
	}

	.tm-toggle-btn--on {
		background-color: var(--interactive-accent);
	}

	.tm-toggle-knob {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background-color: var(--background-primary);
		transition: transform 120ms ease;
		pointer-events: none;
	}

	.tm-toggle-btn--on .tm-toggle-knob {
		transform: translateX(12px);
	}

	/* ── Search ── */

	.tm-search-wrap {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		border-radius: var(--radius-s);
		border: 1px solid var(--background-modifier-border);
		background-color: var(--background-primary);
	}

	.tm-search-icon {
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.tm-search-input {
		all: unset;
		font-size: var(--font-ui-small);
		color: var(--text-normal);
		width: 140px;
	}

	.tm-search-input::placeholder {
		color: var(--text-faint);
	}

	.tm-search-clear {
		all: unset;
		cursor: pointer;
		color: var(--text-muted);
		font-size: 10px;
		line-height: 1;
		padding: 1px 2px;
		border-radius: 2px;
	}

	.tm-search-clear:hover {
		color: var(--text-normal);
		background-color: var(--background-modifier-hover);
	}
</style>
