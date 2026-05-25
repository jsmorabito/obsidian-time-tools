import type { Granularity } from "./types";

export const DEFAULT_DAILY_NOTE_FORMAT = "YYYY-MM-DD";
export const DEFAULT_WEEKLY_NOTE_FORMAT = "gggg-[W]ww";
export const DEFAULT_MONTHLY_NOTE_FORMAT = "YYYY-MM";

export const DEFAULT_FORMAT: Record<Granularity, string> = Object.freeze({
	day: DEFAULT_DAILY_NOTE_FORMAT,
	week: DEFAULT_WEEKLY_NOTE_FORMAT,
	month: DEFAULT_MONTHLY_NOTE_FORMAT,
}) as Record<Granularity, string>;

export const HUMANIZE_FORMAT: Record<Granularity, string> = Object.freeze({
	day: "YYYY-MM-DD",
	week: "YYYY [W]ww",
	month: "MMMM YYYY",
}) as Record<Granularity, string>;
