<script lang="ts">
	import type TimeManagerPlugin from "../main";
	import type { WorkspaceLeaf } from "obsidian";
	import { TFile, normalizePath } from "obsidian";
	import { onDestroy, onMount } from "svelte";
	import { inview } from "svelte-inview";
	import DailyNote from "../editor/DailyNote.svelte";
	import type { SessionManager } from "./session-manager";

	export let plugin: TimeManagerPlugin;
	export let leaf: WorkspaceLeaf;
	export let sessionManager: SessionManager;

	// ── Reactive state ────────────────────────────────────────────────────────

	let isSessionActive = false;
	let isPaused = false;
	let timerDisplay = "00:00:00";

	let sessionFiles: TFile[] = [];
	let visibleNotes: Set<string> = new Set();

	let timerInterval: number;
	let scrollEl: HTMLDivElement;

	// ── Lifecycle ─────────────────────────────────────────────────────────────

	onMount(() => {
		syncState();
		loadSessionFiles();
		timerInterval = window.setInterval(tick, 1000);
	});

	onDestroy(() => {
		window.clearInterval(timerInterval);
	});

	// ── Timer ─────────────────────────────────────────────────────────────────

	function tick() {
		syncState();
		if (isSessionActive) {
			timerDisplay = formatMs(sessionManager.getElapsedMs());
		}
	}

	function syncState() {
		isSessionActive = sessionManager.activeSession !== null;
		isPaused = sessionManager.activeSession?.isPaused ?? false;
	}

	function formatMs(ms: number): string {
		const totalSecs = Math.floor(ms / 1000);
		const h = Math.floor(totalSecs / 3600);
		const m = Math.floor((totalSecs % 3600) / 60);
		const s = totalSecs % 60;
		return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
	}

	// ── Session actions ───────────────────────────────────────────────────────

	async function handleStart() {
		const file = await sessionManager.startSession();
		// Prepend the new session file so it appears at the top.
		sessionFiles = [file, ...sessionFiles];
		visibleNotes.add(file.path);
		visibleNotes = new Set(visibleNotes);
		syncState();
		timerDisplay = "00:00:00";
	}

	function handlePause() {
		sessionManager.pauseSession();
		syncState();
	}

	function handleResume() {
		sessionManager.resumeSession();
		syncState();
	}

	async function handleStop() {
		await sessionManager.stopSession();
		syncState();
		timerDisplay = "00:00:00";
	}

	// ── File list ─────────────────────────────────────────────────────────────

	function loadSessionFiles() {
		const folder = normalizePath(plugin.settings.sessionsFolder || "Sessions");
		sessionFiles = plugin.app.vault.getMarkdownFiles()
			.filter((f) => f.path.startsWith(folder + "/"))
			.sort((a, b) => b.stat.ctime - a.stat.ctime);
	}

	function handleNoteVisibilityChange(file: TFile, isVisible: boolean) {
		if (isVisible) visibleNotes.add(file.path);
		else visibleNotes.delete(file.path);
		visibleNotes = new Set(visibleNotes);
	}

	// Re-expose so the ItemView can trigger a refresh (e.g. after settings change).
	export function refresh() {
		loadSessionFiles();
		syncState();
	}
</script>

<div class="tm-sessions-shell">
	<!-- ── Timer header ─────────────────────────────────────────────────────── -->
	<div class="tm-sessions-header">
		<div class="tm-sessions-timer-row">
			{#if isSessionActive}
				<span class="tm-sessions-dot" aria-hidden="true"></span>
			{/if}
			<span class="tm-sessions-clock" class:tm-sessions-clock--paused={isPaused}>
				{timerDisplay}
			</span>
		</div>

		<div class="tm-sessions-controls">
			{#if !isSessionActive}
				<button class="tm-sessions-btn tm-sessions-btn--start" on:click={handleStart}>
					Start session
				</button>
			{:else if isPaused}
				<button class="tm-sessions-btn" on:click={handleResume}>Resume</button>
				<button class="tm-sessions-btn tm-sessions-btn--stop" on:click={handleStop}>Stop</button>
			{:else}
				<button class="tm-sessions-btn" on:click={handlePause}>Pause</button>
				<button class="tm-sessions-btn tm-sessions-btn--stop" on:click={handleStop}>Stop</button>
			{/if}
		</div>
	</div>

	<!-- ── Session list ──────────────────────────────────────────────────────── -->
	<div class="tm-sessions-list" bind:this={scrollEl}>
		{#if sessionFiles.length === 0}
			<div class="tm-sessions-empty">
				<p>No sessions yet.</p>
				<p>Hit <strong>Start session</strong> to begin tracking your work.</p>
			</div>
		{/if}

		{#each sessionFiles as file (file.path)}
			<div
				class="tm-note-wrapper"
				use:inview={{
					rootMargin: "80%",
					unobserveOnEnter: false,
					root: scrollEl,
				}}
				on:inview_change={({ detail }) => handleNoteVisibilityChange(file, detail.inView)}
			>
				<DailyNote {file} {plugin} {leaf} shouldRender={visibleNotes.has(file.path)} />
			</div>
		{/each}

		{#if sessionFiles.length > 0}
			<div class="tm-sessions-end">— End of sessions —</div>
		{/if}
	</div>
</div>

<style>
	/* ── Shell ─────────────────────────────────────────────────────────────── */

	.tm-sessions-shell {
		display: flex;
		flex-direction: column;
		height: 100%;
	}

	/* ── Header ────────────────────────────────────────────────────────────── */

	.tm-sessions-header {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px;
		background-color: var(--background-primary);
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tm-sessions-timer-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	/* Pulsing dot shown while a session is running */
	.tm-sessions-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background-color: var(--color-red);
		animation: tm-pulse 1.4s ease-in-out infinite;
		flex-shrink: 0;
	}

	@keyframes tm-pulse {
		0%, 100% { opacity: 1; }
		50%       { opacity: 0.3; }
	}

	.tm-sessions-clock {
		font-size: var(--font-ui-large);
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		color: var(--text-normal);
		letter-spacing: 0.04em;
	}

	.tm-sessions-clock--paused {
		color: var(--text-muted);
	}

	/* ── Controls ──────────────────────────────────────────────────────────── */

	.tm-sessions-controls {
		display: flex;
		gap: 6px;
	}

	.tm-sessions-btn {
		all: unset;
		cursor: pointer;
		padding: 4px 14px;
		border-radius: var(--radius-s);
		font-size: var(--font-ui-small);
		background-color: var(--background-modifier-hover);
		color: var(--text-normal);
		transition: background-color 80ms ease;
	}

	.tm-sessions-btn:hover {
		background-color: var(--background-modifier-active-hover);
	}

	.tm-sessions-btn--start {
		background-color: var(--interactive-accent);
		color: var(--text-on-accent);
	}

	.tm-sessions-btn--start:hover {
		background-color: var(--interactive-accent-hover);
	}

	.tm-sessions-btn--stop {
		color: var(--text-error);
	}

	/* ── List ──────────────────────────────────────────────────────────────── */

	.tm-sessions-list {
		flex: 1;
		overflow-y: auto;
	}

	.tm-note-wrapper {
		width: 100%;
	}

	.tm-sessions-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 200px;
		gap: 4px;
		color: var(--text-muted);
		text-align: center;
	}

	.tm-sessions-empty p {
		margin: 0;
	}

	.tm-sessions-end {
		text-align: center;
		color: var(--text-muted);
		font-size: var(--font-ui-small);
		padding: var(--size-4-4) 0 var(--size-4-8);
	}
</style>
