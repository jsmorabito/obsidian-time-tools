// Periodic-notes scope for MVP: day / week / month.
// Quarter and year are tracked in docs/deferred-features.md and intentionally
// excluded from the type union to keep settings and command registration tight.
export type Granularity = "day" | "week" | "month";

export const granularities: Granularity[] = ["day", "week", "month"];

export interface PeriodicConfig {
	enabled: boolean;
	format: string;
	folder: string;
	templatePath: string;
}

export interface DisplayConfig {
	periodicity: string;
	relativeUnit: string;
	labelOpenPresent: string;
	icon: string;
}

export const displayConfigs: Record<Granularity, DisplayConfig> = {
	day: {
		periodicity: "daily",
		relativeUnit: "today",
		labelOpenPresent: "Open today's daily note",
		icon: "calendar-day",
	},
	week: {
		periodicity: "weekly",
		relativeUnit: "this week",
		labelOpenPresent: "Open this week's note",
		icon: "calendar-week",
	},
	month: {
		periodicity: "monthly",
		relativeUnit: "this month",
		labelOpenPresent: "Open this month's note",
		icon: "calendar-month",
	},
};
