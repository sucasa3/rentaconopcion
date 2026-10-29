import { describe, expect, it } from "vitest";
import { candidateFor } from "../suppression.server";
import { runMixedUpload } from "../mixed-upload.server";

// A phone-only contact who opted out must be suppressed by the mixed upload, whatever the phone format.
const optedOut = candidateFor({ phone: "+16785550101" }).phoneHmac!;

function fakeAdmin() {
  const calls: { rpc?: any } = {};
  const empty = async () => ({ data: [], error: null });
  const from = (table: string) => {
    let orFilter = "";
    const q: any = {
      select: () => q, eq: () => q, is: () => q, in: () => (table === "property_intel" ? empty() : q),
      or: (f: string) => { orFilter = f; return q; },
      limit: async () => ({ data: table === "deletion_suppressions" && orFilter.includes(optedOut) ? [{ phone_hmac: optedOut }] : [], error: null }),
      then: (res: any) => res({ data: [], error: null }),
    };
    return q;
  };
  const admin = {
    from,
    rpc: async (_name: string, args: any) => { calls.rpc = args; return { data: { batch_id: "b", replayed: false, counts: {} }, error: null }; },
  };
  return { admin, calls };
}

describe("mixed upload opt-out check (phone only)", () => {
  it("suppresses an opted-out phone in every common format and keeps other phones", async () => {
    const csv = [
      "full_name,phone",
      "A One,678-555-0101",
      "B Two,(678) 555 0101",
      "C Three,+1 678.555.0101",
      "D Four,16785550101",
      "E Five,6785550199",
    ].join("\n");
    const { admin, calls } = fakeAdmin();
    await runMixedUpload({ admin, portfolioId: "p", actorId: "u", role: "agent", csv });
    const outcomes = (calls.rpc.p_rows as any[]).map((r) => r.outcome);
    expect(outcomes).toEqual(["suppressed", "suppressed", "suppressed", "suppressed", "contact_only"]);
    // Nothing identifying is staged for suppressed rows.
    expect((calls.rpc.p_rows as any[]).slice(0, 4).every((r) => r.identity_key === null && Object.keys(r.payload).length === 0)).toBe(true);
  });
});
