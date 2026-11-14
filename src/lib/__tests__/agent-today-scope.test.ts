import { describe, expect, it } from "vitest";
import { chunk, selectInChunks } from "@/lib/chunked-in";
import { firstRunMode } from "@/lib/agent-daily";

describe("Agent Today signal batching", () => {
  it("splits 736 homeowner ids into batches of at most 100", () => {
    const ids = Array.from({ length: 736 }, (_, i) => `id-${i}`);
    const batches = chunk(ids);
    expect(batches.length).toBe(8);
    expect(Math.max(...batches.map((b) => b.length))).toBe(100);
  });
  it("throws when any batch fails instead of returning no rows", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`);
    await expect(
      selectInChunks(ids, async (b) => (b[0] === "id-100" ? { data: null, error: { message: "400" } } : { data: [], error: null })),
    ).rejects.toThrow("400");
  });
  it("zero signals without active processing does not show preparation", () => {
    expect(firstRunMode({ seen: false, clientCount: 101, queueCount: 0, enrichmentPending: false })).toBe("none");
  });
});
