# Business Board — v1 Product & Technical Spec

*Design, UX, and localization requirements (including multi-language and RTL support) are covered separately in `design-ux-localization-spec.md` — apply those alongside this doc.*

## 1. Vision
A small business owner (therapist, coach, personal trainer, freelance tutor, etc.) opens the app, types a plain-language description of their business, and gets a working CRM-style board — clients/patients, the fields that make sense for their business, and automatic follow-up reminders. No setup wizard, no drag-and-drop builder — just describe it and it builds itself.

A **separate product from the PA**, but living inside the **same app**, sharing login/account. Not connected to the PA's WhatsApp/outreach features yet — that's an intentional later phase once both products are proven on their own.

## 2. Core user experience

**Setup**
1. Owner opens the "Business Board" mode in the app.
2. Types a free-text description: *"I'm a therapist, I see clients weekly or bi-weekly, I need to track session notes and follow up if someone hasn't booked in 3 weeks."*
3. Claude interprets this and generates: a board with sensible fields (name, contact, session history, next appointment, notes, status), a default follow-up rule (e.g. "flag if no session in 21 days"), and a first look at the empty board.
4. Owner starts adding clients (manually, or by importing a contact list later).

**Refining the board** — since there's no manual builder, refinement happens the same way it was created: through conversation. *"Also track whether they've paid,"* or *"change the follow-up window to 2 weeks"* — Claude updates the board's schema/rules directly. This keeps the "just describe it" promise while still letting the board evolve as the owner's needs get clearer.

**Everyday use**
- Owner sees a board (list or simple kanban-style view by status: new / active / needs follow-up / inactive).
- Tapping a client shows their record — custom fields, notes, history.
- The app surfaces in-app reminders when a follow-up is due ("Dana hasn't booked in 3 weeks — reach out?").
- Owner logs a session/interaction, adds notes, updates status, all inside the client record.

## 3. Architecture overview

```
        Native app (same app as the PA, separate "Business Board" mode)
                             |
                       Your backend API
                             |
     +-------------+---------+---------+-------------+
     |             |                   |             |
Board-generation  Board/client        Follow-up      Notification
engine (Claude:    data layer          rule engine    service
free text -->      (dynamic schema     (evaluates      (in-app only
board schema)      per business)       due follow-ups) for v1)
                             |
                    Postgres (businesses, boards,
                    board_fields, clients, follow_ups,
                    activity_log)
```

Shares the app shell, auth, and backend infrastructure with the PA product, but its own data model and its own mode in the UI — the two don't share conversation state in v1.

## 4. Data model (starting point)
- `businesses` — owner_id, name, business description (raw text), generated business type/category
- `boards` — business_id, board name, status columns (e.g. new/active/needs follow-up/inactive)
- `board_fields` — board_id, field name, field type (text/date/number/select), generated from the business description
- `clients` — board_id, dynamic field values (JSONB, keyed by board_fields, always including a general-info free-text field), status, created_at
- `follow_ups` — client_id, rule that triggered it, due_at, status (pending/done/dismissed)
- `activity_log` — client_id, note/session entry, timestamp

Using a flexible field layer (JSONB values keyed against `board_fields`) is what makes "no manual builder, just describe it" actually work — every business gets a different schema without needing separate tables per business type.

## 5. The board-generation engine
This is the core differentiator, worth being deliberate about:
- Input: the owner's free-text business description.
- Claude's job: infer (a) what a "client/customer/patient" record should track for this business type, (b) a sensible default follow-up rule, (c) reasonable status categories.
- Output: structured JSON defining the board schema, which the backend uses to create the `board_fields` and `follow_ups` rule.
- Refinement requests ("also track X," "change the follow-up window") go through the same engine, editing the existing schema rather than regenerating it from scratch — so existing client data isn't lost when the board evolves.

## 6. Build phases

**Phase 1 — Board generation + client records**
- Free-text-to-schema generation engine — every generated board includes a general-info field (free text) alongside structured fields, since "some general info as well" is a near-universal need regardless of business type, not something to infer case by case.
- Client record CRUD (add/edit/view), using the dynamic field layer.
- Basic list view of clients per board.
- Full client detail record: general info, structured fields (e.g. session package status), and a chronological history log, all on one screen.

**Phase 2 — Follow-ups + in-app reminders + quick capture**
- Follow-up rule engine (evaluates which clients are due, based on the board's rules).
- In-app notifications surfacing due follow-ups.
- **Quick capture**: a single free-text/voice input (on the board list and on each client record) that the generation engine parses to identify the right client, update their structured fields, and log the note to their history — so anything the owner tells the app inside Board mode always lands on the record, never just in a transcript. This is the mechanism that makes "just describe it" also apply to day-to-day use, not only setup.

**Phase 3 — Board refinement via conversation**
- "Also track X" / "change the rule to Y" handled as schema edits, not full regeneration.
- Simple status/kanban view alongside the list view.

**Phase 4 — Connect to the PA (committed v1 scope)**
- Let the PA send follow-up messages to clients via WhatsApp on the owner's behalf, using the outreach infrastructure built in /specs/pa-whatsapp-spec.md Phase 4. This is now a committed part of v1, not a someday-maybe — but it's sequenced last because it depends on two things existing first: the PA's outreach engine (its Phase 4) and the Board's own follow-up engine (this spec's Phase 2). It can't be built before either of those exists, regardless of how early the decision to build it was made.
- Once live: a due follow-up on a client's record gets an "ask my assistant to reach out via WhatsApp" action, which hands off to the same outreach task state machine the PA uses for personal outreach — same templates, same confirmation-before-send discipline.

## 7. Open decisions worth making before/while building
- **Business type coverage**: the generation engine will be tested against a handful of example business types (therapist, personal trainer, freelance tutor, hairdresser, consultant) — worth picking 4-5 concrete examples to validate against early, since "does it generate a sensible board" is the whole value proposition.
- **What happens when the description is too vague** ("I run a small business") — does the PA ask a clarifying question, or generate a generic starter board and let refinement handle the rest?
- **Follow-up rule defaults** per business type — worth a short list of sensible defaults (e.g. weekly-service businesses → flag at 1.5x the typical interval) rather than leaving it purely to Claude's inference each time.
- **Multi-board owners**: can one account run boards for more than one business, or is it one board per account for v1?

## 8. Draft system prompt seed for the board-generation engine
> You turn a small business owner's plain-language description of their business into a board schema: a set of client fields appropriate to that business, sensible status categories, and a default follow-up rule for when a client should be flagged. Be concrete and practical — infer what actually matters for this type of business rather than generating a generic contact list. When asked to refine an existing board, edit the schema in place; never discard existing client data.
