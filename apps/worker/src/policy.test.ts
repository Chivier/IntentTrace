import { describe, expect, it } from "vitest";

import { SUMMARY_QUEUE_NAME, WorkerFoundationPolicy } from "./policy.js";

describe("worker local MVP policy", () => {
  it("consumes jobs while cloud provider calls remain disabled by default", () => {
    expect(SUMMARY_QUEUE_NAME).toBe("intenttrace-summary");
    expect(WorkerFoundationPolicy).toMatchObject({
      consumesJobs: true,
      providerCallsAllowed: false,
    });
  });
});
