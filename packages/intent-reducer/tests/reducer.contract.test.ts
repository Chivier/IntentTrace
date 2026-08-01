import { describe, expect, it } from "vitest";

import { SchemaVersion } from "@intenttrace/schema";

import { validateProviderPatch } from "../src/index.js";

const eventId = "019fbbb3-4324-7d43-8f9c-cd489a92cb28";
const revisionId = "019fbbb3-4324-7d43-8f9c-cd489a92cb29";
const nonce = "019fbbb3-4324-7d43-8f9c-cd489a92cb30";

const context = {
  expectedBaseRevisionId: revisionId,
  expectedJobNonce: nonce,
  allowedEventIds: new Set([eventId]),
  allowedArtifactIds: new Set<string>(),
  allowedAgentIds: new Set<string>(),
  allowedNodeIds: new Set<string>(),
  allowedEdgeIds: new Set<string>(),
  pinnedNodeIds: new Set<string>(),
};

describe("provider patch trust boundary", () => {
  it("accepts an empty, nonce-bound mock patch", () => {
    const result = validateProviderPatch(
      {
        schemaVersion: SchemaVersion,
        jobNonce: nonce,
        baseRevisionId: revisionId,
        operations: [],
        diagnostics: [],
      },
      context,
    );
    expect(result.ok).toBe(true);
  });

  it("rejects evidence outside the job allowlist", () => {
    const result = validateProviderPatch(
      {
        schemaVersion: SchemaVersion,
        jobNonce: nonce,
        baseRevisionId: revisionId,
        operations: [
          {
            op: "add_node",
            ref: "tmp:1",
            node: {
              kind: "work",
              status: "active",
              title: "Normalize source events",
              claims: [
                {
                  kind: "action",
                  text: "Normalized an event",
                  provenance: "inferred",
                  suggestedConfidence: "low",
                  evidenceEventIds: ["019fbbb3-4324-7d43-8f9c-cd489a92cb99"],
                },
              ],
              participantAgentIds: [],
              artifactIds: [],
            },
          },
        ],
        diagnostics: [],
      },
      context,
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.some((issue) => issue.code === "unknown_evidence")).toBe(true);
  });
});
