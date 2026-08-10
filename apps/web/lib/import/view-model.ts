import type { TraceSourceKind } from "@intenttrace/schema";

/** Matches the collector's DEFAULT_DISCOVER_LIMIT. */
export const CANDIDATE_WINDOW = 50;
/** Head window sent to `/imports/candidates`; the request cap is 128 KiB base64. */
export const HEAD_BYTES = 64 * 1024;
export const UPLOAD_CONCURRENCY = 2;
export const ALL_SOURCES = "__all__";

const FOLDER_EXTENSIONS = [".jsonl", ".ndjson"];
const FILE_EXTENSIONS = [".jsonl", ".ndjson", ".json"];

export type ImportRowStatus =
  "inspecting" | "ready" | "queued" | "uploading" | "imported" | "failed";

export interface ImportRow {
  /** "c1", "c2", … assigned in pick order; stable for the page's lifetime. */
  clientRef: string;
  /** `dedupeKey(file)`; the React key. */
  key: string;
  /** Retained so import streams the original bytes; never persisted. */
  file: File;
  name: string;
  size: number;
  lastModified: number;
  status: ImportRowStatus;
  selected: boolean;
  source: TraceSourceKind | null;
  title: string | null;
  projectHint: string | null;
  firstPromptPreview: string | null;
  lastPromptPreview: string | null;
  partialHead: boolean;
  imported: boolean;
  traceId: string | null;
  inserted: number;
  duplicates: number;
  failureCode: string | null;
  failureMessage: string | null;
  /** Which phase produced `failureCode`; an upload failure is always retryable. */
  failureStage: "inspect" | "upload" | null;
}

export interface CandidateFile {
  name: string;
  size: number;
  lastModified: number;
}

export function dedupeKey(file: CandidateFile): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

export interface RankedCandidates {
  window: File[];
  skippedByLimit: number;
  ignored: number;
}

/**
 * Folder mode mirrors the collector's directory walk and keeps only line-delimited
 * files, so Claude's `sessions-index.json` metadata never enters the catalog. An
 * explicit file pick is an operator decision, so whole-document `.json` is allowed.
 */
export function rankCandidates(files: readonly File[], mode: "folder" | "files"): RankedCandidates {
  const allowed = mode === "folder" ? FOLDER_EXTENSIONS : FILE_EXTENSIONS;
  const kept: File[] = [];
  const seen = new Set<string>();
  let ignored = 0;
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (!allowed.some((extension) => name.endsWith(extension))) {
      ignored += 1;
      continue;
    }
    const key = dedupeKey(file);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(file);
  }
  kept.sort((left, right) =>
    right.lastModified === left.lastModified
      ? left.name.localeCompare(right.name)
      : right.lastModified - left.lastModified,
  );
  return {
    window: kept.slice(0, CANDIDATE_WINDOW),
    skippedByLimit: Math.max(0, kept.length - CANDIDATE_WINDOW),
    ignored,
  };
}

export interface RowFilter {
  query: string;
  source: string;
  hideImported: boolean;
}

/** Matches file name and title only — prompt previews are never searched. */
export function visibleRows(rows: readonly ImportRow[], filter: RowFilter): ImportRow[] {
  const needle = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.hideImported && row.imported) return false;
    if (filter.source !== ALL_SOURCES && row.source !== filter.source) return false;
    if (!needle) return true;
    return (
      row.name.toLowerCase().includes(needle) ||
      (row.title?.toLowerCase().includes(needle) ?? false)
    );
  });
}

export interface EmptyStateInput {
  isInspecting: boolean;
  allInspectFailed: boolean;
  settled: boolean;
  visibleCount: number;
  totalCount: number;
  alreadyImportedCount: number;
  isFiltered: boolean;
}

export function computeEmptyState(input: EmptyStateInput): { show: boolean; title: string } {
  const hidden = { show: false, title: "" };
  if (input.isInspecting) return hidden;
  // The error banner owns the surface when nothing could be inspected.
  if (input.allInspectFailed) return hidden;
  if (!input.settled) return hidden;
  if (input.visibleCount > 0) return hidden;
  if (input.isFiltered && input.totalCount > 0) {
    return { show: true, title: "当前筛选没有匹配的会话。" };
  }
  if (input.alreadyImportedCount > 0 && input.alreadyImportedCount === input.totalCount) {
    return { show: true, title: "所选会话都已经导入过。" };
  }
  return { show: true, title: "没有可导入的会话。" };
}

export interface ImportSummary {
  selected: number;
  imported: number;
  failed: number;
  inserted: number;
  duplicates: number;
}

export function summarize(rows: readonly ImportRow[]): ImportSummary {
  const summary: ImportSummary = {
    selected: 0,
    imported: 0,
    failed: 0,
    inserted: 0,
    duplicates: 0,
  };
  for (const row of rows) {
    if (row.selected) summary.selected += 1;
    if (row.status === "imported") summary.imported += 1;
    if (row.status === "failed") summary.failed += 1;
    summary.inserted += row.inserted;
    summary.duplicates += row.duplicates;
  }
  return summary;
}

export function formatRelativeTime(timestampMs: number, nowMs: number): string {
  const seconds = Math.round((nowMs - timestampMs) / 1000);
  if (!Number.isFinite(seconds)) return "—";
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
