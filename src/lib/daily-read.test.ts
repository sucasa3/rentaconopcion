import { describe, expect, it } from "vitest";
import {
  AGENT_GROUP_LABEL,
  agentGroupFor,
  buildDailyReadEmail,
  fingerprintBaseKey,
  isDeliveryHour,
  isFeaturable,
  localDateIn,
  localHourIn,
  markNewItems,
  passesDailyReadThreshold,
  shouldSendDailyRead,
  signalFingerprint,
  unresolvedSetHash,
  type DailyReadItem,
} from "./daily-read";

const fp = (over: Partial<Parameters<typeof signalFingerprint>[0]> = {}) =>
  signalFingerprint({
    clientId: "c1",
    categoryKey: "lifecycle",
    reason: "Ownership anniversary this month",
    temperature: "warm",
    ...over,
  });

function item(over: Partial<DailyReadItem> = {}): DailyReadItem {
  return {
    clientId: "c1",
    opportunityId: "o1",
    name: "Maria Delgado",
    categoryKey: "lifecycle",
    categoryLabel: "Ownership milestone",
    temperature: "warm",
    rank: 50,
    strength: "moderate",
    reason: "Ownership anniversary this month",
    nextStep: "Send a market + equity update",
    href: "/agent",
    fingerprint: fp(),
    isNew: true,
    ...over,
  };
}

describe("signal identity", () => {
  it("is stable for the same homeowner, opportunity and reason", () => {
    expect(fp()).toBe(fp());
    expect(fingerprintBaseKey(fp())).toBe(fingerprintBaseKey(fp({ temperature: "hot" })));
  });

  it("ignores whitespace and case in the canonical reason", () => {
    expect(fp()).toBe(fp({ reason: "  ownership   ANNIVERSARY this month " }));
  });

  it("changes when the underlying opportunity or reason changes", () => {
    expect(fingerprintBaseKey(fp({ categoryKey: "property_change" }))).not.toBe(
      fingerprintBaseKey(fp()),
    );
    expect(fingerprintBaseKey(fp({ reason: "A permit was filed" }))).not.toBe(
      fingerprintBaseKey(fp()),
    );
  });
});

describe("markNewItems", () => {
  it("treats a never-surfaced signal as new", () => {
    expect(markNewItems([item()], [])[0]!.isNew).toBe(true);
  });

  it("does not resurrect an unchanged opportunity, however long ago it was sent", () => {
    expect(markNewItems([item()], [fp()])[0]!.isNew).toBe(false);
  });

  it("counts an urgency increase as new", () => {
    const hotter = item({ temperature: "hot", fingerprint: fp({ temperature: "hot" }) });
    expect(markNewItems([hotter], [fp({ temperature: "warm" })])[0]!.isNew).toBe(true);
  });

  it("does not count an urgency decrease as new", () => {
    const cooler = item({ temperature: "nurture", fingerprint: fp({ temperature: "nurture" }) });
    expect(markNewItems([cooler], [fp({ temperature: "hot" })])[0]!.isNew).toBe(false);
  });

  it("recognises a genuinely new opportunity for a homeowner already surfaced", () => {
    const later = item({
      categoryKey: "property_change",
      fingerprint: fp({ categoryKey: "property_change", reason: "A permit was filed" }),
    });
    expect(markNewItems([later], [fp()])[0]!.isNew).toBe(true);
  });
});

