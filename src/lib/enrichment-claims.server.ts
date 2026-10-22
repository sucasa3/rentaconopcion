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

/** The database refused a provider dispatch (no active release grant, cap reached,
 *  or address already bought under the grant). Nothing was sent. */
export class DispatchRefusedError extends QueueWriteError {
  constructor() {
    super();
    this.name = "DispatchRefusedError";
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

/** Commit intent before IO. Ambiguous persistence never authorizes sending. */
export async function guardedProviderRequest<T>(
  admin: any, claim: EnrichmentClaim, request: () => Promise<T>,
): Promise<T> {
  const dispatch = await rpc(admin, "begin_enrichment_dispatch", {
    p_id: claim.id, p_token: claim.claim_token,
  });
  if (dispatch === null) throw new DispatchRefusedError();
  if (typeof dispatch !== "object" || typeof dispatch.id !== "string") throw new QueueWriteError();
  if (dispatch.replay === true && dispatch.response != null) return dispatch.response as T;
  if (dispatch.replay !== false) throw new QueueWriteError();
  let response: T;
  try {
    response = await request();
  } catch {
    await rpc(admin, "record_enrichment_response", {
      p_dispatch: dispatch.id, p_token: claim.claim_token, p_response: null,
    });
    throw new QueueWriteError();
  }
  const recorded = await rpc(admin, "record_enrichment_response", {
    p_dispatch: dispatch.id, p_token: claim.claim_token, p_response: response,
  });
  if (recorded !== true) throw new QueueWriteError();
  return response;
}

export async function claimEnrichmentJobs(admin: any, limit: number): Promise<any[]> {
  const rows = await rpc(admin, "claim_enrichment_jobs", { p_limit: limit });
  if (!Array.isArray(rows) || rows.length > limit ||
      new Set(rows.map(row => row.id)).size !== rows.length ||
      rows.some(row => typeof row.id !== "string" || typeof row.claim_token !== "string" ||
        typeof row.lease_expires_at !== "string" || !Number.isFinite(Date.parse(row.lease_expires_at)) ||
        row.status !== "running")) {
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

/** Shared cache writes are fenced in the same transaction as token validation. */
export async function persistEnrichmentCache(
  admin: any, claim: EnrichmentClaim, table: "property_intel" | "property_intel_misses",
  patch: Record<string, unknown>,
): Promise<void> {
  const ok = await rpc(admin, "persist_enrichment_cache", {
    p_id: claim.id, p_token: claim.claim_token, p_table: table, p_patch: patch,
  });
  if (ok !== true) throw new QueueWriteError();
}