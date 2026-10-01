import { ghlFetch } from "../../src/lib/ghl.server";
const r = await ghlFetch(`/contacts/?locationId=${process.env.GHL_LOCATION_ID}&query=${encodeURIComponent("+16784853054")}`);
for (const c of r.contacts ?? []) console.log(JSON.stringify({ id: c.id, name: `${c.firstName} ${c.lastName}`, dnd: c.dnd, dndSettings: c.dndSettings, tags: c.tags }));
