import { describe, expect, it } from "vitest";
import {
  buildDailyRead,
  buildSummary,
  firstName,
  firstRunMode,
  handledToday,
  hasNoContactRoute,
  intelligenceLines,
  nextMovePrompt,
} from "./agent-daily";

const base = {
  opportunityId: "o1",
  name: "Maria Delgado",
  temperature: "hot" as const,
  channel: "call" as const,
  phone: "+15551234567",
  email: "maria@example.com",
};

describe("communication affordances", () => {
  it("reflects the server decision and never re-derives it", () => {
    expect(hasNoContactRoute({ ...base, channels: [] })).toBe(true);
    expect(
      hasNoContactRoute({
        ...base,
        channels: [{ available: false }, { available: true }],
      }),
    ).toBe(false);
  });
});

describe("daily summary", () => {
  it("counts by temperature and mentions tasks", () => {
    const s = buildSummary(
      [base, { ...base, opportunityId: "o2", temperature: "warm" }],
      3,
    );
    expect(s.total).toBe(2);
    expect(s.hot).toBe(1);
    expect(s.headline).toContain("2 people");
    expect(s.supporting).toContain("3 tasks due");
  });

  it("has a calm empty headline", () => {
    expect(buildSummary([], 0).headline).toBe("You're clear for today");
  });
});

describe("first run", () => {
  it("shows the import state when the book is empty", () => {
    expect(
      firstRunMode({ seen: false, clientCount: 0, queueCount: 0, enrichmentPending: false }),
    ).toBe("empty");
  });

  it("uses a real homeowner for the aha moment", () => {
    expect(
      firstRunMode({ seen: false, clientCount: 40, queueCount: 5, enrichmentPending: false }),
    ).toBe("aha");
  });

  it("shows preparation instead of zeros while enrichment runs", () => {
    expect(
      firstRunMode({ seen: false, clientCount: 40, queueCount: 0, enrichmentPending: true }),
    ).toBe("preparing");
  });

  it("stays quiet once seen", () => {
    expect(
      firstRunMode({ seen: true, clientCount: 40, queueCount: 5, enrichmentPending: false }),
    ).toBe("none");
  });
});

describe("copy helpers", () => {
  it("uses first names", () => {
    expect(firstName("Maria Delgado")).toBe("Maria");
    expect(firstName("")).toBe("this homeowner");
  });

  it("hands off to the next person", () => {
    expect(nextMovePrompt("Ana Ruiz")).toBe("Ana is your next best move.");
    expect(nextMovePrompt(null)).toBe("That's your list for today.");
  });
});

describe("handledToday", () => {
  it("counts distinct homeowners touched today in the viewer's timezone", () => {
    const now = new Date("2026-09-08T22:00:00");
    const iso = (d: string) => new Date(d).toISOString();
    expect(
      handledToday(
        [
          { clientId: "a", occurredAt: iso("2026-09-08T09:00:00") },
          { clientId: "a", occurredAt: iso("2026-09-08T15:00:00") },
          { clientId: "b", occurredAt: iso("2026-09-08T11:00:00") },
          { clientId: "c", occurredAt: iso("2026-09-07T11:00:00") },
        ],
        now,
      ),
    ).toBe(2);
  });

  it("is zero with no touches", () => {
    expect(handledToday([])).toBe(0);
  });
});

describe("buildDailyRead", () => {
  it("names the first two people and reuses engine copy only", () => {
    const r = buildDailyRead([
      { name: "Maria Rodriguez", why: "Equity milestone", headline: "Send a market + equity update", engagementLine: "Opened your last email" },
      { name: "David Hernandez", why: "Permit activity", headline: "Ask about the project" },
    ]);
    expect(r.sentence).toContain("Maria");
    expect(r.sentence).toContain("David");
    expect(r.beUsefulBy).toBe("Send a market + equity update");
    expect(r.why).toContain("Opened your last email");
  });

  it("stays calm when nothing is queued", () => {
    const r = buildDailyRead([]);
    expect(r.startHere).toBeNull();
    expect(r.sentence).toContain("keeps watching");
  });
});

describe("intelligenceLines", () => {
  it("drops zero metrics and always states what is monitored", () => {
    const lines = intelligenceLines({ monitored: 426, engaged: 0, worthAttention: 8, tasksDue: 1 });
    expect(lines.some((l) => l.includes("engaged"))).toBe(false);
    expect(lines).toContain("8 relationships worth your attention");
    expect(lines).toContain("1 follow-up is due");
    expect(lines[lines.length - 1]).toContain("426 homeowners being monitored");
  });
});
