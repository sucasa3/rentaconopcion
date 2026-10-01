import { describe, expect, it } from "vitest";
import { actionKey, proposeMaintenanceActions } from "./inspection-maintenance";

const NOW = new Date("2026-10-01T12:00:00Z");
const roof = { system: "roof", urgency: "12_months", defects: ["Granule loss"], recommended_action: "Roofer evaluation", source_pages: [2, 3] };

describe("proposeMaintenanceActions", () => {
  it("dates relative to the inspection, keeps urgency and pages", () => {
    const [p] = proposeMaintenanceActions([roof], "2026-09-15", [], NOW);
    expect(p).toMatchObject({ kind: "new", urgency: "12_months", dueBy: "2027-09-15", sourcePages: [2, 3], needsConfirmation: false });
  });
  it("urgent finding gets a one-month deadline from the inspection", () => {
    const [p] = proposeMaintenanceActions([{ ...roof, urgency: "immediate" }], "2026-09-20", [], NOW);
    expect(p.dueBy).toBe("2026-10-20");
  });
  it("no stated urgency → no invented deadline", () => {
    const [p] = proposeMaintenanceActions([{ system: "hvac", defects: ["Old unit"] }], "2026-09-20", [], NOW);
    expect(p.urgency).toBeNull();
    expect(p.dueBy).toBeNull();
  });
  it("older report or elapsed deadline asks for confirmation", () => {
    const [old] = proposeMaintenanceActions([roof], "2019-03-10", [], NOW);
    expect(old.needsConfirmation).toBe(true);
    const [elapsed] = proposeMaintenanceActions([{ ...roof, urgency: "immediate" }], "2026-07-01", [], NOW);
    expect(elapsed.needsConfirmation).toBe(true);
    const [noDate] = proposeMaintenanceActions([roof], null, [], NOW);
    expect(noDate.needsConfirmation).toBe(true);
  });
  it("preserves completed tasks and flags material changes to open ones", () => {
    const key = actionKey("roof", "Roofer evaluation");
    const done = proposeMaintenanceActions([roof], "2026-09-15", [{ action_key: key, title: "x", urgency: "12_months", due_by: null, status: "done" }], NOW);
    expect(done[0].kind).toBe("kept");
    const same = proposeMaintenanceActions([roof], "2026-09-15", [{ action_key: key, title: "x", urgency: "12_months", due_by: "2027-09-15", status: "open" }], NOW);
    expect(same[0].kind).toBe("same");
    const upd = proposeMaintenanceActions([roof], "2026-09-15", [{ action_key: key, title: "x", urgency: "1_3_years", due_by: "2029-01-01", status: "open" }], NOW);
    expect(upd[0].kind).toBe("update");
  });
  it("dedupes repeated findings in one report", () => {
    expect(proposeMaintenanceActions([roof, roof], "2026-09-15", [], NOW)).toHaveLength(1);
  });
  it("skips findings with nothing to act on", () => {
    expect(proposeMaintenanceActions([{ system: "roof" }], "2026-09-15", [], NOW)).toHaveLength(0);
  });
});
