/**
 * Runs a Data API `.in(column, ids)` read in batches so the request URL stays
 * well under PostgREST/proxy limits (a 36-char UUID list of ~700 ids overflows
 * a single GET). Throws on any batch error so callers can surface a real
 * failure instead of silently treating it as "no rows".
 */
export const IN_CHUNK = 100;

export function chunk<T>(ids: T[], size = IN_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

export async function selectInChunks<R = any>(
  ids: string[],
  run: (batch: string[]) => PromiseLike<{ data: R[] | null; error: any }>,
): Promise<R[]> {
  if (!ids.length) return [];
  const results = await Promise.all(chunk(ids).map((b) => run(b)));
  const rows: R[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message ?? "Signal request failed");
    rows.push(...(r.data ?? []));
  }
  return rows;
}
