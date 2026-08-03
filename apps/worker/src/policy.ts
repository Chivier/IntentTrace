export const SUMMARY_QUEUE_NAME = "intenttrace-summary";

export const WorkerFoundationPolicy = Object.freeze({
  consumesJobs: true,
  providerCallsAllowed: false,
  note: "BullMQ dispatches at-least-once work; PostgreSQL claims and commits are authoritative.",
});
