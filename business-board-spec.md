# Business Board — v1 Product & Technical Spec

*Design, UX, and localization requirements (including multi-language and RTL support) are covered separately in `design-ux-localization-spec.md` — apply those alongside this doc. Plans, free-tier limits and billing are in `payments-spec.md`; the Board's free-tier limits are in its section 3.*

## 1. Vision
A small business owner (therapist, coach, personal trainer, freelance tutor, etc.) opens the app, types a plain-language description of their business, and gets a working CRM-style board — clients/patients, the fields that make sense for their business, and automatic follow-up reminders. No setup wizard, no drag-and-drop builder — just describe it and it builds itself.

A **separate product from the PA**, but living inside the **same app**, sharing login/account. Not connected to the PA's WhatsApp/outreach features yet — that's an intentional later phase once both products are proven on their own.

## 2. Core user experience

**Setup**
1. Owner opens the "Business Board" mode in the app.
2. Types a free-text description: *"I'm a therapist, I see clients weekly or bi-weekly, I need to track session notes and follow up if someone hasn't booked in 3 weeks."*
3. Claude interprets this and generates: a board with sensible fields (name, contact, session history, next appointment, notes, status), a default follow-up rule (e.g. "flag if no session in 21 days"), and a first look at the empty board.
4. Owner starts adding clients — manually, or by importing a spreadsheet of existing ones (section 5a).

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
- `import_jobs` — board_id, filename, status (mapping/awaiting_confirmation/importing/done/failed), the confirmed column→field mapping (JSON), row counts (total/imported/skipped/duplicate), created_at — one row per spreadsheet import (section 5a)

Using a flexible field layer (JSONB values keyed against `board_fields`) is what makes "no manual builder, just describe it" actually work — every business gets a different schema without needing separate tables per business type.

## 5. The board-generation engine
This is the core differentiator, worth being deliberate about:
- Input: the owner's free-text business description.
- Claude's job: infer (a) what a "client/customer/patient" record should track for this business type, (b) a sensible default follow-up rule, (c) reasonable status categories.
- Output: structured JSON defining the board schema, which the backend uses to create the `board_fields` and `follow_ups` rule.
- Refinement requests ("also track X," "change the follow-up window") go through the same engine, editing the existing schema rather than regenerating it from scratch — so existing client data isn't lost when the board evolves.

## 5a. Spreadsheet import (add-on, not an alternative setup path)

Plenty of owners already keep their clients in Excel. Retyping them is the single biggest reason a board that generated beautifully then sits empty.

**This is an add-on to an existing board, never a replacement for the describe-your-business setup.** The board must already exist, with its fields generated from the owner's own description, before an import is offered. That ordering is deliberate: the board's schema is what the spreadsheet gets mapped *onto*. Letting a spreadsheet define the board would quietly turn the product back into a column-mapping tool — exactly the setup wizard the whole product is trying not to be.

**The mapping problem.** Requiring exact column-name matches would fail on the first real file — owners have "Client", "Name", "Full name", "שם"; "Mobile", "Tel", "Phone no."; dates in a dozen formats. So the board-generation engine does the mapping, the same way it does everything else here: it reads the column headers plus a few sample values from each column, sees the board's existing `board_fields`, and proposes a mapping with a confidence per column.

**Flow**
1. Owner opens an existing board → *Import from a spreadsheet*. Accepts `.xlsx`, `.xls`, `.csv`.
2. Parse: first sheet by default (ask which, if several contain data), detect the header row, read a sample of rows.
3. The generation engine proposes a column→field mapping, each column landing in one of three states:
   - **Confident** — mapped automatically, shown in the summary so it's still visible.
   - **Unsure** — surfaced for the owner to resolve.
   - **No match** — offered as: add it as a new board field (reuses the Phase 3 refinement engine), fold it into the general-info field, or ignore it.
4. **Confirmation card** — "here's what I'll do", the same discipline used for booking options and email drafts: how many rows, the full mapping, how many look like duplicates, what will be created. **Nothing is written until the owner confirms.**
5. Import, then report: how many clients created, how many skipped and why.

**Rules that keep it safe**
- **Import only creates and updates. It never deletes.** No spreadsheet should ever be able to remove a client the owner added by hand.
- **Duplicates**: match on name plus email or phone. Default to skipping, with an option to update the existing record instead. Report the count either way.
- **Bad rows don't sink the file**: import every valid row, then report the rest with their row numbers and the reason, so the owner can fix and re-import just those.
- **Unmapped data isn't discarded**: anything the owner chose not to map gets appended to that client's general-info field rather than dropped, since general-info exists precisely as the catch-all for things the schema didn't anticipate.
- **Free tier**: allowed, but stops at the client ceiling — fills to the limit and says plainly how many rows were left and what upgrading brings in (see `payments-spec.md` section 3).
- **Size cap** for v1 (suggest 2,000 rows); larger files get a clear message rather than a timeout.

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

