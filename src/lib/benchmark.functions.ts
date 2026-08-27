import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

/** Stage 1 — deterministic sample. Read-only, makes zero provider calls. */
export const getBenchmarkSample = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seed?: string; size?: number }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { buildSample, BENCHMARK_SEED, BENCHMARK_SIZE } = await import("./benchmark.server");
    return buildSample(data.seed ?? BENCHMARK_SEED, data.size ?? BENCHMARK_SIZE);
  });

/** Stage 2 — the authorized BatchData run. One call per property, no retries. */
export const runBenchmarkTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { seed?: string; size?: number; label?: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { runBenchmark } = await import("./benchmark.server");
    const res = await runBenchmark({
      createdBy: context.userId,
      ...(data.seed ? { seed: data.seed } : {}),
      ...(data.size ? { size: data.size } : {}),
      ...(data.label ? { label: data.label } : {}),
    });
    return { runId: res.runId, requested: res.requested, blocked: res.blocked };
  });

/** Stage 3 — comparison report. Read-only over stored data. */
export const getBenchmarkReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { runId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { buildBenchmarkReport } = await import("./benchmark.server");
    return buildBenchmarkReport(data.runId);
  });
