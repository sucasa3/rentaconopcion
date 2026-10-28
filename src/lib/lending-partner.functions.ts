import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertMember } from "./network.server";

export const getMyLendingContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { lendingContactForHomeowner } = await import("./lending-partner.server");
    return lendingContactForHomeowner(supabaseAdmin, context.userId);
  });

export const requestMortgageConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        designationId: z.string().uuid(),
        channel: z.enum(["email", "phone"]),
        email: z.string().trim().email().max(255).nullable(),
        phone: z.string().trim().min(7).max(30).nullable(),
        includeValueEquity: z.boolean(),
        confirmed: z.literal(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { requestLendingConversation } = await import("./lending-partner.server");
    return requestLendingConversation(supabaseAdmin, {
      homeownerId: context.userId,
      designationId: data.designationId,
      channel: data.channel,
      email: data.email,
      phone: data.phone,
      includeValueEquity: data.includeValueEquity,
    });
  });

export const getLendingDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ agentOrgId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const org = await assertMember(context.supabase, context.userId, data.agentOrgId);
    if ((org as any).org_type && (org as any).org_type !== "agent") throw new Error("Agents only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { agentDesignationState } = await import("./lending-partner.server");
    return agentDesignationState(supabaseAdmin, data.agentOrgId);
  });

export const setLendingDesignation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({ agentOrgId: z.string().uuid(), connectionId: z.string().uuid().nullable() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const org = await assertMember(context.supabase, context.userId, data.agentOrgId);
    if ((org as any).org_type && (org as any).org_type !== "agent") throw new Error("Agents only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { setAgentDesignation } = await import("./lending-partner.server");
    return setAgentDesignation(supabaseAdmin, {
      agentOrgId: data.agentOrgId,
      actorUserId: context.userId,
      connectionId: data.connectionId,
    });
  });
