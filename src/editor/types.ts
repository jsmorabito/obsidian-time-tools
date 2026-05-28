export type TimeRange =
	| "all"
	| "week"
	| "month"
	| "quarter"
	| "year"
	| "last-week"
	| "last-month"
	| "last-quarter"
	| "last-year"
	| "custom";

export type SelectionMode = "daily" | "folder" | "tag" | "horizon";

export type TimeField =
	| "ctime"
	| "mtime"
	| "ctimeReverse"
	| "mtimeReverse"
	| "name"
	| "nameReverse"
	| "date"
	| "dateReverse";

export interface CustomRange {
	start: string; // ISO date YYYY-MM-DD
	end: string;   // ISO date YYYY-MM-DD
}
