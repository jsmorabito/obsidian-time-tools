/**
 * CalendarService
 *
 * Responsible for fetching, caching, and querying calendar events from all
 * enabled CalendarSource entries in the plugin settings.
 *
 * Sources are fetched lazily and cached in memory for TTL_MS (15 minutes).
 * A manual `invalidate()` call clears the cache (e.g. after settings change).
 */

import { moment, requestUrl } from "obsidian";
import type TimeManagerPlugin from "../main";
import { parseICS, isEventOnDate } from "./ics-parser";
import type { CalendarEvent, CalendarSource } from "./types";
// eslint-disable-next-line no-restricted-imports
import type { Moment } from "moment";

const TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
	events: CalendarEvent[];
	fetchedAt: number;
}

export class CalendarService {
	private readonly cache = new Map<string, CacheEntry>();

	constructor(private readonly plugin: TimeManagerPlugin) {}

	/**
	 * Return all events that overlap the given calendar day, sorted by start time
	 * (all-day events first, then chronological).
	 */
	async getEventsForDate(date: ReturnType<typeof moment>): Promise<CalendarEvent[]> {
		const all = await this.getAllEvents();
		return all
			.filter((e) => isEventOnDate(e, date))
			.sort((a, b) => {
				// All-day events float to the top
				if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
				return a.start.valueOf() - b.start.valueOf();
			});
	}

	/**
	 * Return all events that overlap [rangeStart, rangeEnd], grouped by calendar day.
	 * Days with no events are omitted from the map.
	 * Keys are YYYY-MM-DD strings.
	 */
	async getEventsForRange(
		rangeStart: Moment,
		rangeEnd: Moment
	): Promise<Map<string, CalendarEvent[]>> {
		const all = await this.getAllEvents();
		const result = new Map<string, CalendarEvent[]>();

		const cursor = rangeStart.clone().startOf("day");
		const end = rangeEnd.clone().endOf("day");

		while (cursor.isSameOrBefore(end, "day")) {
			const eventsOnDay = all
				.filter((e) => isEventOnDate(e, cursor))
				.sort((a, b) => {
					if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
					return a.start.valueOf() - b.start.valueOf();
				});
			if (eventsOnDay.length > 0) {
				result.set(cursor.format("YYYY-MM-DD"), eventsOnDay);
			}
			cursor.add(1, "day");
		}

		return result;
	}

	/** Force-refresh a specific source (or all sources if no id given). */
	invalidate(sourceId?: string): void {
		if (sourceId) {
			this.cache.delete(sourceId);
		} else {
			this.cache.clear();
		}
	}

	// ── Private ─────────────────────────────────────────────────────────────────

	private async getAllEvents(): Promise<CalendarEvent[]> {
		const sources = this.plugin.settings.calendarSources.filter((s) => s.enabled);
		const batches = await Promise.all(sources.map((s) => this.getEventsForSource(s)));
		return batches.flat();
	}

	private async getEventsForSource(source: CalendarSource): Promise<CalendarEvent[]> {
		const cached = this.cache.get(source.id);
		if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
			return cached.events;
		}

		try {
			const text = source.type === "url"
				? await this.fetchURL(source.value)
				: await this.readVaultFile(source.value);

			const events = parseICS(text, source.id, source.color);
			this.cache.set(source.id, { events, fetchedAt: Date.now() });
			return events;
		} catch (err) {
			console.error(`[time-tools] Calendar source "${source.name}" failed:`, err);
			// Return stale data rather than nothing if we have it.
			return cached?.events ?? [];
		}
	}

	private async fetchURL(url: string): Promise<string> {
		const resp = await requestUrl({ url, method: "GET" });
		if (resp.status < 200 || resp.status >= 300) {
			throw new Error(`HTTP ${resp.status}`);
		}
		return resp.text;
	}

	private async readVaultFile(vaultPath: string): Promise<string> {
		return this.plugin.app.vault.adapter.read(vaultPath);
	}
}
