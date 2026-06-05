<script lang="ts">
	/**
	 * CalendarGrid — day / week / month / year views for the CalendarView tab.
	 *
	 * Day view:   hourly time grid with events; open/create daily note button.
	 * Week view:  7 day columns with events and note buttons.
	 * Month view: 5–6 week rows × 7 day cells with note dots and event dots.
	 * Year view:  4×3 mini-month grid with note dots and today highlight.
	 */
	import { moment } from "obsidian";
	import type TimeManagerPlugin from "../main";
	import type { CalendarEvent } from "./types";
	import { getPeriodicNote, createPeriodicNote } from "../periodic/api";
	import Icon from "../utils/Icon.svelte";

	// ── Props ────────────────────────────────────────────────────────────────

	export let plugin: TimeManagerPlugin;
	/** "day" | "week" | "month" | "year" — persisted via CalendarView getState/setState */
	export let viewType: "day" | "week" | "month" | "year" = "month";
	/** ISO date string (YYYY-MM-DD) used as the anchor for the visible range */
	export let anchorDate: string = moment().format("YYYY-MM-DD");

	// ── Internal state ────────────────────────────────────────────────────────

	let anchor = moment(anchorDate, "YYYY-MM-DD");
	let eventsByDay: Map<string, CalendarEvent[]> = new Map();
	let loading = false;

	// Day-of-week header labels (Mon-first, ISO weeks)
	const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
	const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
	const HOURS = Array.from({ length: 24 }, (_, i) => i);

	// ── Exported accessors for state persistence ──────────────────────────────

	export function getViewType(): "day" | "week" | "month" | "year" { return viewType; }
	export function getAnchorDate(): string { return anchor.format("YYYY-MM-DD"); }

	// ── Derived grid data ─────────────────────────────────────────────────────

	$: weekEnabled = plugin.settings.week.enabled;
	$: dayEnabled  = plugin.settings.day.enabled;

	$: title = viewType === "month" ? anchor.format("MMMM YYYY")
	         : viewType === "week"  ? `Week ${anchor.isoWeek()} · ${anchor.format("YYYY")}`
	         : viewType === "day"   ? anchor.format("ddd, MMM D, YYYY")
	         :                        anchor.format("YYYY");

	$: monthWeeks  = buildMonthGrid(anchor);
	$: weekDays    = buildWeekDays(anchor);
	$: yearMonths  = buildYearMonths(anchor);

	$: rangeStart = viewType === "month" ? anchor.clone().startOf("month").startOf("isoWeek")
	              : viewType === "week"  ? anchor.clone().startOf("isoWeek")
	              : viewType === "day"   ? anchor.clone().startOf("day")
	              :                        anchor.clone().startOf("year");
	$: rangeEnd = viewType === "month" ? anchor.clone().endOf("month").endOf("isoWeek")
	            : viewType === "week"  ? anchor.clone().endOf("isoWeek")
	            : viewType === "day"   ? anchor.clone().endOf("day")
	            :                        anchor.clone().endOf("year");

	$: gridColumns = weekEnabled
		? "32px repeat(7, 1fr)"
		: "repeat(7, 1fr)";

	// Day view — split events into all-day and timed
	$: dayAllEvents   = eventsForDay(anchor);
	$: dayAllDayEvts  = dayAllEvents.filter(e => e.allDay);
	$: dayTimedEvts   = dayAllEvents.filter(e => !e.allDay);

	// ── Fetch events ──────────────────────────────────────────────────────────

	$: void fetchEvents(rangeStart, rangeEnd);

	async function fetchEvents(
		start: ReturnType<typeof moment>,
		end: ReturnType<typeof moment>
	): Promise<void> {
		if (!plugin.settings.calendarSources.some((s) => s.enabled)) return;
		loading = true;
		try {
			eventsByDay = await plugin.calendarService.getEventsForRange(start, end);
		} catch (e) {
			console.error("[time-tools] CalendarGrid:", e);
		} finally {
			loading = false;
		}
	}

	// ── Grid helpers ──────────────────────────────────────────────────────────

	function buildMonthGrid(d: ReturnType<typeof moment>): ReturnType<typeof moment>[][] {
		const start = d.clone().startOf("month").startOf("isoWeek");
		const end   = d.clone().endOf("month").endOf("isoWeek");
		const weeks: ReturnType<typeof moment>[][] = [];
		let cur = start.clone();
		while (cur.isSameOrBefore(end, "day")) {
			const week = Array.from({ length: 7 }, () => { const x = cur.clone(); cur.add(1, "day"); return x; });
			weeks.push(week);
		}
		return weeks;
	}

	function buildWeekDays(d: ReturnType<typeof moment>): ReturnType<typeof moment>[] {
		const start = d.clone().startOf("isoWeek");
		return Array.from({ length: 7 }, (_, i) => start.clone().add(i, "day"));
	}

	function buildYearMonths(d: ReturnType<typeof moment>): Array<{ m: ReturnType<typeof moment>; weeks: ReturnType<typeof moment>[][] }> {
		return Array.from({ length: 12 }, (_, i) => {
			const m = d.clone().startOf("year").add(i, "month");
			return { m, weeks: buildMonthGrid(m) };
		});
	}

	function dayKey(d: ReturnType<typeof moment>): string { return d.format("YYYY-MM-DD"); }
	function isToday(d: ReturnType<typeof moment>): boolean { return d.isSame(moment(), "day"); }
	function isCurrentMonth(d: ReturnType<typeof moment>): boolean { return d.isSame(anchor, "month"); }

	function eventsForDay(d: ReturnType<typeof moment>): CalendarEvent[] {
		return eventsByDay.get(dayKey(d)) ?? [];
	}

	function noteExistsForDay(d: ReturnType<typeof moment>): boolean {
		if (!dayEnabled) return false;
		return !!getPeriodicNote(plugin, "day", d);
	}

	function weekNoteExists(d: ReturnType<typeof moment>): boolean {
		if (!weekEnabled) return false;
		return !!getPeriodicNote(plugin, "week", d);
	}

	function formatHour(h: number): string {
		if (h === 0)  return "12 AM";
		if (h < 12)   return `${h} AM`;
		if (h === 12) return "12 PM";
		return `${h - 12} PM`;
	}

	function eventsForHour(h: number): CalendarEvent[] {
		return dayTimedEvts.filter(e => e.start.hour() === h);
	}

	// ── Actions ───────────────────────────────────────────────────────────────

	async function openDay(d: ReturnType<typeof moment>): Promise<void> {
		if (!dayEnabled) return;
		let note = getPeriodicNote(plugin, "day", d);
		if (!note) note = await createPeriodicNote(plugin, "day", d);
		await plugin.app.workspace.getLeaf(false).openFile(note);
	}

	async function openWeek(d: ReturnType<typeof moment>): Promise<void> {
		if (!weekEnabled) return;
		let note = getPeriodicNote(plugin, "week", d);
		if (!note) note = await createPeriodicNote(plugin, "week", d);
		await plugin.app.workspace.getLeaf(false).openFile(note);
	}

	// ── Navigation ────────────────────────────────────────────────────────────

	function navigate(dir: -1 | 1): void {
		if      (viewType === "month") anchor = anchor.clone().add(dir, "month");
		else if (viewType === "week")  anchor = anchor.clone().add(dir, "week");
		else if (viewType === "day")   anchor = anchor.clone().add(dir, "day");
		else                           anchor = anchor.clone().add(dir, "year");
		anchorDate = anchor.format("YYYY-MM-DD");
	}

	function goToday(): void {
		anchor = moment();
		anchorDate = anchor.format("YYYY-MM-DD");
	}

	function switchView(v: "day" | "week" | "month" | "year"): void {
		viewType = v;
	}
