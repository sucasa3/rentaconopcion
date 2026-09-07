import { describe, expect, it } from "vitest";
import {
  compareDaily,
  nextStepFor,
  objectiveFor,
  openerFor,
  rankScore,
  SUPPRESSED_STAGES,
  urgencyFor,
} from "./lender-daily";

const base = {
  askedToConnect: false,
  priority: 40,
  daysSinceContact: 30 as number | null,
  followUpOverdueDays: null as number | null,
  annualReviewDue: false,
  engagedRecently: false,
  hasReview: true,
};

describe("urgency (temperature)", () => {
  it("puts an explicit request at the top of urgency", () => {
    expect(urgencyFor({ ...base, askedToConnect: true }).temperature).toBe("hot");
  });

  it("treats an overdue follow-up as hot and says why", () => {
    const u = urgencyFor({ ...base, followUpOverdueDays: 3 });
    expect(u.temperature).toBe("hot");
    expect(u.urgencyReason).toMatch(/overdue/);
  });

  it("spreads across all three labels rather than collapsing to warm", () => {
    const labels = [
      urgencyFor({ ...base, priority: 80 }).temperature,
      urgencyFor({ ...base, priority: 50 }).temperature,
      urgencyFor({ ...base, priority: 10 }).temperature,
    ];
    expect(labels).toEqual(["hot", "warm", "nurture"]);
  });

  it("always gives a plain-language reason", () => {
    expect(urgencyFor({ ...base, priority: 5 }).urgencyReason.length).toBeGreaterThan(5);
  });
});

describe("daily ranking", () => {
  const p = (o: Partial<{ askedToConnect: boolean; contactable: boolean; priority: number }>) => ({
    askedToConnect: false,
    contactable: true,
    priority: 50,
    ...o,
  });

  it("puts homeowners who asked to connect first, whatever their priority", () => {
    const rows = [p({ priority: 99 }), p({ askedToConnect: true, priority: 5 })];
    expect([...rows].sort(compareDaily)[0]!.askedToConnect).toBe(true);
  });

  it("orders everyone else by the existing priority engine", () => {
    const rows = [p({ priority: 30 }), p({ priority: 70 }), p({ priority: 50 })];
    expect([...rows].sort(compareDaily).map((r) => r.priority)).toEqual([70, 50, 30]);
  });

  it("does not let an uncontactable record displace a comparable contactable one", () => {
    const rows = [p({ contactable: false, priority: 60 }), p({ contactable: true, priority: 50 })];
    expect([...rows].sort(compareDaily)[0]!.contactable).toBe(true);
  });

  it("still surfaces a clearly more important uncontactable homeowner", () => {
    const rows = [p({ contactable: false, priority: 95 }), p({ contactable: true, priority: 50 })];
    expect([...rows].sort(compareDaily)[0]!.contactable).toBe(false);
  });

  it("never uses temperature as the sort key", () => {
    // rank depends only on priority and contactability
    expect(rankScore(p({ priority: 60 }))).toBeGreaterThan(rankScore(p({ priority: 59 })));
  });
});

describe("outcome orchestration", () => {
  it("schedules an administrative step for every outcome", () => {
    for (const stage of [
      "no_answer",
      "talked",
      "appointment",
      "application",
      "in_process",
      "closed",
      "not_interested",
      "follow_up",
    ] as const) {
      const plan = nextStepFor(stage);
      expect(plan.nextStep.length).toBeGreaterThan(3);
      expect(plan.dueInDays).toBeGreaterThan(0);
      expect(plan.confirmation.length).toBeGreaterThan(5);
    }
  });

  it("suppresses prospecting once a relationship is in a live workflow", () => {
    for (const stage of SUPPRESSED_STAGES) expect(nextStepFor(stage).suppressProspecting).toBe(true);
    expect(nextStepFor("no_answer").suppressProspecting).toBe(false);
  });

  it("moves closed customers to a post-close cadence rather than dropping them", () => {
    expect(nextStepFor("closed").cadence).toBe("post_close");
  });

  it("honours a chosen follow-up timing", () => {
    expect(nextStepFor("follow_up", { followUpDays: 14 }).dueInDays).toBe(14);
  });
});

describe("what to say", () => {
  it("gives an objective for every homeowner, known review type or not", () => {
    expect(objectiveFor("equity_review").length).toBeGreaterThan(10);
    expect(objectiveFor(null).length).toBeGreaterThan(10);
  });

  it("opens with the homeowner's request when they asked to connect", () => {
    expect(openerFor({ firstName: "Ana", askedToConnect: true, reviewType: null })).toMatch(
      /reaching out/,
    );
  });

  it("never promises approval, rates or eligibility", () => {
    const text = [
      openerFor({ firstName: "Ana", askedToConnect: false, reviewType: "equity_review" }),
      openerFor({ firstName: "Ana", askedToConnect: false, reviewType: null }),
      objectiveFor("refinance_review"),
    ].join(" ");
    expect(text).not.toMatch(/approv|qualif|guarantee|pre-?approved|credit score/i);
  });
});
