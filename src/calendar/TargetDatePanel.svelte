<script lang="ts">
	/**
	 * TargetDatePanel -- left side panel for CalendarGrid.
	 *
	 * Shows all files whose targetDate falls within the currently visible
	 * calendar range. Refreshes whenever anchorDate or viewType changes.
	 */
	import { onDestroy } from "svelte";
	import { moment } from "obsidian";
	import type TimeManagerPlugin from "../main";
	import type { TFile } from "obsidian";
	import type { ResolvedTargetDate } from "../target-date/types";
	import { labelTargetDate } from "../target-date/target-date-service";
	import Icon from "../utils/Icon.svelte";
	import { setDragPayload } from "./drag-state";
	import { TargetPreviewPopover } from "../target-date/TargetPreviewPopover";

	// -- Props -----------------------------------------------------------------

	export let plugin: TimeManagerPlugin;
	export let anchorDate: string;
	export let viewType: "day" | "week" | "month" | "year";

	// -- State -----------------------------------------------------------------

	interface TargetItem {
		file: TFile;
		target: ResolvedTargetDate;
	}

	let items: TargetItem[] = [];

	// -- Derived range ---------------------------------------------------------

	$: anchor = moment(anchorDate, "YYYY-MM-DD");

	$: rangeStart = viewType === "month" ? anchor.clone().startOf("month")
	              : viewType === "week"  ? anchor.clone().startOf("isoWeek")
	              : viewType === "day"   ? anchor.clone().startOf("day")
	              :                        anchor.clone().startOf("year");

	$: rangeEnd = viewType === "month" ? anchor.clone().endOf("month")
	            : viewType === "week"  ? anchor.clone().endOf("isoWeek")
	            : viewType === "day"   ? anchor.clone().endOf("day")
	            :                        anchor.clone().endOf("year");

	// -- Fetch items -----------------------------------------------------------

	$: loadItems(rangeStart, rangeEnd);

	function loadItems(start: ReturnType<typeof moment>, end: ReturnType<typeof moment>): void {
		items = plugin.targetDateService.getFilesWithTargetInRange(start, end);
	}

	// Re-scan on metadata changes (frontmatter edits).
	const unsubMeta = plugin.app.metadataCache.on("changed", () => {
		loadItems(rangeStart, rangeEnd);
	});
	onDestroy(() => {
		plugin.app.metadataCache.offref(unsubMeta);
	});

	// -- Actions ---------------------------------------------------------------

	function previewFile(file: TFile, target: ResolvedTargetDate, anchorEl: EventTarget | null): void {
		if (anchorEl instanceof HTMLElement) {
			TargetPreviewPopover.show(plugin.app, file, target, anchorEl);
		}
	}

	// -- Helpers ---------------------------------------------------------------

	function periodLabel(item: TargetItem): string {
		return labelTargetDate(item.target.raw, item.target.granularity);
	}

	function fileName(file: TFile): string {
		return file.basename;
	}

	function isPast(item: TargetItem): boolean {
		return item.target.endMoment.isBefore(moment(), "day");
	}
</script>

<div class="tm-cal-target-panel">
	<div class="tm-cal-target-panel-header">
		<span class="tm-cal-target-panel-title">Targets</span>
		<span class="tm-cal-target-panel-count">{items.length}</span>
	</div>

	<div class="tm-cal-target-panel-list">
		{#if items.length === 0}
			<div class="tm-cal-target-panel-empty">
				<Icon name="target" size={18} />
				<span>No targets this period</span>
			</div>
		{:else}
			{#each items as item (item.file.path)}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<div
					class="tm-cal-target-item"
					class:tm-cal-target-item--past={isPast(item)}
					draggable={true}
					on:dragstart={(e) => {
						setDragPayload({ type: "file", filePath: item.file.path });
						e.dataTransfer?.setData("text/plain", item.file.path);
					}}
					on:dragend={() => setDragPayload(null)}
					on:click={(e) => previewFile(item.file, item.target, e.currentTarget)}
					role="button"
					tabindex="0"
					title="Drag to calendar to update target date · Click to preview"
				>
					<div class="tm-cal-target-item-name">{fileName(item.file)}</div>
					<div class="tm-cal-target-item-date">{periodLabel(item)}</div>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.tm-cal-target-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		width: 200px;
		flex-shrink: 0;
		border-right: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
		overflow: hidden;
	}

	.tm-cal-target-panel-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px 8px;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tm-cal-target-panel-title {
		font-size: var(--font-ui-small);
		font-weight: 600;
		color: var(--text-normal);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.tm-cal-target-panel-count {
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		color: var(--text-on-accent);
		background: var(--interactive-accent);
		border-radius: 10px;
		padding: 1px 6px;
		min-width: 18px;
		text-align: center;
	}

	.tm-cal-target-panel-list {
		flex: 1;
		overflow-y: auto;
		padding: 6px 0;
	}

	.tm-cal-target-panel-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 32px 12px;
		color: var(--text-faint);
		font-size: var(--font-ui-smaller);
		text-align: center;
	}

	.tm-cal-target-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 12px;
		cursor: pointer;
		border-left: 3px solid transparent;
		transition: background 80ms ease, border-color 80ms ease;
	}
	.tm-cal-target-item:hover {
		background: var(--background-modifier-hover);
		border-left-color: var(--interactive-accent);
	}

	.tm-cal-target-item--past .tm-cal-target-item-name {
		color: var(--text-muted);
	}
	.tm-cal-target-item--past .tm-cal-target-item-date {
		color: var(--text-error, var(--text-faint));
	}

	.tm-cal-target-item-name {
		font-size: var(--font-ui-small);
		font-weight: 500;
		color: var(--text-normal);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tm-cal-target-item-date {
		font-size: var(--font-ui-smaller);
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
