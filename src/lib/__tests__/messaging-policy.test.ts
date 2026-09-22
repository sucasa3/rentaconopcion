import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "fs";

import {
  BLOCKED_REASON,
  assertSendAllowed,
  loadPreferences,
  personChannelBlocks,
  recordProviderOptOut,
  recordSmsReConsent,
  setPreferences,
  subjectKeys,
  SMS_CONSENT_VERSION,
} from "@/lib/messaging-policy.server";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/lib/unsubscribe.server";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";

beforeAll(() => {
  process.env["INVITE_TOKEN_SECRET"] ??= "test-secret-for-messaging-policy";
  process.env["SUPPRESSION_SECRET"] ??= "test-secret-for-messaging-policy";
});

// --- A minimal in-memory stand-in for the admin client ----------------------

type Row = Record<string, any>;

function fakeAdmin() {
  const tables: Record<string, Row[]> = {
    communication_preferences: [],
    communication_preference_events: [],
    deletion_suppressions: [],
  };

  function matches(row: Row, filters: Array<[string, string, any]>): boolean {
    return filters.every(([col, op, val]) => {
      if (op === "eq") return row[col] === val;
      if (op === "in") return (val as any[]).includes(row[col]);
      return true;
    });
  }

  function builder(name: string) {
    const rows = tables[name]!;
    let filters: Array<[string, string, any]> = [];
    let orGroups: Array<Array<[string, string, any]>> = [];
    let patch: Row | null = null;
    let mode: "select" | "update" | "insert" = "select";

    const parse = (clause: string): [string, string, any] => {
      const inMatch = clause.match(/^([a-z_]+)\.in\.\((.*)\)$/);
      if (inMatch) return [inMatch[1]!, "in", inMatch[2]!.split(",")];
      const [col, op, ...rest] = clause.split(".");
      return [col!, op!, rest.join(".")];
    };

    const result = () => {
      let out = rows.filter((r) => matches(r, filters));
      if (orGroups.length) {
        out = out.filter((r) => orGroups.some((g) => matches(r, g)));
      }
      if (mode === "update" && patch) {
        out.forEach((r) => Object.assign(r, patch));
      }
      return { data: out.map((r) => ({ ...r })), error: null };
    };

    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => {
        filters.push([col, "eq", val]);
        return api;
      },
      or: (clause: string) => {
        orGroups = clause
          .split(/,(?=[a-z_]+\.)/)
          .filter(Boolean)
          .map((c) => [parse(c)]);
        return api;
      },
      limit: () => api,
      insert: (row: Row) => {
        mode = "insert";
        rows.push({ id: `row-${rows.length + 1}`, ...row });
        return api;
      },
      update: (p: Row) => {
        mode = "update";
        patch = p;
        return api;
      },
      then: (resolve: (v: any) => void) => resolve(result()),
    };
    return api;
  }

  return {
    from: (name: string) => builder(name),
    _tables: tables,
  };
}

const ANA = { email: "ana@example.com", phone: "+14155550132" };

// --- Purpose is mandatory, and there is no way around the gate --------------

