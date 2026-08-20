// Read-only (plus one throwaway test contact) diagnostics for the GoHighLevel
// connection. Server-only. Every probe returns a pass/fail row with the raw
// GHL message so an admin can see exactly which scope or object is missing.
import { GhlError, ghlFetch, locationId } from "./ghl.server";

export type CheckStatus = "pass" | "fail" | "skipped";

export type DoctorCheck = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
};

export type DoctorReport = {
  ranAt: string;
  ok: boolean;
  checks: DoctorCheck[];
  missingCustomFields: string[];
  missingTags: string[];
};

const REQUIRED_FIELDS = [
  "sc_value",
  "sc_equity",
  "sc_campaign_body",
  "sc_cta_url",
  "sucasa_user_id",
  "sucasa_language",
];

const TEST_CONTACT_EMAIL = "ghl-check@sucasa.com";

function describe(e: unknown): string {
  if (e instanceof GhlError) return `${e.kind} (${e.status}): ${e.detail}`;
  return e instanceof Error ? e.message : String(e);
}

function envPresence(): DoctorCheck {
  const missing = ["GHL_API_KEY", "GHL_LOCATION_ID", "GHL_HOMEOWNERS_PIPELINE_ID"].filter(
    (k) => !process.env[k],
  );
  return {
    key: "env",
    label: "Credentials configured",
    status: missing.length ? "fail" : "pass",
    detail: missing.length ? `Missing: ${missing.join(", ")}` : "Token, location and pipeline set",
  };
}

