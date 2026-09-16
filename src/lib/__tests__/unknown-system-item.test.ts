import { describe, expect, it } from "vitest";
import {
  LIFESPANS,
  buildMaintenanceTimeline,
  buildUnknownSystemItem,
} from "@/lib/maintenance-rules";

describe("buildUnknownSystemItem", () => {
  it("carries canonical key, label and category for every tracked system", () => {
    for (const cfg of LIFESPANS) {
      const item = buildUnknownSystemItem(cfg.key)!;
      expect(item.key).toBe(cfg.key);
      expect(item.label).toBe(cfg.label);
      expect(item.category).toBe(cfg.category);
    }
  });

  it("returns null for an unknown key", () => {
    expect(buildUnknownSystemItem("bogus")).toBeNull();
  });

  it("asserts no install year and never enters the canonical timeline", () => {
    const item = buildUnknownSystemItem("water_heater")!;
    expect(item.installedYear).toBe(0);
    expect(item.expectedYear).toBe(0);
    const before = buildMaintenanceTimeline(null, [], new Date("2026-01-01"), []);
    const after = buildMaintenanceTimeline(null, [], new Date("2026-01-01"), []);
    expect(after).toEqual(before);
  });
});
