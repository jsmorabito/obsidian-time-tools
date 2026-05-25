// MVP scope: only `daily` selection mode (no folder/tag) and a subset of time
// ranges. The wider ranges are tracked in docs/deferred-features.md.
export type TimeRange =
	| "all"
	| "week"
	| "month"
	| "year"
	| "last-week"
	| "last-month"
	| "last-year";

export type SelectionMode = "daily";

export type TimeField =
	| "ctime"
	| "mtime"
	| "ctimeReverse"
	| "mtimeReverse"
	| "name"
	| "nameReverse";
