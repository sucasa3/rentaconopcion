import { createFileRoute } from "@tanstack/react-router";

/**
 * TEMPORARY: Stage A 15-property BatchData validation trigger.
 * Auth: apikey header must equal SUPABASE_PUBLISHABLE_KEY. Hard-capped at 15
 * live provider calls, retries disabled, ATTOM locked for the duration.
 */
const ADDRESSES: { address: string; label: string }[] = [
  { address: "517 Summerville Dr, Lawrenceville, GA 30046", label: "house/GA" },
  { address: "712 Bowden Rd, Clewiston, FL 33440", label: "house/FL-rural" },
  { address: "225 Nancy Ashworth Ln, Fairview, NC 28730", label: "house/NC" },
  { address: "429 Regina St, Philadelphia, PA 19116", label: "house/PA" },
  { address: "2319 Castilla Isle, Fort Lauderdale, FL 33301", label: "house/FL-highvalue" },
  { address: "1024 Dorothy St, Lakeland, FL 33815", label: "house/FL-lowvalue" },
  { address: "2614 Seidenberg Ave, Key West, FL 33040", label: "house/FL-keys" },
  { address: "10291 Jordan St, Spring Hill, FL 34608", label: "house/FL-suburban" },
  { address: "8006 Roberts Rd, Fort Pierce, FL 34951", label: "house/FL-exurban" },
  { address: "12640 Hempstead Rd Trlr T26, Houston, TX 77092", label: "mobile/TX" },
  { address: "151 Fairway Dr Apt 2314, Miami Springs, FL 33166", label: "unit/condo" },
  { address: "4330 Hillcrest Dr Apt 703, Hollywood, FL 33021", label: "unit/condo" },
  { address: "3474 Whisperwood Ct NW # 62, Marietta, GA 30064", label: "unit/hash" },
  { address: "600 NE 36th St Ph 29, Miami, FL 33137", label: "unit/penthouse" },
  { address: "3250 Conservation Pl Apt 202, Melbourne, FL 32934", label: "unit/apt" },
];

export const Route = createFileRoute("/api/public/bdvalidate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { runBatchdataTest } = await import("@/lib/batchdata-test.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: admin } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin")
          .limit(1)
          .maybeSingle();

        const result = await runBatchdataTest({
          label: "Stage A — 15-property production validation",
          inputs: ADDRESSES.map((a) => ({ address: a.address, sourceLabel: a.label })),
          createdBy: admin?.user_id ?? "00000000-0000-0000-0000-000000000000",
          notes: "Stage A validation. 1 call/property, retries off, ceiling 15, ATTOM locked.",
          noRetry: true,
          maxCalls: 15,
        });
        return Response.json(result);
      },
    },
  },
});
