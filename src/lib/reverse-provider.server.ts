import { buildReverseRequestBody, classifyReverseItem, estimateReverseCostCents } from "./batchdata-reverse";

/** Shared single-item reverse service. Caller MUST reserve durable spend before calling. No retries. */
export async function dispatchReverseItem(opts: {
  apiKey: string; requestId: string; phone?: string; email?: string; name?: string | null;
  fetcher?: typeof fetch;
}) {
  let httpStatus: number | null = null;
  let requestId: string | null = null;
  try {
    const response = await (opts.fetcher ?? fetch)("https://api.batchdata.com/api/v3/property/reverse-skip-trace", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(buildReverseRequestBody(opts)),
      signal: AbortSignal.timeout(30_000),
    });
    httpStatus = response.status;
    const raw = await response.json() as any;
    requestId = raw?.result?.meta?.requestId ?? null;
    if (!response.ok || !Array.isArray(raw?.result?.data) || raw.result.data.length !== 1) throw new Error("Uncertain response");
    const result = classifyReverseItem(raw.result.data[0], opts.name);
    // Never treat an undocumented number of billable people as within the approved ceiling.
    if (result.persons.length > 3) throw new Error("Response exceeds reserved limit");
    return { ...result, httpStatus, providerRequestId: requestId,
      estimatedCostCents: estimateReverseCostCents(result.billableResults), uncertain: result.status === "provider_error" };
  } catch {
    return { status: "provider_error" as const, persons: [], multiPerson: false, nameEvidence: "unknown" as const,
      billableResults: 0, errorMessage: "Outcome uncertain. Held; do not retry.", reviewReason: null,
      httpStatus, providerRequestId: requestId, estimatedCostCents: null, uncertain: true };
  }
}