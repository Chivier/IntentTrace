import { describe, expect, it } from "vitest";

import {
  ALL_SOURCES,
  CANDIDATE_WINDOW,
  computeEmptyState,
  dedupeKey,
  rankCandidates,
  summarize,
  visibleRows,
  type ImportRow,
} from "./view-model";

function file(name: string, lastModified: number, size = 10): File {
  return new File(["x".repeat(size)], name, { lastModified });
}

function row(overrides: Partial<ImportRow> & { clientRef: string }): ImportRow {
  const source = file(`${overrides.clientRef}.jsonl`, 0);
  return {
    key: dedupeKey(source),
    file: source,
    name: source.name,
    size: source.size,
    lastModified: 0,
    status: "ready",
    selected: false,
    source: null,
    title: null,
    projectHint: null,
    firstPromptPreview: null,
    lastPromptPreview: null,
    partialHead: false,
    imported: false,
    traceId: null,
    inserted: 0,
    duplicates: 0,
    failureCode: null,
    failureMessage: null,
    failureStage: null,
    ...overrides,
  };
}

describe("rankCandidates", () => {
  it("keeps whole-document JSON only for an explicit file pick", () => {
    const files = [file("a.json", 3), file("b.jsonl", 2), file("c.ndjson", 1)];
    expect(rankCandidates(files, "files").window.map((entry) => entry.name)).toEqual([
      "a.json",
      "b.jsonl",
      "c.ndjson",
    ]);
    const folder = rankCandidates(files, "folder");
    expect(folder.window.map((entry) => entry.name)).toEqual(["b.jsonl", "c.ndjson"]);
    expect(folder.ignored).toBe(1);
  });

  it("sorts newest first and breaks ties by name", () => {
    const ranked = rankCandidates(
      [file("b.jsonl", 5), file("a.jsonl", 5), file("z.jsonl", 9)],
      "folder",
    );
    expect(ranked.window.map((entry) => entry.name)).toEqual(["z.jsonl", "a.jsonl", "b.jsonl"]);
  });

  it("caps the window and reports what the cap dropped", () => {
    const files = Array.from({ length: CANDIDATE_WINDOW + 3 }, (_, index) =>
      file(`s${index}.jsonl`, index),
    );
    const ranked = rankCandidates(files, "folder");
    expect(ranked.window).toHaveLength(CANDIDATE_WINDOW);
    expect(ranked.skippedByLimit).toBe(3);
  });

  it("is first-wins on identical name, size, and mtime", () => {
    const ranked = rankCandidates([file("a.jsonl", 1), file("a.jsonl", 1)], "folder");
    expect(ranked.window).toHaveLength(1);
  });
});

describe("visibleRows", () => {
  const rows = [
    row({ clientRef: "c1", name: "alpha.jsonl", title: "Codex · fix build", source: "codex" }),
    row({ clientRef: "c2", name: "beta.jsonl", source: "claude", imported: true }),
  ];

  it("matches file name and title but never prompt text", () => {
    const withPreview = [
      row({ clientRef: "c3", name: "gamma.jsonl", firstPromptPreview: "secret phrase" }),
    ];
    expect(
      visibleRows(withPreview, { query: "secret", source: ALL_SOURCES, hideImported: false }),
    ).toHaveLength(0);
    expect(
      visibleRows(rows, { query: "fix build", source: ALL_SOURCES, hideImported: false }).map(
        (entry) => entry.clientRef,
      ),
    ).toEqual(["c1"]);
  });

  it("filters by detected source and hides already-imported rows", () => {
    expect(
      visibleRows(rows, { query: "", source: "claude", hideImported: false }).map(
        (entry) => entry.clientRef,
      ),
    ).toEqual(["c2"]);
    expect(
      visibleRows(rows, { query: "", source: ALL_SOURCES, hideImported: true }).map(
        (entry) => entry.clientRef,
      ),
    ).toEqual(["c1"]);
  });
});

describe("computeEmptyState", () => {
  const base = {
    isInspecting: false,
    allInspectFailed: false,
    settled: true,
    visibleCount: 0,
    totalCount: 2,
    alreadyImportedCount: 0,
    isFiltered: false,
  };

  it("stays hidden while inspecting, while the error banner owns the surface, and until settled", () => {
    expect(computeEmptyState({ ...base, isInspecting: true }).show).toBe(false);
    expect(computeEmptyState({ ...base, allInspectFailed: true }).show).toBe(false);
    expect(computeEmptyState({ ...base, settled: false }).show).toBe(false);
    expect(computeEmptyState({ ...base, visibleCount: 1 }).show).toBe(false);
  });

  it("prefers the filter message over the already-imported message", () => {
    expect(computeEmptyState({ ...base, isFiltered: true, alreadyImportedCount: 2 }).title).toBe(
      "当前筛选没有匹配的会话。",
    );
  });

  it("reports already-imported only when every session is imported", () => {
    expect(computeEmptyState({ ...base, alreadyImportedCount: 2 }).title).toBe(
      "所选会话都已经导入过。",
    );
    expect(computeEmptyState({ ...base, alreadyImportedCount: 1 }).title).toBe(
      "没有可导入的会话。",
    );
  });
});

describe("summarize", () => {
  it("counts run outcomes and accumulates insert/duplicate totals", () => {
    expect(
      summarize([
        row({ clientRef: "c1", status: "imported", selected: true, inserted: 4, duplicates: 0 }),
        row({ clientRef: "c2", status: "failed", selected: true }),
        row({ clientRef: "c3", status: "imported", inserted: 0, duplicates: 4 }),
      ]),
    ).toEqual({ selected: 2, imported: 2, failed: 1, inserted: 4, duplicates: 4 });
  });
});
