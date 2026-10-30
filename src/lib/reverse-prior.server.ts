/**
 * One prior-search check shared by the Test Lab and the upload workflow.
 * A contact (normalized phone or email) searched in EITHER workflow, in the
 * same workspace or by the same person, is never searched again for money —
 * including uncertain/provider-error outcomes.
 */
const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

export async function findPriorReverseSearch(admin: any, opts: {
  orgId: string; actor: string; phone?: string | null; email?: string | null;
  /** The upload row's own search is a reuse, not a prior search. */
  excludeStagedId?: string;
}): Promise<{ source: "test_lab" | "upload"; id: string } | null> {
  const filters = [opts.phone ? `input_phone.eq.${opts.phone}` : null, opts.email ? `input_email.eq.${opts.email}` : null].filter(Boolean) as string[];
  if (!filters.length) return null;
  const or = filters.join(",");

  const { data: lab, error: labError } = await admin.from("batchdata_reverse_lookups").select("id, org_id, requested_by")
    .or(or).neq("status", "invalid_input").limit(50);
  if (labError) throw new Error("Couldn't verify previous searches. Nothing sent.");
  const labHit = (lab ?? []).find((r: any) => r.org_id === opts.orgId || r.requested_by === opts.actor);
  if (labHit) return { source: "test_lab", id: labHit.id };

  const { data: up, error: upError } = await admin.from("upload_reverse_searches")
    .select("id, staged_id, requested_by, lender_portfolios!inner(lender_org_id)").or(or).limit(50);
  if (upError) {
    // Before the upload migration exists there are, by definition, no upload searches.
    if (MISSING_TABLE.has(upError.code)) return null;
    throw new Error("Couldn't verify previous searches. Nothing sent.");
  }
  const upHit = (up ?? []).find((r: any) => r.staged_id !== opts.excludeStagedId
    && (r.requested_by === opts.actor || r.lender_portfolios?.lender_org_id === opts.orgId));
  return upHit ? { source: "upload", id: upHit.id } : null;
}
