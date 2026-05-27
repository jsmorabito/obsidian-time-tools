<script lang="ts">
	// Ported from quorafind/Obsidian-Daily-Notes-Editor (MIT).
	import type TimeManagerPlugin from "../main";
	import { MarkdownView, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
	import { spawnLeafView } from "./leafView";
	import { onDestroy, onMount } from "svelte";
	import type { Granularity } from "../periodic/types";
	import type { SelectionMode } from "./types";
	import { getPeriodicDisplay } from "../utils/display-title";
	import { DEFAULT_FORMAT } from "../periodic/constants";

	// How long (ms) to wait for CodeMirror to finish mounting before reading the
	// editor height for the container min-height. The editor initialises async.
	const EDITOR_HEIGHT_SETTLE_MS = 400;
	// How long to keep an out-of-viewport note mounted before actually detaching
	// the leaf. Gives the user time to scroll back without a full reload.
	const UNLOAD_DEBOUNCE_MS = 1000;

	export let file: TAbstractFile;
	export let plugin: TimeManagerPlugin;
	export let leaf: WorkspaceLeaf;
	export let shouldRender: boolean = true;
	export let granularity: Granularity = "day";
	export let selectionMode: SelectionMode = "daily";

	let editorEl: HTMLElement;
	let containerEl: HTMLElement;
	let title: string;
	let displayPrimary: string = "";
	let displaySecondary: string = "";

	let rendered: boolean = false;
	let createdLeaf: WorkspaceLeaf;
	let unloadTimeout: number | null = null;
	let editorHeight: number = 100;

	let isDestroying = false;
	let isCollapsed: boolean = false;

	onMount(() => {
		if (file instanceof TFile) {
			title = file.basename;
			if (selectionMode === "daily") {
				const fmt = plugin.settings[granularity]?.format ?? DEFAULT_FORMAT[granularity];
				({ primary: displayPrimary, secondary: displaySecondary } = getPeriodicDisplay(title, fmt, granularity));
			} else {
				displayPrimary = title;
			}
		}
	});

	$: if (editorEl && shouldRender && !rendered) {
		showEditor();
	} else if (editorEl && !shouldRender && rendered) {
		scheduleUnload();
	}

	onDestroy(() => {
		isDestroying = true;
		if (unloadTimeout) window.clearTimeout(unloadTimeout);
		if (rendered && createdLeaf) unloadEditor();
	});

	function showEditor() {
		if (!(file instanceof TFile)) return;
		if (rendered || isDestroying) return;

		if (unloadTimeout) {
			window.clearTimeout(unloadTimeout);
			unloadTimeout = null;
		}

		try {
			[createdLeaf] = spawnLeafView(plugin, editorEl, leaf);
			createdLeaf.setPinned(true);

			createdLeaf.setViewState({
				type: "markdown",
				state: {
					file: file.path,
					mode: "source",
					source: false,
					backlinks: !plugin.settings.hideBacklinks,
					backlinkOpts: {
						collapseAll: false,
						extraContext: false,
						sortOrder: "alphabetical",
						showSearch: false,
						searchQuery: "",
						backlinkCollapsed: false,
						unlinkedCollapsed: true,
					},
				},
			});
			createdLeaf.parentLeaf = leaf;

			rendered = true;

			const timeout = window.setTimeout(() => {
				if (createdLeaf && containerEl) {
					if (!(createdLeaf.view instanceof MarkdownView)) return;
					// Access the CodeMirror editor height via the unofficial editMode chain.
					// @ts-ignore — editMode.editor.cm is not typed in the public Obsidian API
					const actualHeight = createdLeaf.view.editMode?.editor?.cm?.dom.innerHeight;
					if (actualHeight > 0) {
						editorHeight = actualHeight;
						containerEl.style.minHeight = `${editorHeight}px`;
						window.clearTimeout(timeout);
					}
				}
			}, EDITOR_HEIGHT_SETTLE_MS);
		} catch (error) {
			console.error("Obsidian Time Tools: error creating leaf view", error);
		}
	}

	function scheduleUnload() {
		if (unloadTimeout) window.clearTimeout(unloadTimeout);
		unloadTimeout = window.setTimeout(() => {
			if (!shouldRender && rendered) unloadEditor();
		}, UNLOAD_DEBOUNCE_MS);
	}

	function unloadEditor() {
		if (!rendered || !createdLeaf) return;
		try {
			if (createdLeaf.detach) createdLeaf.detach();
			if (editorEl) editorEl.empty();
			rendered = false;
		} catch (error) {
			console.error("Obsidian Time Tools: error unloading editor", error);
		}
	}

	function handleFileIconClick() {
		if (!(file instanceof TFile)) return;
		if (leaf && !(leaf as any)?.pinned) leaf.openFile(file);
		else plugin.app.workspace.getLeaf(false).openFile(file);
	}

	function handleEditorClick() {
		// @ts-ignore
		const editor = createdLeaf?.view?.editMode?.editor;
		if (editor && !editor.hasFocus()) editor.focus();
	}

	function toggleCollapse() {
		isCollapsed = !isCollapsed;
	}
</script>

<div
	class="tm-note-container"
	data-id="tm-editor-{file.path}"
	bind:this={containerEl}
	style="min-height: {isCollapsed ? 'auto' : editorHeight + 'px'};"
>
	<div class="tm-note">
		{#if title}
			<div class="tm-note-title inline-title">
				<!-- svelte-ignore a11y-interactive-supports-focus -->
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<span
					role="button"
					data-collapsed={isCollapsed}
					class="tm-collapse-button"
					on:click={toggleCollapse}
					title={isCollapsed ? "Expand" : "Collapse"}
				>
					<div class="collapse-icon">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="m6 9 6 6 6-6" />
						</svg>
					</div>
				</span>
				<!-- svelte-ignore a11y-interactive-supports-focus -->
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<span
					role="link"
					class="tm-clickable-link"
					on:click={handleFileIconClick}
					data-title={title}>{displayPrimary || title}</span
				>
				{#if displaySecondary}
					<span class="tm-note-dateid">{displaySecondary}</span>
				{/if}
			</div>
		{/if}
		<div
			class="tm-note-editor"
			data-collapsed={isCollapsed}
			aria-hidden="true"
			bind:this={editorEl}
			data-title={title}
			on:click={handleEditorClick}
		>
			{#if !rendered && shouldRender}
				<div class="tm-editor-placeholder">Loading…</div>
			{/if}
			{#if !shouldRender && !rendered}
				<div class="tm-editor-placeholder">Scroll to view content</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.tm-note {
		margin-bottom: var(--size-4-5);
		padding-bottom: var(--size-4-8);
	}

	.tm-note:has(.tm-note-editor[data-collapsed="true"]) {
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.tm-note-editor {
		/* 100px — holds space while CodeMirror initialises asynchronously */
		min-height: 100px;
	}

	.tm-note-editor[data-collapsed="true"] {
		display: none;
	}

	/* Collapse button — always in layout (opacity not display) so title text never shifts */
	.tm-collapse-button {
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: 4px;
		color: var(--text-muted);
		flex-shrink: 0;
		opacity: 0;
		transition: opacity 120ms ease, transform 120ms ease, color 120ms ease;
		/*
		 * Pull the chevron into the left gutter without affecting the title text position.
		 * -20px = chevron width, leaving a small gap between chevron and border.
		 */
		margin-left: -20px;
	}

	.tm-note:has(.tm-note-editor[data-collapsed="true"]) .tm-collapse-button {
		opacity: 1;
	}

	/* Show chevron on title-row hover (uncollapsed state) */
	.tm-note-title:hover .tm-collapse-button {
		opacity: 1;
	}

	.tm-collapse-button:hover {
		color: var(--text-normal);
	}

	.tm-collapse-button[data-collapsed="true"] {
		transform: rotate(-90deg);
	}

	/* ── Title row ── */
	.tm-note-title {
		display: flex;
		align-items: center;
		gap: 0;
		margin-bottom: var(--size-4-4);
	}

	/* ── Collapsed state ── */
	.tm-note:has(.tm-note-editor[data-collapsed="true"]) {
		margin-bottom: 0;
		padding-bottom: 0;
	}

	.tm-note:has(.tm-note-editor[data-collapsed="true"]) .tm-note-title {
		margin-bottom: 0;
	}

	.tm-clickable-link {
		cursor: pointer;
		text-decoration: none;
	}

	.tm-clickable-link:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	/* Subtle date ID pushed to the far right of the title row */
	.tm-note-dateid {
		margin-left: auto;
		font-size: var(--font-ui-small);
		font-weight: 400;
		color: var(--text-faint);
		letter-spacing: 0.02em;
		white-space: nowrap;
		padding-left: 1em;
	}

	.tm-editor-placeholder {
		display: flex;
		justify-content: center;
		align-items: center;
		/* min-height matches .tm-note-editor so the card doesn't collapse during load */
		min-height: 100px;
		color: var(--text-muted);
		font-style: italic;
	}
</style>
