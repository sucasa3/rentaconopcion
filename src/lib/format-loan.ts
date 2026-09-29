/** One display rule for loan figures, shared by Discovery cards and the 30-Second Brief. */
export function formatLtvPct(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `${Math.round(n * 10) / 10}%`;
}

export function formatRatePct(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `${(Math.round(n * 100) / 100).toFixed(2)}%`;
}
