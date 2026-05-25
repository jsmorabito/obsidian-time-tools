// Rewritten from quorafind/Obsidian-Daily-Notes-Editor (MIT).
//
// The original FileManager consumed `obsidian-daily-notes-interface` to know
// the daily-note format/folder. We removed that dependency: the editor view
// now reads its source of truth from our own periodic-notes module so the
// two halves of this plugin share a single configuration.
//
// MVP scope: daily mode only. Folder mode, tag mode, custom range, and
// quarterly time ranges are tracked in docs/deferred-features.md.
import { App, moment, TFile } from "obsidian";
import { createPeriodicNote } from "../periodic/api";
import { findPeriodicNotes } from "../periodic/discovery";
import type { PeriodicResolver } from "../periodic/api";
import type { TimeField, TimeRange } from "./types";

export interface FileManagerOptions {
	resolver: PeriodicResolver;
	app: App;
	timeRange: TimeRange;
	timeField: TimeField;
}

export class FileManager {
	private allFiles: TFile[] = [];
	private filteredFiles: TFile[] = [];
	private hasCurrentDay = true;

	public options: FileManagerOptions;

	constructor(options: FileManagerOptions) {
		this.options = options;
		this.fetchFiles();
	}

	private parseTimeField(): { isReverse: boolean; base: string } {
		const field = this.options.timeField || "mtime";
		const isReverse = field.endsWith("Reverse");
		const base = isReverse ? field.replace("Reverse", "") : field;
		return { isReverse, base };
	}

	private sortFiles(files: TFile[]): TFile[] {
		const { isReverse, base } = this.parseTimeField();
		return [...files].sort((a, b) => {
			if (base === "name") {
				const cmp = a.name.localeCompare(b.name);
				return isReverse ? -cmp : cmp;
			}
			// ctime / mtime: newest first by default, reverse flips it.
			const aStat = a.stat as unknown as Record<string, number>;
			const bStat = b.stat as unknown as Record<string, number>;
			const aTime = aStat[base] ?? 0;
			const bTime = bStat[base] ?? 0;
			return isReverse ? aTime - bTime : bTime - aTime;
		});
	}

	private fetchFiles(): void {
		const dayConfig = this.options.resolver.getConfig("day");
		const matches = findPeriodicNotes(this.options.app, dayConfig, "day");
		this.allFiles = this.sortFiles(matches.map((m) => m.file));
		this.checkDailyNote();
		this.filterFilesByRange();
	}

	private filterFilesByRange(): TFile[] {
		const range = this.options.timeRange;
		if (!range || range === "all") {
			this.filteredFiles = [...this.allFiles];
			return this.filteredFiles;
		}

		const now = moment();
		const dayConfig = this.options.resolver.getConfig("day");
		const matches = findPeriodicNotes(this.options.app, dayConfig, "day");
		const dateByPath = new Map(matches.map((m) => [m.file.path, m.date]));

		this.filteredFiles = this.allFiles.filter((file) => {
			const fileDate = dateByPath.get(file.path);
			if (!fileDate) return false;
			return this.isDateInRange(fileDate, now, range);
		});
		return this.filteredFiles;
	}

	private isDateInRange(
		fileDate: moment.Moment,
		now: moment.Moment,
		range: TimeRange
	): boolean {
		switch (range) {
			case "week":
				return fileDate.isSame(now, "week");
			case "month":
				return fileDate.isSame(now, "month");
			case "year":
				return fileDate.isSame(now, "year");
			case "last-week":
				return fileDate.isBetween(
					moment().subtract(1, "week").startOf("week"),
					moment().subtract(1, "week").endOf("week"),
					null,
					"[]"
				);
			case "last-month":
				return fileDate.isBetween(
					moment().subtract(1, "month").startOf("month"),
					moment().subtract(1, "month").endOf("month"),
					null,
					"[]"
				);
			case "last-year":
				return fileDate.isBetween(
					moment().subtract(1, "year").startOf("year"),
					moment().subtract(1, "year").endOf("year"),
					null,
					"[]"
				);
			default:
				return true;
		}
	}

	public checkDailyNote(): boolean {
		const today = moment();
		const dayConfig = this.options.resolver.getConfig("day");
		const matches = findPeriodicNotes(this.options.app, dayConfig, "day");
		const hasToday = matches.some((m) => m.date.isSame(today, "day"));

		if (!hasToday) {
			this.hasCurrentDay = false;
			return false;
		}
		if (this.hasCurrentDay === false) {
			this.fetchFiles();
		}
		this.hasCurrentDay = true;
		return true;
	}

	public async createNewDailyNote(): Promise<TFile | null> {
		if (this.hasCurrentDay) return null;
		try {
			const file = await createPeriodicNote(
				this.options.resolver,
				"day",
				moment()
			);
			this.allFiles.push(file);
			this.allFiles = this.sortFiles(this.allFiles);
			this.hasCurrentDay = true;
			this.filterFilesByRange();
			return file;
		} catch (err) {
			console.error("Time Manager: createNewDailyNote failed", err);
			return null;
		}
	}

	public fileCreate(file: TFile): void {
		const dayConfig = this.options.resolver.getConfig("day");
		const matches = findPeriodicNotes(this.options.app, dayConfig, "day");
		const match = matches.find((m) => m.file.path === file.path);
		if (!match) return;

		if (!this.allFiles.some((f) => f.path === file.path)) {
			this.allFiles.push(file);
			this.allFiles = this.sortFiles(this.allFiles);
		}
		this.filterFilesByRange();
		if (match.date.isSame(moment(), "day")) this.hasCurrentDay = true;
	}

	public fileDelete(file: TFile): void {
		this.allFiles = this.allFiles.filter((f) => f.path !== file.path);
		this.filteredFiles = this.filteredFiles.filter((f) => f.path !== file.path);
		this.checkDailyNote();
	}

	public getFilteredFiles(): TFile[] {
		return this.filteredFiles;
	}

	public hasCurrentDayNote(): boolean {
		return this.hasCurrentDay;
	}

	public updateOptions(options: Partial<FileManagerOptions>): void {
		this.options = { ...this.options, ...options };
		this.allFiles = [];
		this.filteredFiles = [];
		this.fetchFiles();
	}
}
