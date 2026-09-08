import { describe, expect, it } from "vitest";
import {
  greetingKey,
  homeHealth,
  isQuiet,
  recentUpdates,
  smarterInvitations,
  whatSuCasaSees,
  type HomeFacts,
} from "./home-today";

const base: HomeFacts = {
  overdue: 0,
  dueSoon: 0,
  timelineItems: 6,
  plan90: 0,
  planTotal: 0,
  findings: 0,
  hasInspection: true,
  documents: 2,
  equityPct: null,
};

describe("whatSuCasaSees", () => {
  it("leads with overdue care and caps at three lines", () => {
    const lines = whatSuCasaSees({
      ...base,
      overdue: 2,
      dueSoon: 3,
      plan90: 2,
      findings: 3,
      equityPct: 0.42,
    });
    expect(lines[0]).toEqual({ key: "home.sees.overdue", params: { count: 2 } });
    expect(lines).toHaveLength(3);
  });

  it("invites an inspection when none is on file", () => {
    const lines = whatSuCasaSees({ ...base, hasInspection: false });
    expect(lines.map((l) => l.key)).toContain("home.sees.no_inspection");
  });

  it("stays calm when nothing needs attention", () => {
    expect(whatSuCasaSees(base)).toEqual([{ key: "home.sees.steady" }]);
  });

  it("uses singular copy for one item", () => {
    const lines = whatSuCasaSees({ ...base, plan90: 1 });
    expect(lines.map((l) => l.key)).toContain("home.sees.plan90_one");
  });
});

describe("homeHealth", () => {
  it("celebrates an on-track home", () => {
    expect(homeHealth(base)).toEqual({ line: { key: "home.health.ok" }, tone: "calm" });
  });
  it("reports attention before coming-up", () => {
    expect(homeHealth({ ...base, overdue: 1, dueSoon: 4 }).tone).toBe("attention");
  });
  it("invites setup with no timeline yet", () => {
    expect(homeHealth({ ...base, timelineItems: 0 }).line.key).toBe("home.health.start");
  });
});

describe("isQuiet", () => {
  it("is quiet only with no care items and nothing in 90 days", () => {
    expect(isQuiet(base)).toBe(true);
    expect(isQuiet({ ...base, plan90: 1 })).toBe(false);
    expect(isQuiet({ ...base, dueSoon: 1 })).toBe(false);
  });
});

describe("recentUpdates", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  const iso = (d: string) => new Date(d).toISOString();

  it("only includes timestamped facts inside the window", () => {
    const out = recentUpdates(
      {
        documents: [
          { original_filename: "inspection.pdf", created_at: iso("2026-09-02T10:00:00Z") },
          { original_filename: "old.pdf", created_at: iso("2026-01-02T10:00:00Z") },
        ],
        findings: [{ created_at: iso("2026-09-03T10:00:00Z") }],
        snapshots: [],
      },
      now,
    );
    expect(out).toHaveLength(2);
    expect(out[0]!.line.key).toBe("home.recent.findings_one");
    expect(out[1]!.line.params!.name).toBe("inspection.pdf");
  });

  it("compares the newest stored snapshot with the previous stored one", () => {
    const out = recentUpdates(
      {
        documents: [],
        findings: [],
        snapshots: [
          { captured_on: "2026-08-01", value_cents: 40_000_000 },
          { captured_on: "2026-09-07", value_cents: 41_500_000 },
        ],
      },
      now,
    );
    expect(out[0]!.line.key).toBe("home.recent.value_up");
    expect(out[0]!.line.params).toMatchObject({ value: "$415,000", prior: "$400,000" });
  });

  it("says nothing about value with a single snapshot or no change", () => {
    expect(
      recentUpdates(
        { documents: [], findings: [], snapshots: [{ captured_on: "2026-09-07", value_cents: 1 }] },
        now,
      ),
    ).toEqual([]);
  });

  it("never derives a change from current care status", () => {
    // Care statuses are not an input at all — this is the guarantee.
    const out = recentUpdates({ documents: [], findings: [], snapshots: [] }, now);
    expect(out).toEqual([]);
  });
});

describe("smarterInvitations", () => {
  it("is empty for a complete profile", () => {
    expect(
      smarterInvitations({
        hasName: true,
        hasAddress: true,
        hasPhone: true,
        hasDocuments: true,
        hasLogs: true,
      }),
    ).toEqual([]);
  });

  it("asks for the most useful things first, max three", () => {
    const out = smarterInvitations({
      hasName: false,
      hasAddress: false,
      hasPhone: false,
      hasDocuments: false,
      hasLogs: false,
    });
    expect(out.map((l) => l.key)).toEqual([
      "home.smarter.address",
      "home.smarter.documents",
      "home.smarter.logs",
    ]);
  });
});

describe("greetingKey", () => {
  it("follows the homeowner's own clock", () => {
    expect(greetingKey(new Date(2026, 8, 8, 8))).toBe("home.today.morning");
    expect(greetingKey(new Date(2026, 8, 8, 14))).toBe("home.today.afternoon");
    expect(greetingKey(new Date(2026, 8, 8, 21))).toBe("home.today.evening");
  });
});
