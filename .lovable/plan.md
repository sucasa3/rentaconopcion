# Why some clients only show "Write email"

## What's happening

On the agent side, a card shows only the *one* channel SuCasa recommends for that person, not every channel you're allowed to use.

Two separate causes, confirmed in the code:

1. The agent card offers Call only if the recommended action is a call, Text only if the recommended action is a text, and email only if the recommendation is email. So Ana Sepulveda ("send a home value update") gets email only, while Miguel Luna ("offer a trusted pro") gets Text plus email.
2. Many imported homeowners have no phone number on file at all — email is the only thing that could ever be offered for them.

The lender side already works the way you describe: it evaluates each channel independently against permission plus available contact details, and shows all permitted ones.

## The fix

Bring the agent card in line with the lender card, without changing who is contactable.

1. Show every channel the person's contact details and permissions actually allow — Call, Text and Email — instead of only the recommended one.
2. Keep the recommendation visible: the recommended channel stays the filled primary button, the others render as secondary. The advice is still there, it just no longer hides the alternatives.
3. When a channel isn't available, say why in plain words: "No phone number on file" is different from "no permission recorded". No silent hiding.
4. No change to permission rules, ranking, outcome logging, or the lender experience. A channel never appears unless the existing rules already permit it.

## Technical notes

- `src/lib/agent-daily.ts` — `availableChannels()` stops gating on `item.channel` and instead returns each channel supported by contact data, plus a `recommended` marker and per-channel unavailability reason. Update `src/lib/agent-daily.test.ts` accordingly.
- `src/components/action-queue.tsx` and `src/components/agent-today.tsx` — render the full permitted channel set, recommended one styled primary; unavailable channels show the reason instead of disappearing.
- Outcome logging on tap (attempted / emailed) stays exactly as-is.
- No schema change, no server-function change, no lender-side change.

## Open item

Agent cards currently derive contact permission only from the presence of phone/email. If you want agent contact to run through the same explicit permission engine the lender side uses (`lender-access.ts`), that's a separate follow-up — say the word and I'll fold it in.
