import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DELETION_CONFIRM_WORD, isRecentlyAuthenticated } from "./account-deletion";

const REAUTH_MESSAGE =
  "For your security, please sign in again before deleting your account.";

/** What will happen, shown before the person confirms anything. */
export const getDeletionPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { deletionPreview } = await import("./account-deletion.server");
    const preview = await deletionPreview(supabaseAdmin, context.userId);
    return { ...preview, recentAuth: isRecentlyAuthenticated(context.claims) };
  });

const TransferSchema = z.object({ orgId: z.string().uuid(), toUserId: z.string().uuid() });
export const transferOrganizationOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => TransferSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lastOwnerOrgs, transferOrgOwnership } = await import("./account-deletion.server");
    const owned = await lastOwnerOrgs(supabaseAdmin, context.userId);
    if (!owned.some((o) => o.orgId === data.orgId)) {
      throw new Error("You are not the owner of that organization.");
    }
    return transferOrgOwnership(supabaseAdmin, {
      orgId: data.orgId,
      fromUserId: context.userId,
      toUserId: data.toUserId,
    });
  });

const CloseSchema = z.object({ orgId: z.string().uuid() });
export const closeMyOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => CloseSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lastOwnerOrgs, closeOrganization } = await import("./account-deletion.server");
    const owned = await lastOwnerOrgs(supabaseAdmin, context.userId);
    if (!owned.some((o) => o.orgId === data.orgId)) {
      throw new Error("You are not the owner of that organization.");
    }
    return closeOrganization(supabaseAdmin, { orgId: data.orgId, actorUserId: context.userId });
  });

const DeleteSchema = z.object({ confirm: z.string() });
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => DeleteSchema.parse(i))
  .handler(async ({ data, context }) => {
    if (data.confirm.trim().toUpperCase() !== DELETION_CONFIRM_WORD) {
      return { ok: false as const, reason: "confirm" as const, error: "Please type DELETE to confirm." };
    }
    // Typed confirmation is not enough on an old session.
    if (!isRecentlyAuthenticated(context.claims)) {
      return { ok: false as const, reason: "reauth" as const, error: REAUTH_MESSAGE };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lastOwnerOrgs, executeAccountDeletion } = await import("./account-deletion.server");

    const blocking = await lastOwnerOrgs(supabaseAdmin, context.userId);
    if (blocking.length > 0) {
      return {
        ok: false as const,
        reason: "organization" as const,
        error:
          "You are the last owner of an organization. Transfer it to someone else or close it first.",
        organizations: blocking,
      };
    }

    const outcome = await executeAccountDeletion(supabaseAdmin, context.userId);
    if (outcome.status === "completed") {
      return { ok: true as const, status: outcome.status };
    }
    return {
      ok: false as const,
      reason: "partial" as const,
      error:
        "We stopped all contact and recorded your request, but part of the removal did not finish. Our team has been alerted and will complete it. You will not be contacted in the meantime.",
      failures: outcome.failures.map((f) => f.step),
    };
  });
