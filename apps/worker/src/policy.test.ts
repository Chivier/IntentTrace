import { describe, expect, it } from "vitest";

import { SUMMARY_QUEUE_NAME, WorkerFoundationPolicy } from "./policy.js";

describe("worker Gate 0 policy", () => {
  it("keeps semantic execution disabled", () => {
    expect(SUMMARY_QUEUE_NAME).toBe("intenttrace-summary");
    expect(WorkerFoundationPolicy).toMatchObject({
      consumesJobs: false,
      providerCallsAllowed: false,
    });
  });
});