describe("message purpose", () => {
  it("refuses a send with no declared purpose", async () => {
    await expect(
      // @ts-expect-error deliberately omitting the required purpose
      sendTemplateEmail("campaign-update", "ana@example.com", { templateData: {} }),
    ).rejects.toThrow(/purpose/i);
  });

  it("every outbound send path declares a purpose", () => {
    const files = [
      "src/lib/campaigns-run.server.ts",
      "src/lib/outreach.server.ts",
      "src/lib/introductions.server.ts",
      "src/lib/daily-read.server.ts",
      "src/lib/network.functions.ts",
      "src/lib/professional-invitations.server.ts",
      "src/lib/account.server.ts",
      "src/lib/leads.server.ts",
      "src/routes/api/public/lenders.pilot.ts",
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const sends = (src.match(/sendTemplateEmail\(|sendProSms\(/g) ?? []).length;
      const purposes = (src.match(/purpose:\s*"(marketing|transactional)"/g) ?? []).length;
      expect(purposes, `${f} declares a purpose for each send`).toBeGreaterThanOrEqual(
        Math.max(sends - 1, 1),
      );
    }
  });

  it("classifies introduction outreach as marketing, not transactional", () => {
    const src = readFileSync("src/lib/introductions.server.ts", "utf8");
    const idx = src.indexOf('sendTemplateEmail("introduction-invite"');
    expect(idx).toBeGreaterThan(0);
    expect(src.slice(idx, idx + 200)).toContain('purpose: "marketing"');
  });
});

// --- Transactional vs marketing --------------------------------------------

describe("policy gate", () => {
  it("lets transactional messages through even after a full opt-out", async () => {
    const admin = fakeAdmin();
    await setPreferences(
      admin,
      ANA,
      { marketing_email: false, marketing_sms: false, marketing_calls: false },
      { channel: "all", source: "test" },
    );
    for (const channel of ["email", "sms", "call"] as const) {
      const d = await assertSendAllowed(admin, { ...ANA, purpose: "transactional", channel });
      expect(d.allowed).toBe(true);
    }
  });

  it("blocks marketing on an opted-out channel and leaves the others alone", async () => {
    const admin = fakeAdmin();
    await setPreferences(admin, ANA, { marketing_email: false }, { channel: "email", source: "test" });

    const email = await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "email" });
    expect(email.allowed).toBe(false);
    expect(email.reason).toBe(BLOCKED_REASON);

    expect((await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "sms" })).allowed).toBe(true);
    expect((await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "call" })).allowed).toBe(true);
  });

  it("makes do-not-call functional on its own", async () => {
    const admin = fakeAdmin();
    await setPreferences(admin, ANA, { marketing_calls: false }, { channel: "call", source: "test" });
    expect((await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "call" })).allowed).toBe(false);
    expect((await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "email" })).allowed).toBe(true);
  });

  it("drops a message queued before the opt-out, because the check happens at send time", async () => {
    const admin = fakeAdmin();
    const before = await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "email" });
    expect(before.allowed).toBe(true);
    await setPreferences(admin, ANA, { marketing_email: false }, { channel: "email", source: "test" });
    const atSend = await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "email" });
    expect(atSend.allowed).toBe(false);
  });

  it("reveals nothing but the minimum status when a send is blocked", async () => {
    const admin = fakeAdmin();
    await setPreferences(admin, ANA, { marketing_email: false }, { channel: "email", source: "test" });
    const d = await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "email" });
    expect(d.reason).toBe("Contact preference prevents outreach.");
    expect(JSON.stringify(d)).not.toContain("ana@example.com");
  });
});

// --- Provider STOP / START --------------------------------------------------

describe("provider STOP synchronization", () => {
  it("mirrors a provider STOP: marketing texts stop and renewed consent is required", async () => {
    const admin = fakeAdmin();
    await recordProviderOptOut(admin, { phone: ANA.phone, providerMessageId: "msg-1" });

    const prefs = await loadPreferences(admin, ANA);
    expect(prefs.marketing_sms).toBe(false);
    expect(prefs.sms_consent_required).toBe(true);

    const d = await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "sms" });
    expect(d.allowed).toBe(false);

    // Email is a separate decision and is untouched by an SMS STOP.
    expect((await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "email" })).allowed).toBe(true);
  });

  it("keeps the provider STOP authoritative until valid re-consent arrives", async () => {
    const admin = fakeAdmin();
    await recordProviderOptOut(admin, { phone: ANA.phone, providerMessageId: "msg-1" });

    // No evidence at all: nothing is renewed.
    expect((await recordSmsReConsent(admin, ANA, { source: "test" })).renewed).toBe(false);
    expect((await loadPreferences(admin, ANA)).marketing_sms).toBe(false);

    // Channel-native evidence (a START reply) is enough: keyword, number, id.
    const renewed = await recordSmsReConsent(admin, ANA, {
      source: "provider_start_keyword",
      consentText: 'Inbound keyword "START" from +14155550132',
      providerMessageId: "msg-2",
    });
    expect(renewed.renewed).toBe(true);

    const prefs = await loadPreferences(admin, ANA);
    expect(prefs.marketing_sms).toBe(true);
    expect(prefs.sms_consent_required).toBe(false);
    expect((await assertSendAllowed(admin, { ...ANA, purpose: "marketing", channel: "sms" })).allowed).toBe(true);
  });

  it("records the consent evidence without storing message bodies", async () => {
    const admin = fakeAdmin();
    await recordProviderOptOut(admin, { phone: ANA.phone, providerMessageId: "msg-1" });
    await recordSmsReConsent(admin, ANA, {
      source: "account_preference_centre",
      webEventId: "web-1",
      ip: "203.0.113.5",
      userAgent: "test-agent",
    });
    const events = (admin as any)._tables.communication_preference_events as Row[];
    const consent = events.find((e) => e.consent_version === SMS_CONSENT_VERSION);
    expect(consent).toBeTruthy();
    expect(consent!.prior_state.marketing_sms).toBe(false);
    expect(consent!.new_state.marketing_sms).toBe(true);
    expect(consent!.channel).toBe("sms");
    expect(consent!.source).toBe("account_preference_centre");
    expect(consent!.ip).toBe("203.0.113.5");
    // Only keyed identifiers — never a readable address or number.
    expect(JSON.stringify(consent)).not.toContain("ana@example.com");
    expect(JSON.stringify(consent)).not.toContain("4155550132");
  });
});

