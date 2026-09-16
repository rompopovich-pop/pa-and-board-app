# Claude Code Build Sequence

How to actually turn the specs into working software: one focused session at a time, in this order. Each entry is close to what you'd paste as the actual prompt to Claude Code — adjust as the build reveals things.

## Setup — before session 1
1. Create the repo, add a `/specs` folder, put all five files in it: `pa-whatsapp-spec.md`, `business-board-spec.md`, `design-ux-localization-spec.md`, `payments-spec.md`, and this file.
2. Add a `CLAUDE.md` at the repo root (Claude Code reads this automatically every session):

```
# Project overview
This repo builds one app containing two products: a personal WhatsApp+voice
PA, and a "Business Board" CRM tool for small business owners. They share
an app shell, auth, and backend, but are otherwise separate products for now
(see /specs/business-board-spec.md section 6, Phase 4, for the planned
future integration).

Full specs live in /specs — always read the relevant spec before building
a session's scope, and always apply /specs/design-ux-localization-spec.md
(warm & personal visual direction, English+Hebrew with RTL support built
in from the start, not retrofitted).

Build order: see /specs/build-sequence.md. Only build the scope of the
current session — don't jump ahead to later phases.
```

3. Commit after every session below, and actually run/click through what got built before starting the next one — each session assumes the previous one works.

## Session 0 — Shared foundation
> Build the shared foundation for this app, following /specs/design-ux-localization-spec.md and the architecture sections of /specs/pa-whatsapp-spec.md and /specs/business-board-spec.md. Scope: React Native app shell (iOS + Android) with i18n set up for English and Hebrew including RTL layout support from the start (not retrofitted), basic navigation with two placeholder modes ("PA" and "Business Board"), the base design system (warm & personal: rounded components, color palette, typography, a reusable "confirmation card" component), backend project scaffold (Node/FastAPI, your choice), Postgres connection, and basic auth (sign up/log in). Don't build any PA or Board features yet — just the shell everything else plugs into.

## Session 1 — PA Phase 1: core thread + reminders
> Following /specs/pa-whatsapp-spec.md sections 3-4 and 7 (Phase 1), build: WhatsApp Cloud API integration (click-to-chat onboarding, receiving/sending messages), the conversation engine using the Claude API for general chat and reminder intents, the reminders data model and scheduler service, and the in-app chat UI in the "PA" mode connecting to the same backend conversation state. Both WhatsApp and the app should reflect the same conversation per user.

## Session 2 — PA Phase 2: voice, email, calendar
> Following /specs/pa-whatsapp-spec.md sections 5-6 and 7 (Phase 2), add: the voice pipeline (speech-to-text for incoming voice notes/messages, text-to-speech for outgoing replies) on both WhatsApp and the app, Gmail OAuth with read/draft/send capability using the auto-send-vs-draft rule and examples in section 6, and Google Calendar OAuth for reading availability and creating events.

## Session 3 — PA Phase 3: research & booking-assist
> Following /specs/pa-whatsapp-spec.md section 7 (Phase 3), add web search integration for research/booking requests (flights, etc.), using the confirmation-card pattern from the design spec to present options and require explicit user confirmation before anything is treated as booked.

## Session 4 — PA Phase 4: outreach on your behalf
> Following /specs/pa-whatsapp-spec.md section 7 (Phase 4) and /specs/design-ux-localization-spec.md section 5, implement the outreach task flow: sending the approved WhatsApp template (English/Hebrew variants — note these need to be manually submitted and approved in the Meta Business dashboard before this will work end-to-end, so stub the template IDs), the outreach state machine (sent → waiting → negotiating → resolved), and SMS fallback via Twilio for non-responders.

## Session 5 — Board Phase 1: generation + client records
> Following /specs/business-board-spec.md sections 3-5 and 6 (Phase 1), build the "Business Board" mode: the free-text-to-schema board generation engine (Claude interprets a business description into board_fields + a default follow-up rule, per section 5), the dynamic client record data layer (JSONB fields keyed against board_fields), and basic client CRUD with a list view.

