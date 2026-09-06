# Shared Home Profile pool with flexible agent allocation

I agree with the direction, and the good news is the plan structure is already close: each plan already carries a total Home Profile allowance and a sponsored-agent cap, and each sponsored agent already has a "profiles granted" number. What's missing is the allocation engine and the screen around it.

## The model

Two plan caps, one flexible pool:

```text
Plan: MLO Growth
  Total Home Profiles ............ 1,000
  Max sponsored agents ...............10

Allocation
  Lender-owned reserve ............. 200
  Sofia Martinez ................... 250   (180 used)
  Agent B .......................... 100   (12 used)
  Agent C ........................... 50   (0 used)
  Allocated to agents .............. 400
  Unallocated (available) .......... 400
```

Rules enforced everywhere:

- Any quantity per agent; presets 50 / 100 / 250 / Custom.
- Lender reserve + all active agent allocations cannot exceed the plan's total profiles.
- Active sponsored agents cannot exceed the plan's agent cap.
- Allocation can be raised or lowered anytime; lowering is blocked below what the agent has already used, with a clear message ("Sofia has used 180 — set at least 180").
- Ending a sponsorship or reallocating never deletes homeowner records; it only frees future capacity and changes sponsored access.
- Agents may use fewer profiles than allocated; unused capacity returns to the pool when the allocation is reduced or the seat ends.

## What gets built

1. **Allocation math (one shared engine)** — a single pure module computing pool capacity, lender reserve, per-agent allocated and used counts, unallocated remainder, and every rejection reason. Every plan uses the same engine; only the caps differ.
2. **Enforcement in the backend** — allocation changes go through server functions that re-check caps against the org's current plan, plus a database-level guard so limits can't be bypassed. Existing sponsor-allocation guard is extended rather than replaced.
3. **Allocation screen** for lenders — capacity summary bar (Total / Lender-owned / Allocated / Unallocated), a row per connected agent with `used / allocated` and a Change allocation control, and two primary buttons: **Add Agent** and **Allocate Profiles**. Reducing or ending shows exactly what happens to existing homeowners.
4. **Agent-side visibility** — the agent sees "180 of 250 sponsored profiles used" and a Request more action that notifies the sponsoring lender.
5. **Blocking with a way forward** — when an agent hits their allocation, imports stop with a message naming the sponsor and offering the request, rather than a generic error.

## Technical notes

- Pool cap: `lender_orgs.profile_allowance` (already set from `plan_tiers.profile_allowance` at checkout). Agent cap: `plan_tiers.sponsored_seats`, mirrored per org.
- Per-agent allocation reuses `sponsored_agent_seats.credits_granted`; a lender-owned reserve column is added to `lender_orgs`.
- Usage per agent = homeowner profiles consumed by that agent org (existing credit ledger spend), so "used" needs no new bookkeeping.
- New pure module `src/lib/profile-pool.ts` (capacity math + validation), server functions in `src/lib/credits.functions.ts`, UI in the lender Network/Billing area, extending `lender-agent-sponsor-dialog.tsx` for Change allocation.
- Migration: add reserve column, per-org sponsored-seat cap, and replace the fixed-allocation trigger with a pool-aware check (grants included).

## Not included

Plan pricing changes, self-serve overage purchase, and per-agent billing. Those come after the allocation engine is live.