// --- Unsubscribe tokens -----------------------------------------------------

describe("one-click unsubscribe token", () => {
  it("round-trips and carries no readable address", () => {
    const token = signUnsubscribeToken("Ana@Example.com")!;
    expect(token).toBeTruthy();
    expect(token.toLowerCase()).not.toContain("ana");
    const payload = verifyUnsubscribeToken(token);
    expect(payload?.c).toBe("email");
    expect(payload?.e).toBe(subjectKeys({ email: "ana@example.com" }).emailHmac);
  });

  it("rejects a tampered token", () => {
    const token = signUnsubscribeToken("ana@example.com")!;
    const [body, sig] = token.split(".");
    expect(verifyUnsubscribeToken(`${body}x.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${body}.${sig!.slice(0, -2)}aa`)).toBeNull();
    expect(verifyUnsubscribeToken("not-a-token")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signUnsubscribeToken("ana@example.com", 0)!;
    expect(verifyUnsubscribeToken(token, Date.now())).toBeNull();
  });

  it("opts the person out with no session, using the token identifier alone", async () => {
    const admin = fakeAdmin();
    const payload = verifyUnsubscribeToken(signUnsubscribeToken("ana@example.com")!)!;
    await setPreferences(
      admin,
      { emailHmacOverride: payload.e },
      { marketing_email: false },
      { channel: "email", source: "email_unsubscribe_link" },
    );
    const d = await assertSendAllowed(admin, {
      email: "ana@example.com",
      purpose: "marketing",
      channel: "email",
    });
    expect(d.allowed).toBe(false);
  });
});

// --- Cross-organization outreach -------------------------------------------

describe("organization-held client records", () => {
  it("blocks SuCasa-powered outreach through an organization that holds the record", async () => {
    const admin = fakeAdmin();
    await setPreferences(
      admin,
      ANA,
      { marketing_email: false, marketing_calls: false },
      { channel: "all", source: "test" },
    );
    const blocks = await personChannelBlocks(admin, [
      { id: "client-1", email: ANA.email, phone: ANA.phone },
      { id: "client-2", email: "unrelated@example.com", phone: "+14155559999" },
    ]);
    expect(blocks.get("client-1")).toEqual({
      do_not_email: true,
      do_not_text: false,
      do_not_call: true,
    });
    expect(blocks.has("client-2")).toBe(false);
  });

  it("matches on phone alone when the organization holds no email", async () => {
    const admin = fakeAdmin();
    await recordProviderOptOut(admin, { phone: ANA.phone, providerMessageId: "msg-9" });
    const blocks = await personChannelBlocks(admin, [{ id: "c", phone: ANA.phone }]);
    expect(blocks.get("c")?.do_not_text).toBe(true);
  });
});