## Session 6 — Board Phase 2: follow-ups + reminders
> Following /specs/business-board-spec.md section 6 (Phase 2), add the follow-up rule engine (evaluating which clients are due based on the board's rules), in-app notifications surfacing due follow-ups, and session/interaction logging against a client that resets their follow-up timer.

## Session 7 — Board Phase 3: refinement + status view
> Following /specs/business-board-spec.md section 6 (Phase 3), add: handling refinement requests ("also track X," "change the rule to Y") as in-place schema edits rather than regeneration, and a simple kanban/status view alongside the existing list view.

## Session 8 — Board Phase 3.5: spreadsheet import
> Following /specs/business-board-spec.md section 5a and 6 (Phase 3.5), add the spreadsheet import add-on to an existing board: accept .xlsx/.xls/.csv, have the board-generation engine map the file's columns onto the board's existing fields with a confidence per column, and present the proposed mapping — plus row and duplicate counts — in the data-dense variant of the confirmation card (/specs/design-ux-localization-spec.md section 2), writing nothing until the owner confirms. Columns the engine can't confidently map are surfaced for the owner to resolve; resolving one by adding a new field reuses the Phase 3 refinement engine. Import creates and updates only — never deletes.

*Placed after Session 7, not earlier, because "add this unmapped column as a new field" is a schema refinement — building import first would mean writing a second path that does what Phase 3 already does.*

## Session 9 — Board Phase 4: PA integration (committed v1, built last by necessity)
> Following /specs/business-board-spec.md section 6 (Phase 4), connect the Board's follow-up engine to the PA's outreach infrastructure (built in Session 4) so a business owner's client follow-ups can go out via WhatsApp automatically, using the same outreach task state machine and templates. Add the "ask my assistant to reach out" action on a client's record. This session depends on Sessions 4 and 6 both being complete — it's committed v1 scope, but genuinely can't be built earlier since the two systems it connects don't exist yet before that point.

## Session 10 — Payments part 1: entitlements, metering, Stripe backend
> Following /specs/payments-spec.md sections 5-6, build the billing backend: the three Stripe Products (PA, Board, Bundle) and their GBP Prices, Stripe Checkout for subscribing and the Customer Portal for plan changes and cancellation, signature-verified idempotent webhook handling driving subscription state, the `subscriptions` / `usage_counters` tables, and entitlements *derived* from subscription status plus usage rather than stored as truth. Then wire the usage counters into every metered action across both products — conversation turns, voice in/out, email sends, calendar writes, research sets, board refinements, quick captures, client counts, imports. Enforce entitlements server-side; the client never decides what it's allowed to do. Build entirely against Stripe test mode.

*This is the invasive one: metering touches nearly every feature built in Sessions 1-9, which is exactly why it gets its own session instead of riding along with the paywall UI.*

## Session 11 — Payments part 2: paywall, upgrade and usage UI
> Following /specs/design-ux-localization-spec.md section 5a and /specs/payments-spec.md section 3, build the customer-facing half: plan comparison and upgrade screens in the ordinary design system (no urgency patterns, no buried decline), subscription management in Settings, quiet usage indicators where the usage happens, and warm at-limit states that degrade to read-only and never look like data loss. Localize prices with `Intl.NumberFormat` and check currency placement and bidirectional digits under Hebrew/RTL on a real device.

## Why payments go last (and what would change that)

**Payments are sequenced at the end because you can only gate features that exist.** Introducing plan limits at, say, Session 5 would mean revisiting every later feature to add its counter anyway — the same work, done twice, with a half-built paywall to maintain in between.

The cost of that choice is real and worth naming: Session 10 has to reach into nearly every feature built before it. That is why metering and paywall UI are two sessions rather than one, and why `payments-spec.md` section 6 calls metering out as cross-cutting rather than burying it in a data-model list.

**Two things that would justify resequencing:**

- **If validating willingness-to-pay matters more than feature completeness**, Sessions 10-11 can move ahead of Session 9. The Board↔PA integration is the most complex piece in the plan and the least necessary to charging money — it's the natural thing to defer if revenue needs to arrive sooner. Nothing in payments depends on it.
- **If retrofitting counters into nine sessions' worth of features looks too painful**, pull a thin slice — just the `usage_counters` table and an `increment(metric)` helper — forward into Session 5, when the Board data layer lands, and have each later session increment as it goes. Keep all the Stripe work at the end regardless; it doesn't benefit from arriving early.

Otherwise the existing order holds: nothing in Sessions 1-7 needs to move.

## Notes on running this well
- Test Hebrew/RTL as you go, not just at the end — catching a layout that breaks under RTL in session 0 is trivial; catching it after 6 more sessions have built on top of that screen is not.
- The WhatsApp template approval (Meta) and app store developer accounts (Apple/Google) both have real-world lead times independent of coding — start those in parallel with session 0-1, not when you get to the sessions that need them.
- **Three more real-world lead items, all for payments, none of them coding** — start them around Sessions 4-5, not Session 10: registering the UK business and getting the **Stripe account verified** (company details, directors, bank account); deciding **VAT registration** and whether prices display inclusive or exclusive of it; and settling the **app-store billing question** in `payments-spec.md` section 2 — whether Apple and Google will permit a Stripe paywall in the native apps at all, or whether In-App Purchase is required. That last one can change the data model, the unit economics, and possibly the launch platform, so it is the worst possible thing to discover during Session 10.
- If a session's build reveals the spec was wrong about something, fix the spec file, not just the code — future sessions (and future-you) read the spec, not the git history.
