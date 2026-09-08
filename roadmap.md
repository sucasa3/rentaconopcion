# Roadmap

## SuCasa Agent Experience: Invitation → Activation → Daily Operating System (approved)

- [x] Email brand redesign (real logo, warm/light, navy accents) + QA notes
- [x] Premium agent invitation email
- [x] Signed, expiring invitation token + public preview endpoint (minimum-safe fields)
- [x] Public invitation landing page `/agent-invite`
- [x] Agent workspace provisioning (org + owner + book + lender connection), idempotent
- [x] Agent Today command center (Best Move → Next up → Who to contact today)
- [x] Adaptive first run: real homeowner aha / empty state / preparing state
- [x] Outcome logging advances the queue (Apple-style state changes)
- [ ] "Home Profiles Activated" label + microcopy
- [x] Keep Tasks and Opportunities workspaces intact (no redirects)
- [x] QA: full journey + mobile + email clients

- [x] Agent contact channels: server-authoritative Call/Text/Email eligibility (shared contact-channels model, role-specific policy)

## Agent Daily Intelligence (Today)
- [ ] Additive recentOutcomes field on action queue
- [ ] agent-daily helpers: daily read, handled-today, service phrasing
- [ ] Rebuild agent-today.tsx hierarchy (no duplicate homeowners, next 5 + link)
- [ ] Label opportunities accurately (Opportunities developing)
- [ ] Tests + typecheck
