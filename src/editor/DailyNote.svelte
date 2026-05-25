<script lang="ts">
	// Ported from quorafind/Obsidian-Daily-Notes-Editor (MIT).
	import type TimeManagerPlugin from "../main";
	import { MarkdownView, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
	import { spawnLeafView } from "./leafView";
	import { onDestroy, onMount } from "svelte";

	export let file: TAbstractFile;
	export let plugin: TimeManagerPlugin;
	export let leaf: WorkspaceLeaf;
	export let shouldRender: boolean = true;

	let editorEl: HTMLElement;
	let containerEl: HTMLElement;
	let title: string;

	let rendered: boolean = false;
	let createdLeaf: WorkspaceLeaf;
	let unloadTimeout: number | null = null;
	let editorHeight: number = 100;

	let isDestroying = false;
	let isCollapsed: boolean = false;

	onMount(() => {
		if (file instanceof TFile) title = file.basename;
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
					// @ts-ignore
					const actualHeight = createdLeaf.view.editMode?.editor?.cm?.dom.innerHeight;
					if (actualHeight > 0) {
						editorHeight = actualHeight;
						containerEl.style.minHeight = `${editorHeight}px`;
						window.clearTimeout(timeout);
					}
				}
			}, 400);
		} catch (error) {
			console.error("Time Manager: error creating leaf view", error);
		}
	}

	function scheduleUnload() {
		if (unloadTimeout) window.clearTimeout(unloadTimeout);
		unloadTimeout = window.setTimeout(() => {
			if (!shouldRender && rendered) unloadEditor();
		}, 1000);
	}

	function unloadEditor() {
		if (!rendered || !createdLeaf) return;
		try {
			if (createdLeaf.detach) createdLeaf.detach();
			if (editorEl) editorEl.empty();
			rendered = false;
		} catch (error) {
			console.error("Time Manager: error unloading editor", error);
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="m6 9 6 6 6-6" />
					</svg>
				</span>
				<!-- svelte-ignore a11y-interactive-supports-focus -->
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<span
					role="link"
					class="tm-clickable-link"
					on:click={handleFileIconClick}
					data-title={title}>{title}</span
				>
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
		min-height: 100px;
	}

	.tm-note-editor[data-collapsed="true"] {
		display: none;
	}

	.tm-note .tm-collapse-button {
		display: none;
	}

	.tm-note:hover .tm-collapse-button {
		display: block;
	}

	.tm-note .tm-collapse-button {
		color: var(--text-muted);
	}

	.tm-note .tm-collapse-button:hover {
		color: var(--text-normal);
	}

	.tm-note:has(.is-readable-line-width) .tm-note-title {
		max-width: calc(var(--file-line-width) + var(--size-4-4));
		width: calc(var(--file-line-width) + var(--size-4-4));
		margin-left: auto;
		margin-right: auto;
		margin-bottom: var(--size-4-8);
		display: flex;
		align-items: center;
		justify-content: start;
		gap: var(--size-4-2);
	}

	.tm-collapse-button {
		margin-left: calc(var(--size-4-8) * -1);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: 4px;
		color: var(--text-muted);
		transition: background-color 0.2s ease;
	}

	.tm-collapse-button[data-collapsed="true"] {
		transform: rotate(-90deg);
		transition: transform 0.2s ease;
	}

	.tm-collapse-button:hover {
		color: var(--text-normal);
	}

	.tm-note:not(:has(.is-readable-line-width)) .tm-note-title {
		display: flex;
		justify-content: start;
		align-items: center;
		width: 100%;
		padding-left: calc(calc(100% - var(--file-line-width)) / 2 - var(--size-4-2));
		padding-right: calc(calc(100% - var(--file-line-width)) / 2 - var(--size-4-2));
		margin-top: var(--size-4-8);
		gap: var(--size-4-2);
	}

	.tm-clickable-link {
		cursor: pointer;
		text-decoration: none;
	}

	.tm-clickable-link:hover {
		color: var(--color-accent);
		text-decoration: underline;
	}

	.tm-editor-placeholder {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100px;
		color: var(--text-muted);
		font-style: italic;
	}
</style>
