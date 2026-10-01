import { supabaseAdmin as db } from "../src/integrations/supabase/client.server";
const { data, error } = await db.from("communication_preferences").select("*");
console.log(JSON.stringify(data), error?.message);
const e = await db.from("communication_preference_events").select("*").order("created_at",{ascending:false}).limit(3);
console.log(JSON.stringify(e.data?.map((r:any)=>({...r, phone_hmac:undefined, email_hmac:undefined}))), e.error?.message);
