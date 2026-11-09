import { describe, it, expect } from "vitest";
import { claimStatus, claimMessages } from "../homeowner-claim";

const base = { created_at: "2026-11-01", link_copied_at: "2026-11-01", expires_at: "2026-11-15T00:00:00Z", revoked_at: null, claimed_at: null, home_confirmed_at: null, home_corrected: false, connection_outcome: null, activated_at: null };
const now = Date.parse("2026-11-09");

describe("homeowner claim status", () => {
  it("copied link is not claimed or sent", () => {
    expect(claimStatus(base, now).state).toBe("link_copied");
  });
  it("unclaimed link past expiry is expired", () => {
    expect(claimStatus(base, Date.parse("2026-11-20")).state).toBe("expired");
  });
  it("claim with declined connection reports both separately", () => {
    const s = claimStatus({ ...base, claimed_at: "x", connection_outcome: "declined" }, now);
    expect(s.state).toBe("claimed");
    expect(s.connection).toBe("declined");
  });
  it("activation needs claim + home confirmed + maintenance", () => {
    expect(claimStatus({ ...base, claimed_at: "x", activated_at: "y" }, now).activated).toBe(false);
    expect(claimStatus({ ...base, claimed_at: "x", home_confirmed_at: "y", activated_at: "z" }, now).activated).toBe(true);
  });
  it("messages include the link in both languages", () => {
    const m = claimMessages({ firstName: "Ana", agentName: "Neil", address: "1 Main St", url: "https://x/claim?t=1" });
    expect(m.en).toContain("https://x/claim?t=1");
    expect(m.es).toContain("https://x/claim?t=1");
  });
});
