/**
 * Provider-level STOP / do-not-disturb is the last word.
 *
 * Three enforcement layers exist and must stay distinct:
 *   1. SuCasa marketing preference — blocks marketing only; transactional passes.
 *   2. GoHighLevel / carrier STOP (DND) — blocks every outbound text, including
 *      transactional ones. SuCasa surfaces that refusal and never works around it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const original = { ...process.env };

async function loadGhl() {
  vi.resetModules();
  return await import("../ghl.server");
}

function refuseWithDnd() {
  return vi.fn(async () =>
    new Response(JSON.stringify({ message: "Contact is in DND state for SMS" }), { status: 400 }),
  );
}

describe("provider STOP / DND enforcement", () => {
  beforeEach(() => {
    process.env = { ...original, GHL_API_KEY: "test-key", GHL_LOCATION_ID: "loc_test" };
  });

  it("classifies a provider do-not-disturb refusal as provider_dnd", async () => {
    const fetchMock = refuseWithDnd();
    vi.stubGlobal("fetch", fetchMock);
    const { ghlFetch } = await loadGhl();
    await expect(ghlFetch("/conversations/messages", { method: "POST" })).rejects.toMatchObject({
      name: "GhlError",
      kind: "provider_dnd",
    });
  });

  it("reports a transactional text as not sent when the provider refuses for STOP", async () => {
    vi.stubGlobal("fetch", refuseWithDnd());
    const { sendProSms } = await loadGhl();
    const result = await sendProSms("+15555550123", "Your code is 123456", {
      purpose: "transactional",
    });
    // Not sent, and nothing attempts to clear or override the provider state.
    expect(result).toEqual({ sent: false, reason: "provider_stop" });
  });

  it("surfaces the provider refusal to the verification-code caller", async () => {
    vi.stubGlobal("fetch", refuseWithDnd());
    const { sendVerificationSms } = await loadGhl();
    await expect(sendVerificationSms("+15555550123", "code")).rejects.toThrow(/opted out/i);
  });

  it("does not retry or re-send after a provider refusal", async () => {
    const fetchMock = refuseWithDnd();
    vi.stubGlobal("fetch", fetchMock);
    const { sendProSms } = await loadGhl();
    await sendProSms("+15555550123", "hi", { purpose: "transactional" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still sends a transactional text when the provider accepts it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 })));
    const { sendProSms } = await loadGhl();
    await expect(
      sendProSms("+15555550123", "Your code is 123456", { purpose: "transactional" }),
    ).resolves.toEqual({ sent: true });
  });

  it("propagates other provider errors unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message: "rate limit" }), { status: 429 })),
    );
    const { sendProSms } = await loadGhl();
    await expect(
      sendProSms("+15555550123", "hi", { purpose: "transactional" }),
    ).rejects.toMatchObject({ kind: "rate_limited" });
  });
});
