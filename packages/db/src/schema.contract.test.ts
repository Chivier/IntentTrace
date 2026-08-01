import { describe, expect, it } from "vitest";

import {
  claimEvidence,
  rawEvents,
  revisionNodeMembers,
  semanticNodeVersions,
  semanticRevisions,
  streamEvents,
} from "./schema.js";

describe("persistence contract", () => {
  it("defines version-scoped evidence and durable stream tables", () => {
    expect(rawEvents).toBeTruthy();
    expect(semanticRevisions).toBeTruthy();
    expect(semanticNodeVersions).toBeTruthy();
    expect(revisionNodeMembers).toBeTruthy();
    expect(claimEvidence).toBeTruthy();
    expect(streamEvents).toBeTruthy();
  });
});
