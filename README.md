# PA & Board App

One app, two products, sharing an app shell, auth, and backend: a WhatsApp+voice
personal assistant, and a "Business Board" CRM for small business owners. See
`pa-whatsapp-spec.md`, `business-board-spec.md`, `design-ux-localization-spec.md`,
and `build-sequence.md` for the full product/technical specs.

Sessions built so far, per `build-sequence.md`:
- **Session 0** — shared foundation: app shell, i18n (English + Hebrew with
  RTL), the base design system, backend scaffold, Postgres, basic auth.
- **Session 1** — PA Phase 1: WhatsApp Cloud API integration, the Claude-powered
  conversation engine (general chat + reminders), the reminder scheduler, and
  the in-app "PA" chat UI — all sharing one conversation per user across
  channels.
- **Session 2** — PA Phase 2: the voice pipeline (voice notes in, spoken
  replies out, on both WhatsApp and the app), Gmail OAuth with read/draft/send
  under the auto-send-vs-draft rule, and Google Calendar for availability and
  creating events.
- **Session 3** — PA Phase 3: web search for research and booking-assist,
  presenting 2-4 options behind the confirmation-card gate — nothing counts
  as chosen without an explicit pick, and nothing is ever booked or paid.

No Business Board features are built yet.

## Layout

- `app/` — React Native (Expo) app, iOS + Android, TypeScript.
- `backend/` — Node.js/Express API, TypeScript, Prisma + Postgres.

## Backend setup

```bash
cd backend
cp .env.example .env          # ANTHROPIC_API_KEY; plus WHATSAPP_*, OPENAI/ELEVENLABS, GOOGLE_* per feature
docker compose up -d          # starts local Postgres on :5432
npm install
npm run prisma:migrate        # creates the users/messages/reminders tables
npm run dev                   # http://localhost:4000
```

Sanity check: `curl http://localhost:4000/health` should return `{"status":"ok"}`.

