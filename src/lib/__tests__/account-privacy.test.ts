import { describe, expect, it } from "vitest";

import {
  EXCLUDED_FROM_PERSONAL_EXPORT,
  PERSONAL_EXPORT_TABLES,
  codeMatches,
  generateCode,
  hashCode,
  maskPhone,
  normalizePhone,
} from "@/lib/account.server";

describe("personal privacy export scope", () => {
  it("never reads organization-owned client records", () => {
    const included = PERSONAL_EXPORT_TABLES.map((t) => t.table);
    for (const excluded of EXCLUDED_FROM_PERSONAL_EXPORT) {
      expect(included).not.toContain(excluded);
    }
  });

  it("excludes the agent/lender client book explicitly", () => {
    expect(EXCLUDED_FROM_PERSONAL_EXPORT).toContain("lender_portfolio_clients");
    expect(EXCLUDED_FROM_PERSONAL_EXPORT).toContain("sponsored_profiles");
  });

  it("includes the person's own home, consent and communication records", () => {
    const included = PERSONAL_EXPORT_TABLES.map((t) => t.table);
    for (const table of [
      "home_profiles",
      "home_document_facts",
      "service_requests",
      "consent_records",
      "homeowner_lender_consents",
      "outreach_channel_permissions",
      "homeowner_activity_events",
    ]) {
      expect(included).toContain(table);
    }
  });

  it("ties every table to an owner column", () => {
    for (const { table, column } of PERSONAL_EXPORT_TABLES) {
      expect(column, table).toMatch(/^(user_id|homeowner_id)$/);
    }
  });
});

describe("phone normalization", () => {
  it("accepts common US formats", () => {
    expect(normalizePhone("(415) 555-0132")).toBe("+14155550132");
    expect(normalizePhone("415-555-0132")).toBe("+14155550132");
    expect(normalizePhone("14155550132")).toBe("+14155550132");
    expect(normalizePhone("+1 415 555 0132")).toBe("+14155550132");
  });

  it("rejects values that cannot be a phone number", () => {
    expect(normalizePhone("555-0132")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });

  it("only ever shows the last four digits", () => {
    const masked = maskPhone("+14155550132");
    expect(masked).toContain("0132");
    expect(masked).not.toContain("4155");
  });
});

describe("verification codes", () => {
  it("generates a six digit code", () => {
    for (let i = 0; i < 25; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("matches only the same code for the same target", () => {
    const target = "+14155550132";
    const code = "123456";
    const stored = hashCode(code, target);
    expect(codeMatches(code, target, stored)).toBe(true);
    expect(codeMatches("123457", target, stored)).toBe(false);
    // A code issued for one number cannot verify another number.
    expect(codeMatches(code, "+14155550133", stored)).toBe(false);
  });

  it("never stores the code itself", () => {
    const stored = hashCode("123456", "+14155550132");
    expect(stored).not.toContain("123456");
    expect(stored).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("contact-change security notification", () => {
  it("is registered as a sendable template", async () => {
    const { TEMPLATES } = await import("@/lib/email-templates/registry");
    expect(TEMPLATES["security-alert"]).toBeTruthy();
  });

  it("never contains codes, values, or account details", async () => {
    const { render } = await import("@react-email/render");
    const React = (await import("react")).default;
    const { SecurityAlertEmail } = await import("@/lib/email-templates/security-alert");
    const text = await render(
      React.createElement(SecurityAlertEmail, {
        changedWhat: "phone number",
        changedAt: "September 22, 2026",
        language: "en",
      }),
      { plainText: true },
    );
    expect(text).toMatch(/contact information was changed/i);
    expect(text).toMatch(/support@sucasa\.com/);
    // The rendered body carries no verification code and no phone number.
    const body = text.slice(text.indexOf("YOUR CONTACT"), text.indexOf("secure your account"));
    expect(body.replace("September 22, 2026", "")).not.toMatch(/\d/);
    expect(text).not.toMatch(/verification code is/i);
  });
})
