import { describe, expect, it } from "vitest";
import { rewriteNoLienEquity } from "@/lib/lender-workspace.server";

describe("no-active-lien equity wording", () => {
  it("never says 100% of the home's value or cash-out headroom", () => {
    const out = rewriteNoLienEquity(
      ["$481,378 of estimated equity", "About 100% of your home's value, with roughly $385,102 of cash-out headroom."],
      48_137_800,
    );
    expect(out.join(" ")).not.toMatch(/100%|headroom/);
    expect(out[0]).toMatch(/^Estimated equity approximately \$481,378/);
    expect(out[1]).toBe("No active mortgage or lien was found in the current property record.");
  });
  it("leaves unrelated reasons alone", () => {
    expect(rewriteNoLienEquity(["Long tenure"], 1)).toEqual(["Long tenure"]);
  });
});
