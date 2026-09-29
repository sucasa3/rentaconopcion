import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readLenderWorkspace } from "@/lib/lender-workspace.server";
const lw:any=await readLenderWorkspace(supabaseAdmin as any,"b13a7f53-764a-4d6e-91e6-706e0b516111");
for (const c of lw.book.filter((c:any)=>c.name==="Angel Montano")) console.log(c.address, JSON.stringify(c.reviews.map((r:any)=>[r.type,r.priority,r.why])), c.recordedRatePct, c.loanAgeYears);
