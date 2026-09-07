import { describe, expect, it } from "vitest";
import {
  buildSummary,
  firstName,
  firstRunMode,
  hasNoContactRoute,
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
