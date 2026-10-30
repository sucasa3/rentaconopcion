import { describe, expect, it } from "vitest";
import { singleContactCsv, singleContactMode } from "../single-contact";
import { parseUploadCsv, planUpload } from "../upload-intake";

const base = { fullName: "Ana Ruiz", address: "", email: "", phone: "" };

describe("single-client entry", () => {
  it("requires a name", () => expect(singleContactMode({ ...base, fullName: " ", phone: "4045551234" })).toBe("invalid"));
  it("name + address keeps the existing address flow", () => expect(singleContactMode({ ...base, address: "1 Main St" })).toBe("address"));
  it("name + phone only is contact-only", () => expect(singleContactMode({ ...base, phone: "(404) 555-1234" })).toBe("contact_only"));
  it("name + email only is contact-only", () => expect(singleContactMode({ ...base, email: "ana@example.com" })).toBe("contact_only"));
  it("name alone or a bad phone/email is rejected", () => {
    expect(singleContactMode(base)).toBe("invalid");
    expect(singleContactMode({ ...base, phone: "555", email: "nope" })).toBe("invalid");
  });
  it("one-row file plans as contact-only and uses no Home Profile or paid lookup", () => {
    const { rows } = parseUploadCsv(singleContactCsv({ fullName: 'Ruiz, "Ana"', email: "ana@example.com", phone: "4045551234" }));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Ruiz, "Ana"');
    const plan = planUpload({ role: "agent", rows, existingKeys: new Set(), cachedAddressKeys: new Set(),
      capacityRemaining: 0, approvedLookups: 0, lookupCostCents: 10 });
    expect(plan.results[0].outcome).toBe("contact_only");
  });
});
