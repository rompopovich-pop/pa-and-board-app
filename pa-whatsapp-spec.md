# WhatsApp + App PA — v1 Product & Technical Spec

*Design, UX, and localization requirements (including multi-language and RTL support) are covered separately in `design-ux-localization-spec.md` — apply those alongside this doc. Plans, free-tier limits and billing are in `payments-spec.md`; the PA's free-tier limits are in its section 3.*

## 1. Vision
A personal assistant, reachable through **both** a native app (iOS/Android) and WhatsApp, that behaves like a warm, capable human PA — by text and by voice. It:
- Talks naturally, in a warm human tone, over text or voice messages
- Sets and tracks reminders
- Reads, drafts, and sends emails on your behalf (auto-sends when the request is unambiguous, drafts and asks when it isn't)
- Reads/writes to your calendar
- Searches the web and helps you research/plan things (flights, etc.) — proposes options, **you confirm before anything is booked or paid**
- Contacts other people/businesses on your behalf and reports back

Built as a multi-user product from day one, with the app and WhatsApp as two front doors to the exact same PA and conversation history.

## 2. Core user experience

**Onboarding**
- Via app: download from App Store/Google Play, sign up, connect Gmail/Calendar via OAuth, optionally link WhatsApp too.
- Via WhatsApp: tap a `wa.me/<business-number>?text=Hi` click-to-chat link, PA replies and walks through a short setup (name, timezone, connect email/calendar via a link it sends back).
- Either path lands the user in the **same backend user record** — someone can start on WhatsApp and finish setup in the app, or use both interchangeably day to day.

**Everyday use**
- Text or send a voice note, on either channel — PA replies in kind (warm text, or a spoken voice reply if you sent voice).
- PA classifies intent (reminder, email, calendar, research, "contact someone for me") and acts.
- Reminders fire back into whichever channel you last used (or both, your choice).
- Third-party outreach: PA sends an approved WhatsApp template ("Hi, this is `{user_name}`'s assistant — `{request}`"), negotiates once they reply, reports back to you.
- Research/booking: PA searches, presents 2-4 options, waits for explicit confirmation before anything transactional.
- Email: if the request is clear ("reply to Dana confirming Thursday at 3"), PA sends it and tells you it did. If it's ambiguous ("deal with that email from Dana"), it drafts and shows you first.

## 3. Architecture overview

```
   Native app (iOS/Android)          User's WhatsApp
   (React Native, shared UI)               |
              |                    WhatsApp Cloud API (Meta)
              |                             |
              +--------------+--------------+
                             |
                       Your backend API
                             |
     +---------+-------------+-------------+-------------+
     |         |             |             |             |
 Conversation  Voice        Task/         Outreach      OAuth
 /Intent       pipeline     Scheduler     engine         integrations
 engine        (STT/TTS)    service       (3rd-party     (Gmail,
 (Claude API)                (reminders,   WhatsApp/SMS   Google
     |                        cron/queue)  outreach)      Calendar)
 Web search /
 booking research
     |
 Confirmation gate
 (nothing transactional
 or auto-sent-when-
 ambiguous happens
 without explicit "yes")
     |
 Postgres (users, threads,
 reminders, outreach tasks,
 conversation state, OAuth
 tokens)
```

Key principle: **one user, one conversation/task state**, regardless of which channel (app or WhatsApp) they're using right now. Both clients talk to the same backend API.

## 4. Channels

### 4.1 Native app
- React Native (or Flutter) for a single codebase across iOS/Android — with two front doors from day one, sharing code between them is what keeps this feasible.
- In-app chat UI (text + voice recording/playback), push notifications for reminders and outreach updates.
- App Store + Google Play developer accounts, and their review processes, are a parallel non-engineering critical path — start those accounts early since review can take days, independent of how fast the code is ready.

### 4.2 WhatsApp
- Official WhatsApp Business Platform (Cloud API), one business number for the whole product, routing by sender phone number.
- User-initiated messages: free-form replies for 24h after their last message.
- PA-initiated outreach to third parties: requires a **pre-approved template** (submit these early — approval takes hours to days), e.g.:
  > "Hi, this is {{1}}'s personal assistant. {{2}} Reply here to sort it out."
- Voice notes: Cloud API supports sending/receiving audio media natively — same STT/TTS pipeline as the app.

## 5. Voice pipeline
- Incoming voice note (app or WhatsApp) → speech-to-text → treated as a normal text message by the conversation engine.
- Outgoing voice reply → text-to-speech (something like ElevenLabs or a comparable TTS provider for a warm, natural voice) → sent back as an audio message.
- Keep this as a layer on top of the same text conversation engine, not a separate system — the PA's "brain" always thinks in text; voice is just an input/output adapter.

## 6. Email & Calendar integration
- OAuth connect to Gmail (and ideally Outlook later) and Google Calendar, same pattern as connecting any third-party account.
- Email: PA can read, draft, and send. Rule: **auto-send when the request is unambiguous, draft and ask when it isn't.**

**Auto-send (clear recipient + clear content, no judgment call needed):**
- "Tell Dana I'll be there at 3"
- "Confirm the meeting time with Alex for tomorrow at 10am"
- "Send my flight details to Maria"
- "Reply to the landlord that rent will be paid by Friday"
- "Let the team know I'll be 10 minutes late"

**Draft first (recipient/content requires inference, tone, or judgment):**
- "Deal with that email from my boss" — no instruction on what the reply should say
- "Tell him I'm not interested" — needs wording/tone crafted, sensitive
- "Reply to the client about the pricing issue" — requires judgment on positioning/numbers
- "Handle my inbox" — one instruction covering many unknown emails
- "Apologize to Sarah for missing the call" — needs personalized wording
- Anything mentioning money, contracts, legal terms, or a decline/rejection — draft regardless of how clear the instruction sounds, given the downside of getting tone or details wrong

The dividing line: if the PA has to *decide what to say*, it drafts. If the user has already decided and the PA is just *delivering it*, it sends.
- Calendar: read for availability/context, write for creating events from reminders, confirmed bookings, or direct requests.

## 7. Capability build order (all shipped in v1, sequenced so each is solid before the next depends on it)

**Phase 1 — Core PA on both channels**
- Backend + Postgres, WhatsApp Cloud API wired up, native app shell (auth, chat UI) for both platforms.
- Claude-powered conversational engine handling general chat + reminders, shared identically across both channels.
- Scheduler service firing reminders back into the right channel.

**Phase 2 — Voice, email, calendar**
- STT/TTS pipeline layered onto the existing conversation engine.
- Gmail + Google Calendar OAuth, read/draft/send logic with the auto-send-when-clear rule.

**Phase 3 — Research & booking-assist**
- Web search integration for flights, restaurants, general research.
- "Present options, wait for explicit confirmation" flow — never finalizes anything transactional.

*Every phase below is metered — see `payments-spec.md` section 3 for which actions count against a free-tier limit, and section 6 for where the counters get incremented. The metering work itself is sequenced separately in `build-sequence.md`; build each phase as though it were unmetered and let that session add the counters.*

**Phase 4 — Outreach on your behalf**
- Approved WhatsApp templates for contacting third parties.
- Outreach task state machine: template sent → waiting for reply → negotiating → resolved/failed → reported back to user.
- SMS fallback (Twilio) for contacts who don't respond on WhatsApp.
- This same outreach engine is reused by the Business Board's own Phase 4 (see `business-board-spec.md`) so a business owner's client follow-ups can go out via WhatsApp using this infrastructure — build it generically (task type + target + template), not hardcoded to personal use only.

## 8. Data model (starting point)
- `users` — phone number, email, name, timezone, preferences, plan, connected channels
- `messages` — full conversation log per user, tagged by channel (app/WhatsApp) and modality (text/voice)
- `reminders` — user_id, text, due_at, status, recurrence, preferred delivery channel
- `oauth_connections` — user_id, provider (Gmail/Calendar), tokens, scopes
- `outreach_tasks` — user_id, target_number, request text, status, thread log, resolved outcome
- `research_sessions` — user_id, request, options presented, chosen option, confirmed (bool)

## 9. Suggested tech stack
- Mobile: React Native (shared iOS/Android codebase) or Flutter.
- Backend: Node.js or Python (FastAPI).
- DB: managed Postgres (Supabase/Neon) to skip ops overhead early.
- Scheduler: BullMQ (Node) or Celery/APScheduler (Python).
- WhatsApp: Cloud API directly, or via Twilio/360dialog for faster setup.
- Voice: a speech-to-text API (e.g. Whisper) + text-to-speech provider (e.g. ElevenLabs).
- LLM: Claude API for the conversation engine, with web search enabled for research tasks.
- Hosting: Railway/Render/Fly.io is enough for v1.

## 10. Open decisions still worth making
- ~~**Business model**: free tier vs paid~~ — **decided**: three plans (PA, Board, Bundle), each with a free tier capped by usage, billed through Stripe. See `payments-spec.md`. How the per-conversation WhatsApp cost and the voice API cost get absorbed is answered there by which limits sit on the free tier: spoken replies and outreach are paid-only precisely because they are the two most expensive units in the product.
- **Template copy**: exact outreach template wording to submit to Meta (submit early — approval has lead time).
- **"Unambiguous" criteria for auto-sending email** — worth writing a few concrete examples before build so the rule is testable.
- **Outreach guardrails**: tone/negotiating room the PA has when contacting someone on your behalf.
- **Data retention**: especially for voice recordings and third-party contact content.

## 11. Draft system prompt seed for the PA
> You are {user_name}'s personal assistant, reachable by text or voice through the app or WhatsApp. Be warm, brief, and capable — the way a genuinely excellent human PA talks, not like a chatbot. You can: set and track reminders, read/draft/send email, read/write calendar events, research things on the web and present options, and reach out to other people/businesses on {user_name}'s behalf when asked. Send an email yourself only when the instruction is clear and unambiguous about recipient and content; otherwise draft it and ask first. Never finalize a booking, purchase, or payment without explicit confirmation from {user_name}. When contacting a third party on {user_name}'s behalf, always identify yourself as their assistant, never impersonate {user_name} directly.
