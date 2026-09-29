import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import { readLenderWorkspace } from "@/lib/lender-workspace.server";
const users = { "neil+2":"b13a7f53-764a-4d6e-91e6-706e0b516111", hero:"e7f075bf-be5b-411d-81ad-097c4e625490", mlo:"e2b929ec-97cd-4d31-b598-dce04f9b85fc", manager:"ca1bed62-c53a-4240-9ee1-d49bcd606a88", demo:"d50b05c8-c0db-4627-9b37-37ef9ad501dc" };
const out: any = {};
for (const [k,u] of Object.entries(users)) {
  const ws: any = await readLenderWorkspace(db as any, u);
  if (!ws) { out[k]=null; continue; }
  const book = ws.book as any[];
  out[k] = book.map((c,i)=>({ id:c.id, name:c.name, pos:i, rate:c.recordedRatePct, age:c.loanAgeYears, primary:c.reviews?.[0]?.type??null, reviews:(c.reviews??[]).map((r:any)=>r.type), prio:c.priority, why:c.reviews?.[0]?.why }));
}
await Bun.write(process.argv[2], JSON.stringify(out,null,1));
console.log(Object.fromEntries(Object.entries(out).map(([k,v]:any)=>[k,v?.length??null])));
