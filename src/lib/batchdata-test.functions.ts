import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

export const testBatchdataConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { batchdataConnectionTest } = await import("./batchdata-test.server");
    return batchdataConnectionTest();
  });

export const listBatchdataCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("lender_portfolio_clients")
      .select("id, client_name, address_line1, city, state, zip")
      .not("address_line1", "is", null)
      .limit(Math.min(data.limit ?? 100, 200));
    return (rows ?? []).map((r) => ({
      id: r.id,
      name: r.client_name,
      address: [r.address_line1, r.city, [r.state, r.zip].filter(Boolean).join(" ")]
        .filter(Boolean)
        .join(", "),
    }));
  });

export const startBatchdataTestRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      label: string;
      contactIds?: string[];
      pastedAddresses?: string[];
      csvRows?: { address: string; label?: string | null }[];
      notes?: string | null;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runBatchdataTest, MAX_TEST_INPUTS } = await import("./batchdata-test.server");

    const inputs: { address: string; sourceContactId?: string | null; sourceLabel?: string | null }[] = [];

    if (data.contactIds?.length) {
      const { data: rows } = await supabaseAdmin
        .from("lender_portfolio_clients")
        .select("id, client_name, address_line1, city, state, zip")
        .in("id", data.contactIds.slice(0, MAX_TEST_INPUTS));
      for (const r of rows ?? []) {
        const address = [r.address_line1, r.city, [r.state, r.zip].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ");
        if (address.trim()) inputs.push({ address, sourceContactId: r.id, sourceLabel: r.client_name });
      }
    }

    for (const row of data.csvRows ?? []) {
      const address = (row.address ?? "").trim();
      if (address) inputs.push({ address, sourceLabel: row.label ?? "csv" });
    }

    for (const line of data.pastedAddresses ?? []) {
      const address = line.trim();
      if (address) inputs.push({ address, sourceLabel: "pasted" });
    }

    if (inputs.length === 0) throw new Error("No addresses to test.");

    return runBatchdataTest({
      label: data.label,
      inputs,
      createdBy: context.userId,
      notes: data.notes ?? null,
    });
  });


export const getBatchdataTestRuns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("batchdata_test_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25);
    return data ?? [];
  });

export const getBatchdataTestResults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("batchdata_test_results")
      .select("*")
      .eq("test_run_id", data.runId)
      .order("created_at", { ascending: true });
    return rows ?? [];
  });
