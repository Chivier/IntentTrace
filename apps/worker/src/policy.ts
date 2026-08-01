export const SUMMARY_QUEUE_NAME = "intenttrace-summary";

export const WorkerFoundationPolicy = Object.freeze({
  consumesJobs: false,
  providerCallsAllowed: false,
  note: "Gate 0 verifies queue connectivity only; semantic jobs are not consumed.",
});
