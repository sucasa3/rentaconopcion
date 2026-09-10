/**
 * Client-safe refinance math shared by the dashboard panel and the
 * "Connect with lender" dialog. Principal & interest only.
 *
 * There is deliberately no default comparison rate here: every caller must
 * pass the resolved benchmark (see `src/lib/market-rate.ts`) so a savings
 * figure can always be traced to a sourced, dated rate.
 */


/** Monthly principal + interest payment. */
export function monthlyPayment(
  principal: number,
  annualRatePct: number,
  termMonths = 360,
): number {
  if (principal <= 0) return 0;
  const m = annualRatePct / 100 / 12;
  if (m === 0) return principal / termMonths;
  return (principal * m) / (1 - Math.pow(1 + m, -termMonths));
}

export interface RefiSavings {
  currentPayment: number;
  newPayment: number;
  monthlySavings: number;
  annualSavings: number;
}

export function estimateRefiSavings(
  balance: number | null | undefined,
  currentRate: number | null | undefined,
  /** Resolved comparison rate. Without one there is no savings estimate. */
  benchmarkRate: number | null | undefined,
  termMonths = 360,
): RefiSavings | null {
  if (!balance || balance <= 0 || currentRate == null || benchmarkRate == null) return null;

  const currentPayment = monthlyPayment(balance, currentRate, termMonths);
  const newPayment = monthlyPayment(balance, benchmarkRate, termMonths);
  const monthlySavings = Math.max(0, Math.round(currentPayment - newPayment));
  return {
    currentPayment: Math.round(currentPayment),
    newPayment: Math.round(newPayment),
    monthlySavings,
    annualSavings: monthlySavings * 12,
  };
}
