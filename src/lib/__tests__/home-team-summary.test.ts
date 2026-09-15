import { describe, expect, it } from "vitest";
import { homeownerProfessionalName } from "../home-team-summary";
import { grantsNamedHomeownerAccess } from "../relationships";

describe("homeowner Home Team presentation", () => {
  it("uses a privacy-safe first name and last initial", () => {
    expect(homeownerProfessionalName("Maria Hernandez")).toBe("Maria H.");
    expect(homeownerProfessionalName("Jon")).toBe("Jon");
  });

  it("does not turn a displayed relationship into permission", () => {
    expect(grantsNamedHomeownerAccess()).toBe(false);
  });
});