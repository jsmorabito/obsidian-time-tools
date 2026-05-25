<script lang="ts">
	// Ported from quorafind/Obsidian-Daily-Notes-Editor (MIT).
	// MVP: daily mode only — folder/tag selection are tracked in
	// docs/deferred-features.md.
	import type TimeManagerPlugin from "../main";
	import type { WorkspaceLeaf } from "obsidian";
	import { TFile, moment } from "obsidian";
	import DailyNote from "./DailyNote.svelte";
	import { inview } from "svelte-inview";
	import type { TimeRange, TimeField } from "./types";
	import { onMount } from "svelte";
	import { FileManager, type FileManagerOptions } from "./file-manager";

	export let plugin: TimeManagerPlugin;
	export let leaf: WorkspaceLeaf;
	export let selectedRange: TimeRange = "all";
	export let timeField: TimeField = "mtime";

	const size = 1;
	let intervalId: number | undefined;

	let renderedFiles: TFile[] = [];
	let filteredFiles: TFile[] = [];
	let visibleNotes: Set<string> = new Set();

	let hasMore = true;
	let firstLoaded = true;
	let loaderRef: HTMLDivElement;

	let fileManager: FileManager;

	$: fileManagerOptions = {
		resolver: plugin,
		app: plugin.app,
		timeRange: selectedRange,
		timeField,
	} as FileManagerOptions;

	$: if (
		fileManager &&
		(selectedRange !== fileManager.options.timeRange ||
			timeField !== fileManager.options.timeField)
	) {
		fileManager.updateOptions({ timeRange: selectedRange, timeField });
		renderedFiles = [];
		visibleNotes.clear();
		filteredFiles = fileManager.getFilteredFiles();
		hasMore = filteredFiles.length > 0;
		firstLoaded = true;
		startFillViewport();
		updateTitleElement();
	}

	onMount(() => {
		fileManager = new FileManager(fileManagerOptions);
		filteredFiles = fileManager.getFilteredFiles();
		hasMore = filteredFiles.length > 0;
		startFillViewport();
		updateTitleElement();
	});

	function updateTitleElement() {
		if (!leaf || !leaf.view || !leaf.view.titleEl) return;
		const titleEl = leaf.view.titleEl;
		titleEl.empty();
		let titleText = "";
		if (selectedRange !== "all") {
			titleText = `Showing notes for: ${selectedRange}`;
		}
		titleEl.setText(titleText || "Daily notes");
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
		const contentHeight = leaf.view.contentEl.clientHeight || viewportHeight;
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
		fileManager.checkDailyNote();
		const hasDailyNote = fileManager.hasCurrentDayNote();

		if (hadDailyNote !== hasDailyNote || selectedRange !== "all") {
			filteredFiles = fileManager.getFilteredFiles();
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
</script>

<div class="tm-note-view">
	{#if renderedFiles.length === 0}
		<div class="tm-stock">
			<div class="tm-stock-text">No files found</div>
		</div>
	{/if}
	{#if !fileManager?.hasCurrentDayNote() && (selectedRange === "all" || selectedRange === "week" || selectedRange === "month" || selectedRange === "year")}
		<div class="tm-blank-day" on:click={createNewDailyNote} aria-hidden="true">
			<div class="tm-blank-day-text">Create a daily note for today</div>
		</div>
	{/if}
	{#each renderedFiles as file (file.path)}
		<div
			class="tm-note-wrapper"
			use:inview={{
				rootMargin: "80%",
				unobserveOnEnter: false,
				root: leaf.view.contentEl,
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
		use:inview={{ root: leaf.view.containerEl }}
		on:inview_init={startFillViewport}
		on:inview_change={infiniteHandler}
		on:inview_leave={stopFillViewport}
	/>
	{#if !hasMore}
		<div class="tm-no-more">— No more results —</div>
	{/if}
</div>

<style>
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
