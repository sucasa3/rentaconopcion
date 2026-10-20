/** Database-owned claims. No legacy select/update fallback is safe. */
export interface EnrichmentClaim {
  id: string;
  portfolio_client_id: string;
  claim_token: string;
  lease_expires_at: string;
}

export class QueueWriteError extends Error {
  constructor() {
    super("Enrichment queue write failed");
    this.name = "QueueWriteError";
  }
}

async function rpc(admin: any, name: string, args: Record<string, unknown>): Promise<any> {
  try {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new QueueWriteError();
    return data;
  } catch {
    throw new QueueWriteError();
  }
}

export async function claimEnrichmentJobs(admin: any, limit: number): Promise<any[]> {
  const rows = await rpc(admin, "claim_enrichment_jobs", { p_limit: limit });
  if (!Array.isArray(rows) || rows.length > limit ||
      new Set(rows.map(row => row.id)).size !== rows.length ||
      rows.some(row => typeof row.id !== "string" || typeof row.claim_token !== "string" ||
        typeof row.lease_expires_at !== "string" || row.status !== "running")) {
    throw new QueueWriteError();
  }
  return rows;
}

export async function renewEnrichmentClaim(admin: any, claim: EnrichmentClaim): Promise<void> {
  const ok = await rpc(admin, "renew_enrichment_claim", {
    p_id: claim.id, p_token: claim.claim_token,
  });
  if (ok !== true) throw new QueueWriteError();
}

/** Token validation and coupled client/queue mutations share one transaction. */
export async function writeEnrichmentClaim(
  admin: any, claim: EnrichmentClaim, patch: Record<string, unknown>,
  clientPatch: Record<string, unknown> = {},
): Promise<void> {
  const ids = await rpc(admin, "write_enrichment_claim", {
    p_id: claim.id, p_token: claim.claim_token, p_patch: patch, p_client_patch: clientPatch,
  });
  if (!Array.isArray(ids) || ids.length !== 1 || ids[0]?.id !== claim.id) throw new QueueWriteError();
}