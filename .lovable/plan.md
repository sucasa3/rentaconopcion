## Goal

Replace the dead "Home Assistant" card on `/dashboard` with a working chat panel. One-shot Q&A (no threads, no tools, no persistence) that answers with full knowledge of the homeowner's specific home.

## What the assistant knows (context injected server-side each request)

Pulled fresh per question, scoped to the signed-in user via `requireSupabaseAuth`:

- **Profile:** name, address, city/state/zip
- **Home intel (from `getMyHomeIntel`):** AVM value, equity $, equity %, year built, sq ft, beds/baths, current mortgage rate, balance
- **Inspection findings** (`home_inspection_findings`): severity, category, description, recommendation
- **Maintenance timeline items:** what's due, overdue
- **Recent service requests:** last 5, with category + status

All read through the user's authenticated Supabase client (RLS enforced) — no service role, no cross-user leakage.

## Backend

New file `src/lib/assistant.functions.ts`:

- `askAssistant` — `createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ question: z.string().min(1).max(1000) })).handler(...)`
- Handler reads context from Supabase (parallel queries), builds a compact system prompt with the home snapshot, calls Lovable AI Gateway via `createLovableAiGatewayProvider` + `generateText` using `google/gemini-3.6-flash`
- Returns `{ answer: string }`
- Handles 429/402 with clear error messages; caps response length in the prompt

System prompt establishes: role ("SuCasa Home Assistant"), scope (maintenance, equity/refi in plain English, inspection interpretation, matching problems to SuCasa service categories), refusal for anything off-topic, no fabricating numbers not in the snapshot, encourage filing a service request when actionable.

## Frontend

Install AI Elements primitives: `bun x ai-elements@latest add conversation message prompt-input shimmer`.

Rewrite the "Home Assistant" card in `src/routes/_authenticated/dashboard.tsx` to render a new `<HomeAssistantCard />` component (new file `src/components/home-assistant-card.tsx`):

- Uses AI Elements `Conversation` / `Message` / `MessageContent` / `MessageResponse` / `PromptInput` / `PromptInputTextarea` / `PromptInputFooter` / `PromptInputSubmit` / `Shimmer`
- Local `useState<Array<{ role, content }>>` for the visible transcript (no persistence — matches "no history" scope)
- Assistant messages render markdown via `MessageResponse`; no background on assistant bubbles
- User messages use `primary` / `primary-foreground` bubble
- Three preset chips remain but now actually send: "Get a maintenance plan", "Estimate a remodel", "Find a warranty"
- `Shimmer` "Thinking..." while `status === "submitted"`
- Errors surface inline (rate limit / credits / auth)
- Textarea auto-focuses on mount and after each send
- Empty state uses SuCasa brand mark, not a generic sparkles icon

Card sits in the same grid slot the current dead "Home Assistant" card occupies — no layout change.

## Explicitly out of scope (deferred to Option B)

- Threaded history / persistence (`chat_threads`, `chat_messages`)
- Streaming (one-shot `generateText`, not `streamText`) — keeps the MVP tiny; upgrade path is swapping to `streamText` + `toUIMessageStreamResponse` later
- Tool calling (no `create_service_request`, no ATTOM re-pulls)
- Proactive nudges
- Cross-conversation memory

## Verification

- Typecheck clean
- Manual: ask "When should I service my HVAC?" as Neil Terc — response references his actual home age
- Manual: ask something off-topic ("write me a poem") — assistant declines and redirects
- Manual: verify RLS by confirming the handler cannot read another user's data (context queries use `context.supabase`)

## Files touched

- `src/lib/assistant.functions.ts` (new)
- `src/components/home-assistant-card.tsx` (new)
- `src/routes/_authenticated/dashboard.tsx` (replace the "Home Assistant" `<Card>` block)
- `src/components/ai-elements/*` (installed by CLI)
