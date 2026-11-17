import { describe, it, expect } from "vitest";
import { rowListLabel } from "@/components/discovery-upload-rows";

describe("row list label", () => {
  it("says 'Showing first 500 of 820 rows' when capped", () => {
    expect(rowListLabel(500, 820, false)).toBe("Showing first 500 of 820 rows");
    expect(rowListLabel(500, 820, true)).toBe("Mostrando las primeras 500 de 820 filas");
  });
  it("says 'See all 5 rows' when nothing is hidden", () => {
    expect(rowListLabel(5, 5, false)).toBe("See all 5 rows");
  });
});
