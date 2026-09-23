import { beforeEach, describe, expect, it } from "vitest";
import {
  POST_CALL_OUTCOMES,
  PostCallFinalSchema,
  PostCallInterpretationSchema,
  editedFields,
  followUpDateToDueAt,
  markCallInitiated,
  normalizeFollowUpDate,
  readCallMarker,
  clearCallMarker,
} from "@/lib/post-call";

// ---------- schema ----------

const validInterpretation = {
  summary: "Maria is thinking about selling around March.",
  originalLanguage: "en" as const,
  outcome: "talked",
  relationshipStatus: "warm",
  keyFacts: [{ fact: "Husband starts new job in January", confidence: "high" as const }],
  nextStep: "Call back in the new year",
  followUp: {
    required: true,
    date: "2026-01-06",
    timeframeText: "first week of January",
    reason: "She asked me to reconnect after the holidays",
  },
  suggestedFutureOpener: "You mentioned January would be a good time to revisit.",
};

describe("PostCallInterpretationSchema", () => {
  it("accepts a well-formed English interpretation", () => {
    expect(PostCallInterpretationSchema.safeParse(validInterpretation).success).toBe(true);
  });

  it("accepts Spanish and mixed language tags", () => {
    for (const lang of ["es", "mixed"] as const) {
      expect(
        PostCallInterpretationSchema.safeParse({ ...validInterpretation, originalLanguage: lang })
          .success,
      ).toBe(true);
    }
  });

  it("rejects an unknown language tag (never silently relabel)", () => {
    expect(
      PostCallInterpretationSchema.safeParse({ ...validInterpretation, originalLanguage: "spanglish" })
        .success,
    ).toBe(false);
  });

  it("rejects an outcome outside the canonical stage vocabulary", () => {
    expect(
      PostCallInterpretationSchema.safeParse({ ...validInterpretation, outcome: "ghosted" }).success,
    ).toBe(false);
  });

  it("rejects malformed output entirely (garbage string fields)", () => {
    expect(PostCallInterpretationSchema.safeParse({ hello: "world" }).success).toBe(false);
    expect(PostCallInterpretationSchema.safeParse("not an object").success).toBe(false);
  });

  it("allows follow-up not required with null fields", () => {
    const parsed = PostCallInterpretationSchema.safeParse({
      ...validInterpretation,
      followUp: { required: false, date: null, timeframeText: null, reason: null },
    });
    expect(parsed.success).toBe(true);
  });

  it("allows approximate timeframes with a null date", () => {
    const parsed = PostCallInterpretationSchema.safeParse({
      ...validInterpretation,
      followUp: {
        required: true,
        date: null,
        timeframeText: "after Thanksgiving",
        reason: "reconnect after the holiday",
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("PostCallFinalSchema", () => {
  it("drops originalLanguage from the saved record (lives on the conversation row)", () => {
    const final = PostCallFinalSchema.parse(validInterpretation);
    expect("originalLanguage" in final).toBe(false);
    expect(final.summary).toBe(validInterpretation.summary);
  });

  it("rejects user-edited outcomes outside the vocabulary", () => {
    expect(
      PostCallFinalSchema.safeParse({ ...validInterpretation, outcome: "closed_the_deal" }).success,
    ).toBe(false);
  });
});

// ---------- follow-up date handling ----------

describe("normalizeFollowUpDate", () => {
  it("accepts a valid ISO date", () => {
    expect(normalizeFollowUpDate("2026-01-06")).toBe("2026-01-06");
  });

  it("rejects a date in the past", () => {
    expect(normalizeFollowUpDate("2020-01-01")).toBeNull();
  });

  it("rejects impossible dates and datetime strings", () => {
    expect(normalizeFollowUpDate("2026-02-30")).toBeNull();
    expect(normalizeFollowUpDate("2026-06-01T09:00:00Z")).toBeNull();
    expect(normalizeFollowUpDate("next Friday")).toBeNull();
    expect(normalizeFollowUpDate("")).toBeNull();
  });

  it("rejects dates more than two years out", () => {
    expect(normalizeFollowUpDate("2099-01-01")).toBeNull();
  });
});

describe("followUpDateToDueAt", () => {
  it("returns null for an invalid date", () => {
    expect(followUpDateToDueAt("not-a-date")).toBeNull();
  });

  it("returns a UTC instant on the requested calendar day at 9:00 local", () => {
    const due = followUpDateToDueAt("2026-06-15");
    expect(due).not.toBeNull();
    const d = new Date(due!);
    expect(d.getTime()).toBeLessThan(Date.parse("2026-06-16T12:00:00Z"));
    expect(d.getTime()).toBeGreaterThanOrEqual(Date.parse("2026-06-15T00:00:00Z"));
  });
});

// ---------- edited field diffing ----------

describe("editedFields", () => {
  it("is empty when nothing changed", () => {
    expect(
      editedFields(validInterpretation, PostCallFinalSchema.parse(validInterpretation)),
    ).toEqual([]);
  });

  it("detects a user-changed outcome before save", () => {
    const final = PostCallFinalSchema.parse({ ...validInterpretation, outcome: "appointment" });
    expect(editedFields(validInterpretation, final)).toEqual(["outcome"]);
  });

  it("detects an edited follow-up date", () => {
    const final = PostCallFinalSchema.parse({
      ...validInterpretation,
      followUp: { ...validInterpretation.followUp, date: "2026-01-08" },
    });
    expect(editedFields(validInterpretation, final)).toEqual(["followUp.date"]);
  });

  it("detects summary edits and removed key facts", () => {
    const final = PostCallFinalSchema.parse({
      ...validInterpretation,
      summary: "User rewrote this.",
      keyFacts: [],
    });
    expect(editedFields(validInterpretation, final).sort()).toEqual(["keyFacts", "summary"]);
  });
});

// ---------- return-from-call marker ----------

describe("call marker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a fresh marker", () => {
    markCallInitiated({ clientId: "c1", name: "Maria", audience: "agent", opportunityId: "o1" });
    const m = readCallMarker();
    expect(m?.clientId).toBe("c1");
    expect(m?.opportunityId).toBe("o1");
    expect(m?.audience).toBe("agent");
  });

  it("expires stale markers", () => {
    localStorage.setItem(
      "sucasa.lastCall",
      JSON.stringify({
        clientId: "c1",
        name: "Maria",
        audience: "lender",
        opportunityId: null,
        at: Date.now() - 60 * 60_000,
      }),
    );
    expect(readCallMarker()).toBeNull();
  });

  it("clearCallMarker removes it", () => {
    markCallInitiated({ clientId: "c1", name: "Maria", audience: "agent", opportunityId: null });
    clearCallMarker();
    expect(readCallMarker()).toBeNull();
  });

  it("tolerates corrupted storage", () => {
    localStorage.setItem("sucasa.lastCall", "{not json");
    expect(readCallMarker()).toBeNull();
  });
});

// ---------- outcome vocabulary ----------

describe("POST_CALL_OUTCOMES", () => {
  it("is a subset of the canonical opportunity outcome stages", () => {
    const canonical = new Set([
      "attempted",
      "emailed",
      "no_answer",
      "talked",
      "appointment",
      "application",
      "closed",
      "not_interested",
    ]);
    for (const o of POST_CALL_OUTCOMES) expect(canonical.has(o)).toBe(true);
  });
});