export async function runGhlDoctor(): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const missingCustomFields: string[] = [];
  const missingTags: string[] = [];

  const envCheck = envPresence();
  checks.push(envCheck);
  if (envCheck.status === "fail") {
    return {
      ranAt: new Date().toISOString(),
      ok: false,
      checks,
      missingCustomFields: REQUIRED_FIELDS,
      missingTags: [],
    };
  }

  const loc = locationId();

  // 1. Location / token validity
  let locationOk = false;
  try {
    const r = await ghlFetch(`/locations/${loc}`);
    locationOk = true;
    checks.push({
      key: "location",
      label: "Token + location valid",
      status: "pass",
      detail: r?.location?.name ? `Connected to "${r.location.name}"` : `Location ${loc} reachable`,
    });
  } catch (e) {
    checks.push({
      key: "location",
      label: "Token + location valid",
      status: "fail",
      detail: describe(e),
    });
  }

  // 2. Contacts read scope
  try {
    const q = new URLSearchParams({ locationId: loc, query: "sucasa", limit: "1" });
    await ghlFetch(`/contacts/?${q}`);
    checks.push({
      key: "contacts_read",
      label: "Contacts read scope",
      status: "pass",
      detail: "contacts.readonly OK",
    });
  } catch (e) {
    checks.push({
      key: "contacts_read",
      label: "Contacts read scope",
      status: "fail",
      detail: describe(e),
    });
  }

  // 3. Contacts write scope — upsert a dedicated throwaway contact
  try {
    const r = await ghlFetch("/contacts/upsert", {
      method: "POST",
      body: JSON.stringify({
        locationId: loc,
        email: TEST_CONTACT_EMAIL,
        firstName: "SuCasa",
        lastName: "Connection Check",
        tags: ["sucasa-connection-check"],
      }),
    });
    const id = r?.contact?.id ?? r?.id;
    checks.push({
      key: "contacts_write",
      label: "Contacts write scope",
      status: "pass",
      detail: `contacts.write OK (test contact ${String(id ?? "created")})`,
    });
  } catch (e) {
    checks.push({
      key: "contacts_write",
      label: "Contacts write scope",
      status: "fail",
      detail: describe(e),
    });
  }

  // 4. Opportunities read + pipeline/stage resolution
  const pipelineId = process.env["GHL_HOMEOWNERS_PIPELINE_ID"];
  try {
    const r = await ghlFetch(`/opportunities/pipelines?locationId=${loc}`);
    const pipelines: any[] = r?.pipelines ?? [];
    const match = pipelines.find((p) => p?.id === pipelineId);
    if (!match) {
      checks.push({
        key: "pipeline",
        label: "Homeowners pipeline exists",
        status: "fail",
        detail: `Pipeline ${pipelineId} not found in this location. Available: ${
          pipelines.map((p) => `${p.name} (${p.id})`).join(", ") || "none"
        }`,
      });
    } else {
      const stageIds = new Set((match.stages ?? []).map((s: any) => s.id));
      const stageEnvs: Array<[string, string]> = [
        ["new_signup", "GHL_STAGE_NEW_SIGNUP_ID"],
        ["onboarding", "GHL_STAGE_ONBOARDING_ID"],
        ["active_homeowner", "GHL_STAGE_ACTIVE_ID"],
        ["needs_reengagement", "GHL_STAGE_REENGAGEMENT_ID"],
        ["premium_member", "GHL_STAGE_PREMIUM_ID"],
        ["inactive", "GHL_STAGE_INACTIVE_ID"],
      ];
      const bad = stageEnvs.filter(([, k]) => {
        const v = process.env[k];
        return !v || !stageIds.has(v);
      });
      checks.push({
        key: "pipeline",
        label: "Homeowners pipeline + stages resolve",
        status: bad.length ? "fail" : "pass",
        detail: bad.length
          ? `Stage IDs missing or not in pipeline: ${bad.map(([s]) => s).join(", ")}`
          : `"${match.name}" with ${stageIds.size} stages`,
      });
    }
  } catch (e) {
    checks.push({
      key: "pipeline",
      label: "Homeowners pipeline + stages resolve",
      status: "fail",
      detail: describe(e),
    });
  }

  // 5. Opportunities search scope
  try {
    const q = new URLSearchParams({ location_id: loc, limit: "1" });
    await ghlFetch(`/opportunities/search?${q}`);
    checks.push({
      key: "opportunities",
      label: "Opportunities scope",
      status: "pass",
      detail: "opportunities.readonly OK",
    });
  } catch (e) {
    checks.push({
      key: "opportunities",
      label: "Opportunities scope",
      status: "fail",
      detail: describe(e),
    });
  }

  // 6. Custom fields present
  try {
    const r = await ghlFetch(`/locations/${loc}/customFields`);
    const fields: any[] = r?.customFields ?? r?.customField ?? [];
    const known = new Set(
      fields.flatMap((f) => [f?.fieldKey, f?.key, f?.name].filter(Boolean).map((v: string) => String(v))),
    );
    const has = (name: string) =>
      Array.from(known).some((k) => k === name || k.endsWith(`.${name}`) || k === `contact.${name}`);
    for (const f of REQUIRED_FIELDS) if (!has(f)) missingCustomFields.push(f);
    checks.push({
      key: "custom_fields",
      label: "Campaign custom fields present",
      status: missingCustomFields.length ? "fail" : "pass",
      detail: missingCustomFields.length
        ? `Create in GHL: ${missingCustomFields.join(", ")}`
        : `All ${REQUIRED_FIELDS.length} fields found`,
    });
  } catch (e) {
    checks.push({
      key: "custom_fields",
      label: "Campaign custom fields present",
      status: "fail",
      detail: describe(e),
    });
  }

  // 7. Campaign tags present in the location
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: campaigns } = await supabaseAdmin
      .from("campaigns")
      .select("key, ghl_tag")
      .eq("active", true);
    const wanted = (campaigns ?? []).map((c) => c.ghl_tag).filter(Boolean) as string[];
    const r = await ghlFetch(`/locations/${loc}/tags`);
    const tags: any[] = r?.tags ?? [];
    const known = new Set(tags.map((t) => String(t?.name ?? "").toLowerCase()));
    for (const t of wanted) if (!known.has(t.toLowerCase())) missingTags.push(t);
    checks.push({
      key: "tags",
      label: "Campaign tags present",
      status: missingTags.length ? "fail" : "pass",
      detail: missingTags.length
        ? `${missingTags.length} of ${wanted.length} tags not in GHL yet (they are created on first push, but the workflow must exist): ${missingTags.join(", ")}`
        : `All ${wanted.length} campaign tags found`,
    });
  } catch (e) {
    checks.push({
      key: "tags",
      label: "Campaign tags present",
      status: "fail",
      detail: describe(e),
    });
  }

  const blocking = checks.filter(
    (c) => c.status === "fail" && ["env", "location", "contacts_read", "contacts_write"].includes(c.key),
  );

  return {
    ranAt: new Date().toISOString(),
    ok: blocking.length === 0 && locationOk,
    checks,
    missingCustomFields,
    missingTags,
  };
}
