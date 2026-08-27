import { createFileRoute } from "@tanstack/react-router";

/**
 * TEMPORARY dev-only harness used to execute the ATTOM vs BatchData benchmark
 * from the sandbox. Refuses to run outside development. Delete after the run.
 */
export const Route = createFileRoute("/api/public/bench-temp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (process.env["NODE_ENV"] === "production") {
          return new Response("Not found", { status: 404 });
        }
        const url = new URL(request.url);
        const action = url.searchParams.get("action");
        const {
          buildSample,
          runBenchmark,
          buildBenchmarkReport,
          BENCHMARK_SEED,
          BENCHMARK_SIZE,
        } = await import("@/lib/benchmark.server");

        try {
          if (action === "sample") {
            const s = await buildSample(BENCHMARK_SEED, BENCHMARK_SIZE);
            return Response.json(s);
          }
          if (action === "run") {
            const res = await runBenchmark({ createdBy: url.searchParams.get("by") ?? "dev-harness" });
            return Response.json(res);
          }
          if (action === "report") {
            const runId = url.searchParams.get("runId")!;
            return Response.json(await buildBenchmarkReport(runId));
          }
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
        }
        return Response.json({ error: "unknown action" }, { status: 400 });
      },
    },
  },
});
