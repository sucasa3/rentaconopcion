import { createClient } from "@supabase/supabase-js";
import { factsFromRecord } from "../lib/client-facts.server";
import { buildNarrative, copyAgreesWithFacts } from "../lib/opportunity-narrative";
import { normalizeAddress } from "../lib/attom.server";
import { generateDraft } from "../lib/nba.server";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const id = "d8ba4d97-f7d2-42b3-9cab-265ac903cca1";
const { data: c } = await db.from("lender_portfolio_clients").select("*").eq("id", id).single();
const key = normalizeAddress([c.address_line1, c.city, [c.state, c.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "));
const { data: intel } = await db.from("property_intel").select("*").eq("address_normalized", key).maybeSingle();
const f = factsFromRecord(c as any, intel);
const n = buildNarrative({ role: "agent", facts: f, categories: ["equity","heloc","move_up","investment"], firstName: "Kevin" });
for (const ch of ["email","text"] as const) {
  const d = await generateDraft({ audience: "agent", channel: ch, clientName: "Kevin Dejesus", category: "move_up", reasons: [], senderName: "Neil", address: "1280 W Peachtree St NW, Atlanta, GA", facts: f, narrative: n });
  console.log(`\n=== ${ch.toUpperCase()} ===\nSUBJECT: ${d.subject}\nBODY: ${d.body}\nvalid:`, copyAgreesWithFacts(`${d.subject} ${d.body}`, f, "agent"));
}