</script>

<div class="tm-cal">
	<!-- ── Header ──────────────────────────────────────────────────────────── -->
	<div class="tm-cal-header">
		<div class="tm-cal-nav">
			<button class="tm-cal-nav-btn" on:click={() => navigate(-1)} aria-label="Previous">
				<Icon name="chevron-left" size={16} />
			</button>
			<button class="tm-cal-nav-btn" on:click={() => navigate(1)} aria-label="Next">
				<Icon name="chevron-right" size={16} />
			</button>
			<h2 class="tm-cal-title">{title}</h2>
			{#if loading}
				<span class="tm-cal-loading">…</span>
			{/if}
		</div>

		<div class="tm-cal-header-right">
			<button
				class="tm-cal-today-btn"
				on:click={goToday}
				title="Go to today"
			>Today</button>

			<div class="tm-cal-view-toggle">
				<button
					class="tm-cal-view-btn"
					class:tm-cal-view-btn--active={viewType === "day"}
					on:click={() => switchView("day")}
				>Day</button>
				<button
					class="tm-cal-view-btn"
					class:tm-cal-view-btn--active={viewType === "week"}
					on:click={() => switchView("week")}
				>Week</button>
				<button
					class="tm-cal-view-btn"
					class:tm-cal-view-btn--active={viewType === "month"}
					on:click={() => switchView("month")}
				>Month</button>
				<button
					class="tm-cal-view-btn"
					class:tm-cal-view-btn--active={viewType === "year"}
					on:click={() => switchView("year")}
				>Year</button>
			</div>
		</div>
	</div>

	<!-- ── Day view ────────────────────────────────────────────────────────── -->
	{#if viewType === "day"}
		{@const dayExists = noteExistsForDay(anchor)}
		<div class="tm-cal-day-view">
			<!-- Note button -->
			{#if dayEnabled}
				<div class="tm-cal-day-note-row">
					<button
						class="tm-cal-day-note-btn"
						class:tm-cal-day-note-btn--exists={dayExists}
						on:click={() => void openDay(anchor)}
					>
						{#if dayExists}
							<Icon name="file-text" size={13} />
							Open daily note
						{:else}
							<Icon name="file-plus" size={13} />
							Create daily note
						{/if}
					</button>
				</div>
			{/if}

			<!-- All-day events -->
			{#if dayAllDayEvts.length > 0}
				<div class="tm-cal-day-allday">
					<span class="tm-cal-day-allday-label">All day</span>
					<div class="tm-cal-day-allday-events">
						{#each dayAllDayEvts as evt (evt.uid)}
							<div
								class="tm-cal-day-allday-evt"
								style={evt.sourceColor ? `background:color-mix(in srgb, ${evt.sourceColor} 20%, transparent); border-left-color:${evt.sourceColor}` : ""}
								title={evt.summary}
							>{evt.summary}</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Hourly time grid -->
			<div class="tm-cal-day-slots">
				{#each HOURS as hour (hour)}
					{@const hourEvts = eventsForHour(hour)}
					<div class="tm-cal-day-slot" class:tm-cal-day-slot--current={moment().hour() === hour && isToday(anchor)}>
						<span class="tm-cal-day-slot-label">{formatHour(hour)}</span>
						<div class="tm-cal-day-slot-body">
							{#each hourEvts as evt (evt.uid)}
								<div
									class="tm-cal-day-slot-evt"
									style={evt.sourceColor ? `border-left-color:${evt.sourceColor}` : ""}
									title={evt.summary}
								>
									<span class="tm-cal-day-slot-evt-time">
										{evt.start.format("h:mm")}{evt.end ? `–${evt.end.format("h:mm a")}` : " a"}
									</span>
									<span class="tm-cal-day-slot-evt-title">{evt.summary}</span>
								</div>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

	<!-- ── Month view ──────────────────────────────────────────────────────── -->
	{:else if viewType === "month"}
		<div class="tm-cal-month-grid" style="grid-template-columns: {gridColumns}">
			<!-- Column headers -->
			{#if weekEnabled}<div class="tm-cal-week-label-header"></div>{/if}
			{#each DAY_LABELS as label}
				<div class="tm-cal-day-header">{label}</div>
			{/each}

			<!-- Week rows -->
			{#each monthWeeks as week}
				<!-- Week number -->
				{#if weekEnabled}
					{@const wExists = weekNoteExists(week[0])}
					<button
						class="tm-cal-week-num"
						class:tm-cal-week-num--exists={wExists}
						on:click={() => void openWeek(week[0])}
						title="Week {week[0].isoWeek()} — {wExists ? 'open' : 'create'} weekly note"
					>W{week[0].isoWeek()}</button>
				{/if}

				<!-- Day cells -->
				{#each week as day (dayKey(day))}
					{@const events = eventsForDay(day)}
					{@const exists = noteExistsForDay(day)}
					{@const today  = isToday(day)}
					{@const inMonth = isCurrentMonth(day)}
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div
						class="tm-cal-day-cell"
						class:tm-cal-day-cell--today={today}
						class:tm-cal-day-cell--other-month={!inMonth}
						on:click={() => void openDay(day)}
						role="button"
						tabindex={dayEnabled ? 0 : -1}
						title="{day.format('ddd, MMM D')} — {exists ? 'open' : 'create'} note"
					>
						<span class="tm-cal-day-num" class:tm-cal-day-num--today={today}>{day.date()}</span>

						<!-- Note existence dot -->
						{#if dayEnabled}
							<span
								class="tm-cal-note-dot"
								class:tm-cal-note-dot--exists={exists}
								aria-label={exists ? "Note exists" : "No note"}
							></span>
						{/if}

						<!-- Event dots (up to 3 + overflow count) -->
						{#if events.length > 0}
							<div class="tm-cal-event-dots">
								{#each events.slice(0, 3) as evt (evt.uid)}
									<span
										class="tm-cal-event-dot"
										style={evt.sourceColor ? `background:${evt.sourceColor}` : ""}
										title={evt.summary}
									></span>
								{/each}
								{#if events.length > 3}
									<span class="tm-cal-event-more">+{events.length - 3}</span>
								{/if}
							</div>
						{/if}
					</div>
				{/each}
			{/each}
		</div>

	<!-- ── Week view ───────────────────────────────────────────────────────── -->
	{:else if viewType === "week"}
		<div class="tm-cal-week-grid">
			{#each weekDays as day (dayKey(day))}
				{@const events  = eventsForDay(day)}
				{@const exists  = noteExistsForDay(day)}
				{@const today   = isToday(day)}
				<div class="tm-cal-week-col" class:tm-cal-week-col--today={today}>
					<!-- Day header -->
					<div class="tm-cal-week-col-header">
						<span class="tm-cal-week-day-name">{day.format("ddd")}</span>
						<button
							class="tm-cal-week-day-num"
							class:tm-cal-week-day-num--today={today}
							on:click={() => void openDay(day)}
							title="{day.format('MMM D')} — {exists ? 'open' : 'create'} note"
						>{day.date()}</button>
					</div>

					<!-- Note open/create button -->
					{#if dayEnabled}
						<button
							class="tm-cal-week-note-btn"
							class:tm-cal-week-note-btn--exists={exists}
							on:click={() => void openDay(day)}
						>
							{#if exists}
								<Icon name="file-text" size={12} />
								Open note
							{:else}
								<Icon name="file-plus" size={12} />
								Create note
							{/if}
						</button>
					{/if}

					<!-- Events list -->
					<div class="tm-cal-week-events">
						{#if events.length === 0}
							<span class="tm-cal-week-no-events">No events</span>
						{:else}
							{#each events as evt (evt.uid)}
								<div
									class="tm-cal-week-event"
									class:tm-cal-week-event--allday={evt.allDay}
									style={evt.sourceColor ? `border-left-color:${evt.sourceColor}` : ""}
									title={evt.summary}
								>
									<span class="tm-cal-week-event-time">
										{#if evt.allDay}All day
										{:else if evt.end}{evt.start.format("h:mm")}–{evt.end.format("h:mm a")}
										{:else}{evt.start.format("h:mm a")}
										{/if}
									</span>
									<span class="tm-cal-week-event-title">{evt.summary}</span>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/each}
		</div>

	<!-- ── Year view ───────────────────────────────────────────────────────── -->
	{:else}
		<div class="tm-cal-year-grid">
			{#each yearMonths as { m, weeks } (m.month())}
				<div class="tm-cal-year-month">
					<div class="tm-cal-year-month-name">{m.format("MMMM")}</div>
					<div class="tm-cal-year-mini-grid">
						<!-- Day-of-week letters -->
						{#each DAY_LETTERS as letter, i (i)}
							<div class="tm-cal-year-dow">{letter}</div>
						{/each}
						<!-- Day cells -->
						{#each weeks as week}
							{#each week as day (dayKey(day))}
								{@const today   = isToday(day)}
								{@const inMonth = day.isSame(m, "month")}
								{@const exists  = noteExistsForDay(day)}
								<!-- svelte-ignore a11y-click-events-have-key-events -->
								<div
									class="tm-cal-year-day"
									class:tm-cal-year-day--today={today}
									class:tm-cal-year-day--other-month={!inMonth}
									class:tm-cal-year-day--has-note={exists && inMonth}
									on:click={() => inMonth && void openDay(day)}
									role="button"
									tabindex={dayEnabled && inMonth ? 0 : -1}
									title={inMonth ? `${day.format("MMM D")} — ${exists ? "open" : "create"} note` : ""}
								>
									{day.date()}
									{#if exists && inMonth}
										<span class="tm-cal-year-note-dot"></span>
									{/if}
								</div>
							{/each}
						{/each}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* ── Shell ── */
	.tm-cal {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: var(--background-primary);
	}

	/* ── Header ── */
	.tm-cal-header {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		border-bottom: 1px solid var(--background-modifier-border);
		gap: 12px;
	}

	.tm-cal-nav {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.tm-cal-nav-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-s);
		color: var(--text-muted);
		transition: background 80ms ease, color 80ms ease;
	}
	.tm-cal-nav-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }

	.tm-cal-title {
		margin: 0 8px;
		font-size: var(--font-ui-medium);
		font-weight: 600;
		color: var(--text-normal);
		white-space: nowrap;
	}

	.tm-cal-loading {
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
		margin-left: 4px;
	}

	.tm-cal-header-right {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.tm-cal-today-btn {
		all: unset;
		cursor: pointer;
		padding: 3px 10px;
		border-radius: var(--radius-s);
		font-size: var(--font-ui-small);
		font-weight: 500;
		color: var(--text-muted);
		border: 1px solid var(--background-modifier-border);
		transition: background 80ms ease, color 80ms ease;
	}
	.tm-cal-today-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }

	.tm-cal-view-toggle {
		display: flex;
		border: 1px solid var(--background-modifier-border);
		border-radius: var(--radius-s);
		overflow: hidden;
	}

	.tm-cal-view-btn {
		all: unset;
		cursor: pointer;
		padding: 3px 10px;
		font-size: var(--font-ui-small);
		font-weight: 500;
		color: var(--text-muted);
		transition: background 80ms ease, color 80ms ease;
	}
	.tm-cal-view-btn:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
	.tm-cal-view-btn--active {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}

	/* ── Day view ── */
	.tm-cal-day-view {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.tm-cal-day-note-row {
		flex-shrink: 0;
		padding: 8px 16px 4px;
		border-bottom: 1px solid var(--background-modifier-border);
	}

	.tm-cal-day-note-btn {
		all: unset;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 12px;
		border-radius: var(--radius-s);
		border: 1px dashed var(--background-modifier-border);
		font-size: var(--font-ui-small);
		color: var(--text-faint);
		transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
	}
	.tm-cal-day-note-btn:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
		border-color: var(--background-modifier-border-hover, var(--background-modifier-border));
	}
	.tm-cal-day-note-btn--exists {
		border-style: solid;
		color: var(--text-muted);
	}
	.tm-cal-day-note-btn--exists:hover { color: var(--text-accent); }

	.tm-cal-day-allday {
		flex-shrink: 0;
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 6px 16px;
		border-bottom: 1px solid var(--background-modifier-border);
		background: var(--background-secondary);
	}

	.tm-cal-day-allday-label {
		flex-shrink: 0;
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
		padding-top: 2px;
		min-width: 46px;
		text-align: right;
	}

	.tm-cal-day-allday-events {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tm-cal-day-allday-evt {
		font-size: var(--font-ui-smaller);
		padding: 2px 8px;
		border-radius: var(--radius-s);
		border-left: 3px solid var(--interactive-accent);
		background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
		color: var(--text-normal);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 240px;
	}

	.tm-cal-day-slots {
		flex: 1;
		overflow-y: auto;
	}

	.tm-cal-day-slot {
		display: flex;
		align-items: flex-start;
		gap: 0;
		border-bottom: 1px solid var(--background-modifier-border);
		min-height: 44px;
	}
	.tm-cal-day-slot--current {
		background: color-mix(in srgb, var(--interactive-accent) 4%, var(--background-primary));
	}

	.tm-cal-day-slot-label {
		flex-shrink: 0;
		width: 56px;
		padding: 12px 8px 0 16px;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--text-faint);
		text-align: right;
		line-height: 1;
	}
	.tm-cal-day-slot--current .tm-cal-day-slot-label {
		color: var(--interactive-accent);
		font-weight: 600;
	}

	.tm-cal-day-slot-body {
		flex: 1;
		padding: 4px 8px 4px 12px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.tm-cal-day-slot-evt {
		font-size: var(--font-ui-smaller);
		padding: 3px 8px;
		border-radius: var(--radius-s);
		background: var(--background-secondary);
		border-left: 3px solid var(--interactive-accent);
		display: flex;
		flex-direction: column;
		gap: 1px;
		overflow: hidden;
	}

	.tm-cal-day-slot-evt-time {
		font-size: 10px;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.tm-cal-day-slot-evt-title {
		color: var(--text-normal);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Month grid ── */
	.tm-cal-month-grid {
		flex: 1;
		display: grid;
		/* grid-template-columns set inline via style prop */
		grid-auto-rows: 1fr;
		gap: 1px;
		background: var(--background-modifier-border);
		overflow: hidden;
	}

	.tm-cal-week-label-header,
	.tm-cal-day-header {
		background: var(--background-primary);
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		text-align: center;
		padding: 6px 4px 4px;
	}

	/* Week number column */
	.tm-cal-week-num {
		all: unset;
		cursor: pointer;
		background: var(--background-secondary);
		font-size: var(--font-ui-smallest);
		font-weight: 600;
		color: var(--text-faint);
		text-align: center;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 80ms ease, color 80ms ease;
	}
	.tm-cal-week-num:hover { background: var(--background-modifier-hover); color: var(--text-accent); }
	.tm-cal-week-num--exists { color: var(--text-muted); }

	/* Day cell */
	.tm-cal-day-cell {
		background: var(--background-primary);
		padding: 4px 6px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 3px;
		transition: background 60ms ease;
		min-height: 0;
		overflow: hidden;
	}
	.tm-cal-day-cell:hover { background: var(--background-modifier-hover); }
	.tm-cal-day-cell--other-month { background: var(--background-secondary); }
	.tm-cal-day-cell--other-month:hover { background: var(--background-modifier-hover); }

	.tm-cal-day-num {
		font-size: var(--font-ui-small);
		font-weight: 500;
		color: var(--text-muted);
		line-height: 1.2;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.tm-cal-day-num--today {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-weight: 700;
	}
	.tm-cal-day-cell--other-month .tm-cal-day-num { color: var(--text-faint); }

	/* Note existence dot */
	.tm-cal-note-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		border: 1.5px solid var(--text-faint);
		background: transparent;
		transition: background 80ms ease, border-color 80ms ease;
	}
	.tm-cal-note-dot--exists {
		background: var(--interactive-accent);
		border-color: var(--interactive-accent);
	}

	/* Event dots row */
	.tm-cal-event-dots {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-wrap: wrap;
		flex-shrink: 0;
	}
	.tm-cal-event-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		background: var(--interactive-accent);
	}
	.tm-cal-event-more {
		font-size: 9px;
		color: var(--text-faint);
		line-height: 1;
	}

	/* ── Week grid ── */
	.tm-cal-week-grid {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1px;
		background: var(--background-modifier-border);
		overflow: hidden;
	}

	.tm-cal-week-col {
		background: var(--background-primary);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.tm-cal-week-col--today {
		background: color-mix(in srgb, var(--interactive-accent) 5%, var(--background-primary));
	}

	.tm-cal-week-col-header {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px 4px 8px;
		border-bottom: 1px solid var(--background-modifier-border);
		gap: 4px;
	}

	.tm-cal-week-day-name {
		font-size: var(--font-ui-smaller);
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.tm-cal-week-day-num {
		all: unset;
		cursor: pointer;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-ui-medium);
		font-weight: 500;
		color: var(--text-muted);
		transition: background 80ms ease, color 80ms ease;
	}
	.tm-cal-week-day-num:hover { background: var(--background-modifier-hover); color: var(--text-normal); }
	.tm-cal-week-day-num--today {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-weight: 700;
	}
	.tm-cal-week-day-num--today:hover { background: var(--interactive-accent-hover); }

	/* Note button */
	.tm-cal-week-note-btn {
		all: unset;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
		margin: 6px 8px 2px;
		padding: 4px 8px;
		border-radius: var(--radius-s);
		border: 1px dashed var(--background-modifier-border);
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
		transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
		flex-shrink: 0;
	}
	.tm-cal-week-note-btn:hover {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
		border-color: var(--background-modifier-border-hover, var(--background-modifier-border));
	}
	.tm-cal-week-note-btn--exists {
		border-style: solid;
		color: var(--text-muted);
		border-color: var(--background-modifier-border);
	}
	.tm-cal-week-note-btn--exists:hover { color: var(--text-accent); }

	/* Events list */
	.tm-cal-week-events {
		flex: 1;
		overflow-y: auto;
		padding: 4px 6px 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.tm-cal-week-no-events {
		font-size: var(--font-ui-smaller);
		color: var(--text-faint);
		text-align: center;
		padding: 8px 0;
	}

	.tm-cal-week-event {
		font-size: var(--font-ui-smaller);
		padding: 3px 6px;
		border-radius: var(--radius-s);
		background: var(--background-secondary);
		border-left: 3px solid var(--interactive-accent);
		display: flex;
		flex-direction: column;
		gap: 1px;
		cursor: default;
		overflow: hidden;
	}
	.tm-cal-week-event--allday {
		background: color-mix(in srgb, var(--interactive-accent) 10%, transparent);
	}

	.tm-cal-week-event-time {
		font-size: 10px;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.tm-cal-week-event-title {
		color: var(--text-normal);
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ── Year grid ── */
	.tm-cal-year-grid {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-template-rows: repeat(3, 1fr);
		gap: 1px;
		background: var(--background-modifier-border);
		overflow: hidden;
		padding: 0;
	}

	.tm-cal-year-month {
		background: var(--background-primary);
		display: flex;
		flex-direction: column;
		padding: 10px 8px 8px;
		min-height: 0;
		overflow: hidden;
	}

	.tm-cal-year-month-name {
		font-size: var(--font-ui-small);
		font-weight: 600;
		color: var(--text-normal);
		margin-bottom: 6px;
		flex-shrink: 0;
	}

	.tm-cal-year-mini-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 1px;
		flex: 1;
	}

	.tm-cal-year-dow {
		font-size: 9px;
		font-weight: 600;
		color: var(--text-faint);
		text-align: center;
		text-transform: uppercase;
		padding-bottom: 2px;
	}

	.tm-cal-year-day {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 10px;
		font-variant-numeric: tabular-nums;
		color: var(--text-muted);
		border-radius: 50%;
		aspect-ratio: 1;
		cursor: pointer;
		transition: background 60ms ease;
		line-height: 1;
	}
	.tm-cal-year-day:hover:not(.tm-cal-year-day--other-month) {
		background: var(--background-modifier-hover);
		color: var(--text-normal);
	}
	.tm-cal-year-day--other-month {
		color: var(--text-faint);
		opacity: 0.35;
		cursor: default;
		pointer-events: none;
	}
	.tm-cal-year-day--today {
		background: var(--interactive-accent);
		color: var(--text-on-accent);
		font-weight: 700;
	}
	.tm-cal-year-day--today:hover { background: var(--interactive-accent-hover); }
	.tm-cal-year-day--has-note {
		font-weight: 600;
		color: var(--text-normal);
	}

	.tm-cal-year-note-dot {
		position: absolute;
		bottom: 1px;
		left: 50%;
		transform: translateX(-50%);
		width: 3px;
		height: 3px;
		border-radius: 50%;
		background: var(--interactive-accent);
	}
	.tm-cal-year-day--today .tm-cal-year-note-dot {
		background: var(--text-on-accent);
	}
</style>
