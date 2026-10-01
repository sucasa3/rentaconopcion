import { lookupContactDnd } from "../src/lib/ghl.server";
import { supabaseAdmin as db } from "../src/integrations/supabase/client.server";
const p="+16784853054";
console.log("ghl_dnd", await lookupContactDnd(p));
const { data } = await db.from("communication_preferences").select("*").limit(200);
const { createHmac } = await import("crypto");
console.log("prefs rows", data?.length);
const { data: ev } = await db.from("communication_preference_events").select("event_type,channel,source,created_at").order("created_at",{ascending:false}).limit(6);
console.log(JSON.stringify(ev));
