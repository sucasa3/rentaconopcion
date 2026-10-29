/**
 * Reverse Lookup Test Lab — server functions (Phase 1, preview only).
 *
 * Every function requires a signed-in user and scopes all reads/writes to
 * organizations the caller belongs to. The paid provider call itself lives in
 * batchdata-reverse.server.ts behind cache, dedupe and monthly-cap checks.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listReverseLookupContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listReverseContacts } = await import("./batchdata-reverse.server");
    return listReverseContacts(context.userId);
  });

export const listReverseLookupHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { listReverseLookups } = await import("./batchdata-reverse.server");
    return listReverseLookups(context.userId);
  });

export const runContactReverseLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { clientId: string }) => {
    if (!input?.clientId || typeof input.clientId !== "string") {
      throw new Error("clientId is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { runContactReverseLookup } = await import("./batchdata-reverse.server");
    const result = await runContactReverseLookup({ userId: context.userId, clientId: data.clientId });
    if (result.outcome === "blocked") throw new Error(result.reason);
    return result;
  });

export const approveReverseLookupProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lookupId: string; personIndex: number }) => {
    if (!input?.lookupId || typeof input.lookupId !== "string") {
      throw new Error("lookupId is required");
    }
    if (typeof input.personIndex !== "number" || input.personIndex < 0) {
      throw new Error("personIndex is required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const mod = await import("./batchdata-reverse.server");
    const result = await mod.approveReverseLookupProperty({
      userId: context.userId,
      lookupId: data.lookupId,
      personIndex: data.personIndex,
    });
    if (result.outcome === "blocked") throw new Error(result.reason);
    return result;
  });