Auth endpoints: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` (Bearer
token), `PATCH /auth/me` (update name/timezone/phone — used to link a
WhatsApp number to an existing app account).

PA endpoints (Bearer token): `GET /pa/messages`, `POST /pa/messages` (text),
`POST /pa/messages/voice` (multipart `audio`), `GET /pa/messages/:id/audio`,
`POST /pa/drafts/:id/send|discard`, `POST /pa/research/:id/confirm|dismiss` —
all read/write the same conversation log the WhatsApp webhook uses.

Google OAuth: `GET /oauth/google/start` and `/status`, `DELETE /oauth/google`
(Bearer token); `GET /oauth/google/callback` is Google's redirect target.

## PA: conversation engine, reminders, WhatsApp

- `backend/src/services/conversationEngine.ts` runs the Claude API tool-use
  loop shared by both channels (`handleIncomingMessage(userId, text, channel)`).
  Tools: `create_reminder`, `list_reminders`, `cancel_reminder`,
  `update_user_profile` (name/timezone, used for onboarding a new WhatsApp
  contact). Requires `ANTHROPIC_API_KEY` — without it, the engine replies
  with a friendly fallback message rather than crashing.
- **Tool outcomes are part of the history.** Each turn's tool calls and their
  actual results are stored on the assistant message (`messages.tool_calls`)
  and replayed into the model's view of the conversation as a `<tool_record>`
  block — never shown to the user. Without it the PA re-reads its own "Done,
  I'll remind you" with no evidence the write landed, and either over-trusts
  it or retracts work that actually succeeded. Records are historical: the
  system prompt tells the PA to trust them over its own prose, but to call a
  tool when asked what is true *now*.
- `backend/src/services/scheduler.ts` polls for due reminders and delivers
  them into the shared conversation log (plus a real WhatsApp send, if the
  reminder's channel is `whatsapp`) — so a reminder shows up in the app chat
  even if it was created (or fires) on WhatsApp.
- `backend/src/routes/whatsapp.ts` handles Meta's webhook verification
  handshake and incoming messages, with `X-Hub-Signature-256` verification
  when `WHATSAPP_APP_SECRET` is set. A message from an unknown phone number
  creates a new user (click-to-chat onboarding, `wa.me/<your-number>`) —
  the conversation engine then asks for their name/timezone conversationally.
- An app user links the same WhatsApp number to their account from
  Settings → WhatsApp (calls `PATCH /auth/me`), so both channels land in one
  backend user record per pa-whatsapp-spec.md section 3.

## PA: voice, Gmail, Calendar (Phase 2)

- **Voice** (`backend/src/services/voice.ts`) is an adapter around the same
  text engine: a voice note (WhatsApp audio message, or the app's mic button)
  is transcribed with Whisper (`OPENAI_API_KEY`), handled as a normal text
  turn, and the reply is spoken back with ElevenLabs (`ELEVENLABS_API_KEY`)
  — "reply in kind". Transcripts land in the conversation log so both
  channels show them; audio files live under `backend/storage/` and are served
  from the authenticated `/pa/messages/:id/audio` endpoint. Without the keys,
  voice notes get a polite text fallback and replies stay text.
- **Google** (`backend/src/services/google.ts`): one OAuth connection per user
  covers Gmail (`gmail.modify`) and Calendar (`calendar.events`). Connect from
  Settings → Gmail & Calendar, or — for a WhatsApp-only user — ask the PA,
  which sends the link (the signed `state` identifies the user, so no app
  session is needed). Tokens live in `oauth_connections`.
- **Email rule** (pa-whatsapp-spec.md section 6) lives in the system prompt of
  `conversationEngine.ts`, with the spec's examples verbatim. Its two halves are
  the `send_email` tool (unambiguous requests) and `draft_email` (anything
  needing judgment; money/contracts/legal/declines always). A draft is saved to
  Gmail Drafts and tracked in `email_drafts`; the app shows it as a
  `ConfirmationCard` with Send/Discard, WhatsApp users just reply "send".
- **Calendar**: `list_calendar_events` (availability/context) and
  `create_calendar_event` tools, using the user's stored timezone.

## PA: research & booking-assist (Phase 3)

Web search is Anthropic's **server-side** `web_search` tool, declared alongside
the custom tools in `conversationEngine.ts` — Claude searches inside the same
API call, so there's no separate search provider or API key to configure. A
long search can come back as `stop_reason: "pause_turn"`; the engine resends
the partial turn to resume it.

The confirmation gate lives in `backend/src/services/researchTools.ts`:

- `present_options` stores 2-4 options as a `research_sessions` row and
  attaches them to the assistant message, which the app renders as a
  `ConfirmationCard` with radio-selectable options (WhatsApp gets a numbered
  list). A new set supersedes any older pending one, so "option 2" is never
  ambiguous.
- **Nothing is booked, reserved, or paid, ever.** Confirming only records
  which option the user picked; they complete the booking themselves through
  the option's link. The card says so in a footnote, the system prompt forbids
  claiming otherwise, and the tool result repeats it.
- Confirmation requires an explicit pick: the card's Confirm button stays
  disabled until an option is selected, and `POST /pa/research/:id/confirm`
  validates the option against the stored session and refuses a session that
  is already confirmed or dismissed. On WhatsApp the same gate runs through
  the `confirm_option` / `dismiss_options` tools.
- The app records the pick deterministically first, then runs the user's
  choice through the engine as a normal turn — so the PA hands over the link
  and offers a calendar event or reminder in the user's own language.

## App setup

```bash
cd app
cp .env.example .env          # set EXPO_PUBLIC_API_URL / EXPO_PUBLIC_WHATSAPP_NUMBER as needed
npm install
npx expo install --fix        # reconcile native dep versions for your SDK/toolchain
npm start                     # opens Expo dev tools; press i / a for iOS/Android
```

The app needs the backend running (see above) to sign up / log in.

## Design system

All colors, spacing, radii, and typography live in `app/src/theme/tokens.ts` —
every screen consumes these tokens rather than hardcoding values, so the warm
palette (cream background, terracotta primary accent, sage secondary) or the
corner radius can be changed in one place. The reusable "this needs your OK"
pattern lives in `app/src/components/ConfirmationCard.tsx` (demoed on the
Business Board placeholder; the PA's confirmation-gated actions — email,
bookings, outreach — land in later sessions).

## i18n & RTL

- Languages: English (`en`) and Hebrew (`he`), configured in `app/src/i18n`.
- Device locale is auto-detected on first launch (`expo-localization`); the
  user can override it from Settings → Language.
- Hebrew flips the whole app to RTL via `I18nManager.forceRTL`
  (`app/src/context/LanguageContext.tsx`), which triggers a reload so every
  screen picks up the new writing direction.
- Layouts use logical/direction-aware properties (`flexDirection: "row"`,
  `borderTopStartRadius`, etc.) rather than hardcoded left/right so the RTL
  flip works without per-screen fixes.
- Adding a string: add the key to both `app/src/i18n/locales/en.json` and
  `he.json`.

**Test both languages as you build new screens** — catching an RTL layout
issue early is much cheaper than retrofitting it later (see `build-sequence.md`).

## What's next

Per `build-sequence.md`, Session 4 adds outreach on the user's behalf:
approved WhatsApp templates, the outreach task state machine, and SMS
fallback via Twilio.
