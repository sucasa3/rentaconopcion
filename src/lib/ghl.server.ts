// GoHighLevel REST wrapper — server-only.
const BASE = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function ghlFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env("GHL_API_KEY")}`,
      Version: VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GHL ${init.method ?? "GET"} ${path} [${res.status}]: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

export type Homeowner = {
  userId: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  stage: string; // enum key
};

const STAGE_ENV: Record<string, string> = {
  new_signup: "GHL_STAGE_NEW_SIGNUP_ID",
  onboarding: "GHL_STAGE_ONBOARDING_ID",
  active_homeowner: "GHL_STAGE_ACTIVE_ID",
  needs_reengagement: "GHL_STAGE_REENGAGEMENT_ID",
  premium_member: "GHL_STAGE_PREMIUM_ID",
  inactive: "GHL_STAGE_INACTIVE_ID",
};

export function stageIdFor(stage: string): string {
  const key = STAGE_ENV[stage];
  if (!key) throw new Error(`Unknown lifecycle stage: ${stage}`);
  return env(key);
}

// Upsert contact by email; return contact id.
export async function upsertContact(h: Homeowner): Promise<string> {
  const [firstName, ...rest] = (h.fullName ?? "").trim().split(/\s+/);
  const body = {
    locationId: env("GHL_LOCATION_ID"),
    email: h.email ?? undefined,
    phone: h.phone ?? undefined,
    firstName: firstName || undefined,
    lastName: rest.join(" ") || undefined,
    city: h.city ?? undefined,
    state: h.state ?? undefined,
    tags: ["homeowner", "sucasa-app"],
    customFields: [{ key: "sucasa_user_id", field_value: h.userId }],
  };
  const r = await ghlFetch("/contacts/upsert", { method: "POST", body: JSON.stringify(body) });
  const id = r?.contact?.id ?? r?.id;
  if (!id) throw new Error(`upsertContact: no id in response: ${JSON.stringify(r)}`);
  return id;
}

// Find existing opportunity for contact in the homeowners pipeline.
async function findOpportunity(contactId: string): Promise<string | null> {
  const pipelineId = env("GHL_HOMEOWNERS_PIPELINE_ID");
  const locationId = env("GHL_LOCATION_ID");
  const q = new URLSearchParams({ location_id: locationId, contact_id: contactId, pipeline_id: pipelineId });
  const r = await ghlFetch(`/opportunities/search?${q}`);
  const opps: Array<{ id: string }> = r?.opportunities ?? [];
  return opps[0]?.id ?? null;
}

export async function moveToStage(contactId: string, stage: string, homeownerName: string | null): Promise<string> {
  const pipelineId = env("GHL_HOMEOWNERS_PIPELINE_ID");
  const stageId = stageIdFor(stage);
  const existing = await findOpportunity(contactId);
  if (existing) {
    await ghlFetch(`/opportunities/${existing}`, {
      method: "PUT",
      body: JSON.stringify({ pipelineId, pipelineStageId: stageId, status: stage === "inactive" ? "lost" : "open" }),
    });
    return existing;
  }
  const r = await ghlFetch(`/opportunities/`, {
    method: "POST",
    body: JSON.stringify({
      pipelineId,
      pipelineStageId: stageId,
      locationId: env("GHL_LOCATION_ID"),
      name: homeownerName || "Homeowner",
      status: "open",
      contactId,
    }),
  });
  return r?.opportunity?.id ?? r?.id;
}

export async function addContactNote(contactId: string, body: string): Promise<void> {
  await ghlFetch(`/contacts/${contactId}/notes`, {
    method: "POST",
    body: JSON.stringify({ userId: undefined, body }),
  });
}