describe("shouldSendDailyRead", () => {
  const today = "2026-09-17";

  it("sends State 1 when anything is new", () => {
    const d = shouldSendDailyRead({
      enabled: true,
      today,
      items: [item({ isNew: true }), item({ isNew: false })],
      priorSends: [],
    });
    expect(d.state).toBe("new_signals");
    expect(d.newCount).toBe(1);
  });

  it("sends State 2 when nothing is new but work remains", () => {
    expect(
      shouldSendDailyRead({ enabled: true, today, items: [item({ isNew: false })], priorSends: [] })
        .state,
    ).toBe("unresolved");
  });

  it("stays quiet when there is nothing to act on", () => {
    const d = shouldSendDailyRead({ enabled: true, today, items: [], priorSends: [] });
    expect(d.state).toBe("none");
    expect(d.reason).toBe("nothing_to_act_on");
  });

  it("respects the professional's preference", () => {
    expect(
      shouldSendDailyRead({ enabled: false, today, items: [item()], priorSends: [] }).reason,
    ).toBe("preference_off");
  });

  it("never sends twice on the same day", () => {
    expect(
      shouldSendDailyRead({
        enabled: true,
        today,
        items: [item()],
        priorSends: [{ sendDate: today, state: "new_signals", unresolvedHash: null }],
      }).reason,
    ).toBe("already_sent_today");
  });

  it("holds a quiet-day email inside the cooldown", () => {
    expect(
      shouldSendDailyRead({
        enabled: true,
        today,
        items: [item({ isNew: false })],
        priorSends: [{ sendDate: "2026-09-16", state: "unresolved", unresolvedHash: "x" }],
      }).reason,
    ).toBe("unresolved_cooldown");
  });

  it("holds a quiet-day email that would repeat the same set without value", () => {
    const items = [item({ isNew: false })];
    expect(
      shouldSendDailyRead({
        enabled: true,
        today,
        items,
        priorSends: [
          { sendDate: "2026-09-10", state: "unresolved", unresolvedHash: unresolvedSetHash(items) },
        ],
      }).reason,
    ).toBe("unresolved_repeats_without_value");
  });

  it("allows a quiet-day email once the set has changed and the cooldown passed", () => {
    expect(
      shouldSendDailyRead({
        enabled: true,
        today,
        items: [item({ isNew: false })],
        priorSends: [
          { sendDate: "2026-09-10", state: "unresolved", unresolvedHash: "different" },
        ],
      }).state,
    ).toBe("unresolved");
  });
});

describe("role separation", () => {
  it("never routes a loan product into an agent Daily Read", () => {
    for (const c of ["heloc", "refinance_review", "mortgage_review", "mortgage_age"]) {
      expect(agentGroupFor(c)).toBeNull();
    }
    expect(agentGroupFor("permit_activity")).toBe("permit_activity");
    expect(agentGroupFor("home_condition")).toBe("home_care");
    expect(agentGroupFor("equity")).toBe("value_change");
    expect(agentGroupFor("move_up", { engagedRecently: true })).toBe("engagement");
  });

  it("keeps lender vocabulary out of agent email copy", () => {
    const c = buildDailyReadEmail({
      state: "new_signals",
      audience: "agent",
      recipientName: "Neil Terc",
      items: [item(), item({ clientId: "c2", isNew: false })],
    });
    const text = [c.subject, c.summary, c.supporting, ...c.breakdown.map((b) => b.label)]
      .join(" ")
      .toLowerCase();
    for (const word of ["refinance", "heloc", "cash-out", "qualif", "loan"]) {
      expect(text).not.toContain(word);
    }
  });
});

describe("email copy", () => {
  it("leads with the count and shows at most three people", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item({ clientId: `c${n}`, rank: n }));
    const c = buildDailyReadEmail({
      state: "new_signals",
      audience: "lender",
      recipientName: "Neil",
      items,
    });
    expect(c.subject).toBe("5 homeowners deserve your attention today");
    expect(c.top).toHaveLength(3);
    expect(c.remaining).toBe(2);
    expect(c.greeting).toBe("Good morning, Neil");
  });

  it("puts new signals first, then canonical rank", () => {
    const c = buildDailyReadEmail({
      state: "new_signals",
      audience: "agent",
      recipientName: null,
      items: [
        item({ clientId: "old", isNew: false, rank: 99 }),
        item({ clientId: "new", isNew: true, rank: 1 }),
      ],
    });
    expect(c.top[0]!.clientId).toBe("new");
  });

  it("is reassuring on a quiet day", () => {
    const c = buildDailyReadEmail({
      state: "unresolved",
      audience: "agent",
      recipientName: "Neil",
      items: [item({ isNew: false })],
    });
    expect(c.summary).toContain("quiet");
    expect(c.supporting).toContain("still worth attention");
    expect(c.ctaLabel).toBe("Review Your Opportunities");
  });
});