**Phase 3.5 — Spreadsheet import**
- The flow in section 5a, on top of an existing board. Sequenced after Phase 3 rather than alongside Phase 1 for a concrete reason: resolving an unmapped column by adding it as a new board field *is* a refinement, so the import reuses Phase 3's in-place schema editing instead of growing a second path that does the same thing.
- Needs the confirmation-card pattern in a more data-dense form than the PA's — see `design-ux-localization-spec.md` section 2.

**Phase 4 — Connect to the PA (committed v1 scope)**
- Let the PA send follow-up messages to clients via WhatsApp on the owner's behalf, using the outreach infrastructure built in /specs/pa-whatsapp-spec.md Phase 4. This is now a committed part of v1, not a someday-maybe — but it's sequenced last because it depends on two things existing first: the PA's outreach engine (its Phase 4) and the Board's own follow-up engine (this spec's Phase 2). It can't be built before either of those exists, regardless of how early the decision to build it was made.
- Once live: a due follow-up on a client's record gets an "ask my assistant to reach out via WhatsApp" action, which hands off to the same outreach task state machine the PA uses for personal outreach — same templates, same confirmation-before-send discipline.

## 7. Open decisions worth making before/while building
- **Business type coverage**: the generation engine will be tested against a handful of example business types (therapist, personal trainer, freelance tutor, hairdresser, consultant) — worth picking 4-5 concrete examples to validate against early, since "does it generate a sensible board" is the whole value proposition.
- ~~**What happens when the description is too vague** ("I run a small business")~~ — **decided (Phase 1 build)**: generate a generic starter board (name, phone, email, what they buy or book, next appointment, general info) and state the assumptions made in an "assumptions" note shown with the board, rather than asking a clarifying question; Phase 3 refinement handles the rest.
- **Follow-up rule defaults** per business type — worth a short list of sensible defaults (e.g. weekly-service businesses → flag at 1.5x the typical interval) rather than leaving it purely to Claude's inference each time.
- ~~**Multi-board owners**~~ — **decided (Phase 1 build)**: one board per account in v1 (also what the free tier allows, `payments-spec.md` section 3). Regenerating from a new description is allowed only while the board has no clients; after that, changes go through refinement (Phase 3).
- **One free-text field, not two** (decided, Phase 1 build): the guaranteed general-info field *is* the client's notes area — background and anything ongoing that has no box of its own — and is edited in place on the record rather than through the edit form. A second "notes" field alongside it would duplicate it, and alongside the history log would leave an owner guessing which of three boxes to type in. The division that matters is undated (notes) versus dated (history log), and the UI states it in one line under the heading.
- **Required fields** (decided, Phase 1 build): only the name is ever required, whatever the generation engine proposes. Blocking a save because a phone number is missing costs the owner the capture they were in a hurry to make; a half-filled record is worth more than none.
- **One unit of work per board** (decided, Phase 1 build): the engine names it ("session", "lesson", "groom", "callout", "visit") so the history log reads "Log a groom" in the owner's own vocabulary. Generic product wording is what makes software feel like it was written for somebody else's business.
- **Statuses** (decided, Phase 1 build): the engine generates business-specific status labels in the owner's language, each tagged with one of four tones — new / active / needs follow-up / inactive — so the app colour-codes them consistently (design spec section 2) and the Phase 2 rule engine knows which bucket "needs follow-up" is, whatever it's called on this board.
- **Import mapping confidence threshold**: how sure must the engine be to auto-map a column rather than ask? Too eager and owners get silent mis-mappings they only notice weeks later; too cautious and a 15-column spreadsheet becomes an interrogation. Worth tuning against real files from the same 4-5 example business types used to validate generation.
- **Re-importing the same file** (an owner who updates their spreadsheet monthly): treat as an update path keyed on the duplicate-match rule, or refuse and point them at quick capture?

## 8. Draft system prompt seed for the board-generation engine
> You turn a small business owner's plain-language description of their business into a board schema: a set of client fields appropriate to that business, sensible status categories, and a default follow-up rule for when a client should be flagged. Be concrete and practical — infer what actually matters for this type of business rather than generating a generic contact list. When asked to refine an existing board, edit the schema in place; never discard existing client data.

## 9. Draft system prompt seed for spreadsheet column mapping

> You map the columns of a spreadsheet onto the fields a board already has. You'll be given the board's existing fields and, for each spreadsheet column, its header and a few sample values. Match on what the data actually looks like, not just the header text — a column called "Mobile" holding phone numbers maps to a phone field, and a column called "Notes" holding dates does not map to a notes field. Return one mapping per column with a confidence, and say plainly which ones you are unsure about rather than guessing: the owner will be asked to resolve exactly those, so a wrong confident answer costs them more than an honest uncertain one. For a column that matches nothing, suggest whether it is worth adding as a new field or folding into general info.
