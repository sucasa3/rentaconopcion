import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readLenderWorkspace } from "@/lib/lender-workspace.server";
const db:any=supabaseAdmin;
const {data:us}=await db.from("profiles").select("id,email").in("email",["neil+2@sucasa.com","lender.hero@sucasatest.com","lender.manager@sucasatest.com","lender.mlo@sucasatest.com"]);
for(const u of us??[]){
  const {data:m}=await db.from("lender_members").select("lender_org_id").eq("user_id",u.id);
  for(const x of m??[]){
    const lw:any=await readLenderWorkspace(db,u.id,{orgId:x.lender_org_id});
    for(const c of lw?.book??[]){
      if(!/montano|calloway|terc|quintero/i.test(c.name)) continue;
      console.log("\n##",u.email,"|",c.name,"|",c.city??c.address??"", "| rate",c.recordedRatePct,"| age",c.loanAgeYears);
      for(const r of c.reviews??[]) console.log("  -",r.label,"::",r.why.join(" / "));
    }
  }
}