describe("morning delivery", () => {
  it("uses the recipient's own local hour, daylight saving included", () => {
    // 11:00 UTC is 07:00 in New York during EDT.
    expect(localHourIn("America/New_York", new Date("2026-09-17T11:00:00Z"))).toBe(7);
    // In January the same local hour is 12:00 UTC.
    expect(localHourIn("America/New_York", new Date("2026-01-17T12:00:00Z"))).toBe(7);
    expect(localHourIn("America/Los_Angeles", new Date("2026-09-17T14:00:00Z"))).toBe(7);
  });

  it("only fires in the local morning hour", () => {
    expect(isDeliveryHour("America/Los_Angeles", new Date("2026-09-17T14:00:00Z"))).toBe(true);
    expect(isDeliveryHour("America/Los_Angeles", new Date("2026-09-17T11:00:00Z"))).toBe(false);
  });

  it("falls back safely for a missing or invalid timezone", () => {
    expect(isDeliveryHour(null, new Date("2026-09-17T11:00:00Z"))).toBe(true);
    expect(isDeliveryHour("Not/AZone", new Date("2026-09-17T11:00:00Z"))).toBe(true);
  });

  it("uses the local calendar date for one-per-day uniqueness", () => {
    expect(localDateIn("America/New_York", new Date("2026-09-18T02:00:00Z"))).toBe("2026-09-17");
  });
});

describe("daily read threshold", () => {
  it("includes anything the canonical engine marked urgent", () => {
    for (const t of ["hot", "warm"] as const) {
      expect(
        passesDailyReadThreshold({ temperature: t, strength: "emerging", isNew: false }),
      ).toBe(true);
    }
  });

  it("includes a genuinely new signal at the engine's own strong strength", () => {
    expect(
      passesDailyReadThreshold({ temperature: "nurture", strength: "strong", isNew: true }),
    ).toBe(true);
  });

  it("excludes routine low-urgency work, however strong or new alone", () => {
    expect(
      passesDailyReadThreshold({ temperature: "nurture", strength: "strong", isNew: false }),
    ).toBe(false);
    expect(
      passesDailyReadThreshold({ temperature: "nurture", strength: "moderate", isNew: true }),
    ).toBe(false);
  });
});

describe("featured card completeness", () => {
  it("needs a name, a reason and a next step", () => {
    expect(isFeaturable({ name: "Maria", reason: "Permit filed", nextStep: "Call" })).toBe(true);
    expect(isFeaturable({ name: "Maria", reason: "", nextStep: "Call" })).toBe(false);
    expect(isFeaturable({ name: "Maria", reason: "Permit filed", nextStep: "  " })).toBe(false);
    expect(isFeaturable({ name: "", reason: "Permit filed", nextStep: "Call" })).toBe(false);
  });

  it("never features an incomplete opportunity", () => {
    const c = buildDailyReadEmail({
      state: "new_signals",
      audience: "agent",
      recipientName: "Neil",
      items: [
        item({ clientId: "blank", nextStep: "", rank: 99 }),
        item({ clientId: "ok", rank: 10 }),
      ],
    });
    expect(c.top.map((t) => t.clientId)).toEqual(["ok"]);
    for (const t of c.top) {
      expect(t.name.trim()).not.toBe("");
      expect(t.reason.trim()).not.toBe("");
      expect(t.nextStep.trim()).not.toBe("");
    }
  });
});

describe("factual category labels", () => {
  it("never predicts homeowner intent and is never vague", () => {
    const labels = Object.values(AGENT_GROUP_LABEL).join(" ").toLowerCase();
    for (const phrase of ["thinking about", "may be", "something changed", "planning to sell"]) {
      expect(labels).not.toContain(phrase);
    }
  });
});

describe("remainder line", () => {
  it("only counts opportunities that passed the threshold", () => {
    const items = [1, 2, 3, 4, 5].map((n) => item({ clientId: `c${n}`, rank: n }));
    expect(
      buildDailyReadEmail({
        state: "new_signals",
        audience: "agent",
        recipientName: "Neil",
        items,
      }).remainingLabel,
    ).toBe("2 more prioritized opportunities are waiting inside SuCasa.");
  });

  it("makes no claim when nothing remains", () => {
    expect(
      buildDailyReadEmail({
        state: "new_signals",
        audience: "agent",
        recipientName: "Neil",
        items: [item()],
      }).remainingLabel,
    ).toBe("See all prioritized opportunities in SuCasa.");
  });
});
