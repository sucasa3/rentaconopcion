# Daily Read — intelligence and content quality fix

Production sending stays off. This pass fixes what the email says, not how it looks.

## 1. Blank "Why now" — root cause found

Not a data problem and not a design problem. The email is handed each person's
reason under the field names `reason` / `nextStep`, but the email layout reads
`why` / `next`. The labels render, the sentences fall on the floor. The reasons
themselves already exist and are the same ones Today shows.

Fix: pass the fields the layout expects, and drop any person from the featured
cards who lacks both a reason and a next step, so a blank card can never render
again. A test will assert every featured card carries a name, a reason and a
next step.

## 2. Why 43 relationships "deserve attention today"

Checked the actual records: those 43 are all *home maintenance recommendations
coming due* — currently grouped under the catch-all label "Something changed at
the property". Nothing changed at those properties. The single "May be thinking
about a move" item is a long-tenure-plus-equity record.

Fix: add one quality gate used only by the email (no new scoring engine — it
reads the urgency and strength the existing engine already assigned):

- Include a relationship when the canonical engine marked it urgent (hot or
  warm), or when it is genuinely newly surfaced at strong confidence.
- Exclude routine, low-urgency, unchanged records — most of the 43 will drop
  out.
- Every count, category total and the remainder line is computed *after* this
  gate, so the email's numbers and Today's list can never disagree about why
  someone matters.

Today itself is unchanged; it still shows the full working list.

## 3 & 4. Factual wording, specific categories

Replace the intent-flavoured and vague labels with what SuCasa actually knows:

| Today's canonical record | New email category |
| --- | --- |
| maintenance recommendation due | Home care recommendation due |
| permit activity | Permit activity recorded |
| listing / status change | Listing status changed |
| value / equity change | Home value or equity changed |
| homeowner engagement | New homeowner engagement |
| purchase anniversary / tenure | Ownership milestone |
| overdue check-in | Relationship follow-up overdue |

"May be thinking about a move" is removed entirely. No category implies
prediction of what a homeowner will do, and no category exposes a fact the
recipient is not permitted to see (the lender path keeps reading through the
permission-gated workspace, unchanged).

## 5 & 6. Cards and the remainder line

Featured cards stay at three, each name / one-sentence reason / one-sentence
next step, no scripts or openers. The remainder line only states a number when
those items actually passed the gate; otherwise it reads "See all prioritized
opportunities in SuCasa".

## 7. Visual shell

Untouched.

## 8. Re-test, then wait for your review

Run the tests, then a dry run for your agent account and report, before
sending: total opportunities available, how many passed the gate, the category
breakdown, the exact three "Why now" sentences, the exact three next steps, and
why the rest were excluded. Then send one agent test email to your account and
check it on mobile. Scheduled production sending stays off until you approve
the revised email.

## Technical notes

- `src/lib/daily-read.server.ts`: correct the template payload field names; add
  the featured-card completeness guard.
- `src/lib/daily-read.ts`: new pure `passesDailyReadThreshold` gate applied
  before counting/grouping; revised agent group map and labels.
- Tests in `src/lib/daily-read.test.ts` for the gate, the new labels, and the
  payload contract.
- No schema change, no new scoring, no change to Today, permissions, consent or
  the send schedule.
