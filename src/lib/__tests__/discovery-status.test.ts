import { describe, it, expect } from "vitest";
import { summarizeDiscoveryProcessing, discoveryEmptyState } from "../discovery-status";

describe("Discovery status", () => {
  it("counts unapproved/pending homes separately from review and done", () => {
    const s = summarizeDiscoveryProcessing([
      { status: "pending" }, { status: "pending" }, { status: "needs_review" }, { status: "done" }, { status: "skipped" },
    ]);
    expect(s).toEqual({ awaiting: 2, needsReview: 1, done: 2 });
  });
  it("a failed signal request is never reported as 'no results'", () => {
    expect(discoveryEmptyState({ signalsFailed: true, awaiting: 0, hasRun: true, active: 5 })).toBe("failed");
  });
  it("homes still awaiting processing show 'processing', not 'no results'", () => {
    expect(discoveryEmptyState({ signalsFailed: false, awaiting: 3, hasRun: true, active: 5 })).toBe("processing");
  });
  it("finished import with nothing qualifying shows 'no results'", () => {
    expect(discoveryEmptyState({ signalsFailed: false, awaiting: 0, hasRun: true, active: 5 })).toBe("no_results");
  });
  it("before any upload shows the upload prompt", () => {
    expect(discoveryEmptyState({ signalsFailed: false, awaiting: 0, hasRun: false, active: 0 })).toBe("before_upload");
  });
});
