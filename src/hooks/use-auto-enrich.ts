import { useEffect, useRef, useState } from "react";

export interface RecordsBudget {
  used: number;
  included: number;
  remaining: number;
  pct: number;
  softCapPct: number;
  cacheOnly: boolean;
}

export interface AutoEnrichOptions {
  /** Stable key (portfolio id) — one auto-run per key per browser session. */
  key: string;
  /** Rows still missing enriched data. */
  pending: number;
  /** Monthly records allowance; null/undefined means "unknown → don't pull". */
  budget: RecordsBudget | null | undefined;
  /** Wait for the first data load before deciding. */
  ready: boolean;
  /** Rows per pass. */
  batchSize?: number;
  /** Hard ceiling of rows pulled automatically in one visit. */
  maxAuto?: number;
  /** Runs one pass; resolves with how many rows were enriched and what's left. */
  runBatch: (limit: number) => Promise<{ enriched: number; remaining: number }>;
  /** Called once after any successful auto pass so the caller can refetch. */
  onDone?: () => void;
}

export interface AutoEnrichState {
  running: boolean;
  enriched: number;
  /** Why automatic pulls are paused, if they are. */
  paused: "cache_only" | "soft_cap" | "no_budget" | null;
}

/**
 * Automatically fills in missing property-record data when a dashboard loads,
 * with guardrails so it can never run away with the monthly allowance:
 *   - never runs when the allowance is unknown, in cache-only mode, or past
 *     the soft cap
 *   - never pulls more rows than the remaining allowance leaves
 *   - caps each visit at `maxAuto` rows and runs once per session per key
 */
export function useAutoEnrich(opts: AutoEnrichOptions): AutoEnrichState {
  const {
    key,
    pending,
    budget,
    ready,
    batchSize = 10,
    maxAuto = 40,
    runBatch,
    onDone,
  } = opts;

  const [state, setState] = useState<AutoEnrichState>({
    running: false,
    enriched: 0,
    paused: null,
  });
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current || pending <= 0) return;

    if (!budget) {
      setState((s) => ({ ...s, paused: "no_budget" }));
      return;
    }
    if (budget.cacheOnly) {
      setState((s) => ({ ...s, paused: "cache_only" }));
      return;
    }
    if (budget.pct >= budget.softCapPct) {
      setState((s) => ({ ...s, paused: "soft_cap" }));
      return;
    }

    // Leave headroom: only spend up to what the soft cap still allows.
    const capRoom = Math.max(
      0,
      Math.floor((budget.softCapPct / 100) * budget.included) - budget.used,
    );
    const allowance = Math.min(pending, maxAuto, capRoom, budget.remaining);
    if (allowance <= 0) {
      setState((s) => ({ ...s, paused: "soft_cap" }));
      return;
    }

    const sessionKey = `sucasa:auto-enrich:${key}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, String(Date.now()));
    } catch {
      /* private mode — fall through, the ref still guards this mount */
    }

    started.current = true;
    let cancelled = false;

    (async () => {
      setState({ running: true, enriched: 0, paused: null });
      let done = 0;
      while (!cancelled && done < allowance) {
        const limit = Math.min(batchSize, allowance - done);
        try {
          const r = await runBatch(limit);
          done += r.enriched;
          setState({ running: true, enriched: done, paused: null });
          if (r.enriched === 0 || r.remaining === 0) break;
        } catch {
          break;
        }
      }
      if (cancelled) return;
      setState({ running: false, enriched: done, paused: null });
      if (done > 0) onDone?.();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pending, budget, key]);

  return state;
}
