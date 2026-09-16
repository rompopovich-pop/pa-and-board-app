# Design, UX & Localization — shared spec (applies to both the PA and the Business Board)

This covers the cross-cutting design decisions that apply to both products, since they live in one app and should feel like one coherent piece of software, not two bolted-together tools.

## 1. Design principles
- **Warm, not corporate.** Both products are standing in for a human (a PA, or a business's client relationship) — the visual language should feel calm and personal, not like enterprise software. Soft, human tone in copy; avoid jargon in the UI itself ("Board" not "Database," "Follow up" not "Trigger rule").
- **Conversation-first for the PA, structured-but-simple for the Board.** The PA's whole interface is a chat thread (text or voice) — keep that uncluttered, minimal chrome, focus on the conversation. The Board is more data-dense by nature (client lists, fields) but should stay legible — generous spacing, clear hierarchy, no dense spreadsheet feel.
- **Trust is visual, not just functional.** Anything the PA is about to do on the user's behalf — send an email, book something, message a third party — needs a visually distinct "this needs your OK" state (a confirmation card, not just a text bubble) so it's never ambiguous whether something has actually happened yet.
- **One shared design system** (color palette, typography, spacing, core components — buttons, cards, list items, the confirmation-card pattern) used by both products, so switching between PA mode and Board mode feels like the same app, not a context switch.

## 2. Core UX patterns
- **Confirmation state**: a consistent, recognizable card style for anything pending the user's approval — booking options, an ambiguous email draft, an outreach request about to go out, a spreadsheet import about to create 80 clients. Same pattern reused everywhere it applies across both products.
- **The confirmation card has to stretch to data-dense cases.** A spreadsheet import (`business-board-spec.md` section 5a) needs the same "here's what I'll do, confirm first" moment, but carrying a column→field mapping table, a row count and a duplicate count rather than two lines of prose. It should read as unmistakably the *same* pattern — the attention-colored accent, the rounded card, the confirm/cancel pair — with a denser body: the mapping as a compact two-column list, the columns the engine is unsure about pulled to the top where they need a decision, the confident ones below and collapsible. Resist the urge to build a separate "import wizard" screen; the moment the user is being asked to approve something, it should look like every other time they've been asked to approve something.
- **Status at a glance**: on the Board, status (new / active / needs follow-up / inactive) should be visually scannable — color-coded, not just a text label — since the whole point is a business owner glancing at it and knowing who needs attention.
- **Voice as a first-class input**, not an afterthought — a mic button with the same visual weight as the text field on the PA's chat screen, not buried in a menu.
- **Low-friction onboarding for both**: the PA's setup is a short conversation, not a form; the Board's setup is one text box ("describe your business") — both should get to a working, useful state in under a minute.

## 3. Accessibility
- Standard mobile accessibility: scalable text, sufficient color contrast, screen-reader labels on all interactive elements (especially icon-only buttons).
- Voice input/output is also an accessibility win, not just a "sounds human" feature — worth keeping in mind for anyone who finds typing difficult.

## 4. Visual direction: Warm & Personal (decided)

- **Shapes**: generously rounded corners throughout (cards, buttons, chat bubbles, input fields) — nothing sharp-edged. This is the single biggest lever for "warm" vs "corporate."
- **Color palette**: soft, warm neutrals as the base (warm off-white/cream backgrounds rather than stark white or grey), with one or two warm accent colors (terracotta, warm coral, or sage green work well against a cream base) reserved for primary actions and the "needs your attention" states. Avoid cold blues/greys as primary brand colors — keep those, if used at all, for secondary/neutral UI only.
- **Typography**: a rounded, friendly sans-serif for headings and UI (e.g. Nunito, Quicksand, or Poppins) paired with a highly legible body font. Avoid anything geometric/sharp or default-system-feeling.
- **Voice/copy tone**: first-person, warm, brief — "Got it, I'll remind you Thursday" not "Reminder successfully scheduled." This matters as much as the visuals for "warm and personal."
- **Reference points** (style, not to copy): apps like Headspace or Cleo land in this same warm/personal territory — soft color, round shapes, a friendly voice — worth a quick look for inspiration on tone, not for lifting any actual design assets (that would raise its own IP issues — treat these purely as a feel reference).
- **Where this applies differently**: the PA's chat interface can lean fully into this (rounded bubbles, soft colors, personality in the copy). The Business Board, being more data-dense, should keep the same palette/typography/roundedness but with tighter, calmer spacing — warm doesn't mean cluttered.

## 5. Localization — this needs to be designed in from the start, not added later

### Launch languages (decided): English + Hebrew
Every UI string, every AI-facing prompt instruction, and every WhatsApp template needs a Hebrew version at launch, not just English with Hebrew "added later." Two WhatsApp template variants (English + Hebrew) need to be submitted to Meta for approval — draft starting points below.

**Outreach template — English:**
> Hi, this is {{1}}'s personal assistant. {{2}} Reply here to sort it out.

**Outreach template — Hebrew:**
> שלום, כאן העוזר האישי של {{1}}. {{2}} אפשר לענות כאן כדי לסגור את זה.

(Submit both to Meta as separate approved templates. Keep the variable placeholders — {{1}} for the user's name, {{2}} for the specific request — identical in structure across both languages so the backend logic doesn't need per-language branching, just a language-keyed template selection.)

### Language/RTL detection (decided): auto-detect with manual override
- On first launch, read the phone's device locale (`expo-localization` or `react-native-localize`) to set both the UI language and text direction automatically.
- Add a language setting in-app (Settings → Language: English / עברית) so a user whose phone is in English but who wants to use the app in Hebrew — or vice versa — isn't stuck with the auto-detected choice.
- Technically: use React Native's `I18nManager.forceRTL()`/`allowRTL()` to flip layout direction app-wide when Hebrew is active, and build layouts with logical/direction-aware properties (`start`/`end` rather than hardcoded `left`/`right`) from the start so the flip actually works cleanly rather than needing per-screen fixes later.
- The PA's language of *conversation* (what language it replies in) should still just follow whatever language the user actually types or speaks in, independent of the UI language setting — someone might keep the app UI in English but text the PA in Hebrew, and it should respond in Hebrew.


**Language handling**
- The PA should converse in whatever language the user writes or speaks to it in — Claude handles this natively across many languages, so the conversation engine doesn't need per-language logic, just a instruction to respond in the user's language.
- The Board's generation engine should work the same way: describe your business in Hebrew, Spanish, whatever — get a board with field labels generated in that language.
- App UI strings (buttons, menus, static text — everything *outside* the AI-generated conversation/board content) need a proper i18n setup from day one (e.g. `react-native-localize` + `i18next` if using React Native), not hardcoded English strings that get retrofitted later. Retrofitting i18n into an app that wasn't built for it is a significant rework — worth the discipline of doing it correctly in Phase 1.

**RTL layout — important given Hebrew is a likely target language**
- Hebrew (and Arabic, if that's ever a target) is right-to-left. RTL layout is a real structural requirement, not just "flip the text alignment" — it affects icon placement, swipe gestures, navigation direction, and how the confirmation cards/chat bubbles lay out. Building the UI with RTL in mind from Phase 1 (using layout primitives that respect writing direction rather than hardcoded left/right positioning) is far cheaper than retrofitting it after the fact.

**WhatsApp template localization**
- One detail specific to the PA's outreach feature: Meta requires **message templates to be approved per language**. If the PA is going to text a Hebrew-speaking barbershop in Hebrew and an English-speaking one in English, you need separate approved template variants for each supported language, submitted up front. Worth deciding your initial language set (e.g. English + Hebrew for launch) before submitting templates, since each variant needs its own approval.

## 5a. Paywalls, limits and upgrade — warm applies to money too

Plans, limits and billing mechanics are specified in `payments-spec.md`. This section is only about how any of it is allowed to look and feel.

**The hard rule: "warm, not corporate" does not get suspended when we ask for money.** Paywall UI is where products reach for urgency countdowns, pre-ticked annual plans, a greyed-out "no thanks" in 11px, and a cancel flow buried three taps deep. All of that is off the table here. The product is standing in for a human assistant; an assistant who nagged about money the way most apps do would be fired.

Concretely:

- **Upgrade screens use the ordinary design system** — the same cards, the same rounded corners, the same palette, the same typography. A plan comparison is a set of cards, not a pricing table borrowed from a SaaS landing page.
- **The accent color is for the recommended plan, not for pressure.** No red urgency, no flashing, no countdowns.
- **Declining is as easy as accepting.** "Not now" is a real button with real contrast, sitting beside the upgrade button — not a grey link under the fold.
- **Cancellation lives where subscription lives.** Settings → Subscription, reachable in the same number of taps as subscribing was. With in-app purchase the mechanics belong to the platform: deep-link to the iOS or Android subscription settings rather than building a cancel flow, and don't put a retention gauntlet in front of the link. Be straightforward that managing or cancelling happens in the store — a user hunting for a cancel button we don't have is a worse experience than one sentence telling them where it lives.

**Approaching a limit is information, not a threat.** Show usage where the usage happens — a quiet line on the Board list ("18 of 20 clients"), a note in PA settings — in secondary text, not the attention color. Only when a limit is actually reached does it warrant the confirmation-card treatment, and even then the tone is the PA's usual one: *"That's your 30 messages for this month — want to carry on with more?"* Not *"LIMIT REACHED. UPGRADE NOW."*

**At-limit states must never look like data loss.** Per `payments-spec.md` section 3, exceeding a limit degrades to read-only and never deletes. The UI has to make that obvious at a glance, because a user who *believes* their clients are gone has been harmed just as much as one whose clients actually are. Show the existing data normally; put the gentle upgrade prompt on the action that's blocked, not over the content.

**Copy stays first-person and warm**, like everywhere else: *"You're on the free plan — happy to keep going, just letting you know where you are"* rather than *"Your account has exceeded its allocation."*

### What the stores require on the paywall

Selling through in-app purchase (`payments-spec.md`) adds requirements that are **review-blocking, not stylistic** — an app can be rejected for missing them. They're listed here rather than in the payments spec because they're all things the paywall screen has to show:

- **Price, billing period, and that it renews automatically**, stated plainly next to the purchase button — not in a footnote.
- **A visible "Restore purchases" action.** Apple requires it, and a user reinstalling or moving to a new device genuinely needs it.
- **Links to Terms of Service and Privacy Policy** from the paywall itself.
- **Prices come from the store, never hardcoded.** Fetch them from the current RevenueCat Offering so each storefront shows its own localized, tax-inclusive price. A hardcoded "£4.99" is wrong for most of the world and will eventually be wrong at home too.

None of this conflicts with the warm direction — it just means the honest facts sit *in* the card rather than behind a disclosure link. Say them the way a decent person would: *"£X a month, renews until you cancel — you can cancel any time in your iPhone settings."*

Because prices arrive from the store already localized and tax-inclusive, most of the money-localization work below is handled for us. Render what the store hands back; don't reformat it.

### Localizing money

Going through the stores removes most of this problem — what's left is display, not calculation:

- **Use the store's formatted price string as given.** RevenueCat exposes each price already formatted for the storefront (symbol, separators, placement). Re-formatting it yourself, with `Intl.NumberFormat` or otherwise, can only make it wrong.
- **Currency and tax handling is the platform's**: users see their own currency, tax-inclusive, because Apple and Google are the merchant of record (`payments-spec.md` section 7). The old "GBP-only or localized?" question and the VAT inclusive/exclusive decision both disappear with it.
- **Bidirectional text is still ours to get right.** Hebrew uses Western Arabic numerals, so a price reads left-to-right *inside* a right-to-left line, and the currency symbol sits on the side the locale expects. This is a classic place for bidi rendering to go wrong — check it on a real device, the same way every other RTL layout gets checked (section 5).
- **Leave room for the string to change size.** "£4.99" and a longer localized equivalent are very different widths; a paywall laid out tightly around a short GBP price will break in other storefronts.

## 6. Design tokens — built for easy redesign later

Every color, spacing value, and corner radius in the app should be a **named token** (e.g. `--surface-1`, `--text-accent`, `--radius`), defined once in a single theme file, and every screen should reference the token, never a hardcoded value. This is what the mockups shared during design discussions already do — colors like `var(--bg-accent)` or `var(--text-secondary)` rather than specific hex codes.

Why this matters concretely: if the warm & personal accent color needs to shift from coral to sage six months from now, or the corner radius needs to go rounder, that's a one-line edit in the theme file that updates every screen at once — not a hunt through dozens of components changing hardcoded values one by one. Have Claude Code set this theme file up in Session 0 (the shared foundation session) as the actual source of truth, and treat every subsequent screen as consuming it, not defining its own colors. This is standard practice, but worth stating explicitly as a build requirement rather than assuming it'll happen by default.

Two token additions this implies, kept in the same theme file as everything else: a **success/positive** color distinct from the sage accent (for "you're subscribed", import completed), and a **neutral/disabled surface** for locked or at-limit states that reads as "not available on your plan" rather than "broken".

## 7. Remaining open decisions
- **Adding a third language later (e.g. Spanish)** — not needed for launch, but since the i18n/RTL foundation is being built correctly from Phase 1, adding a language after launch should mainly be translation work, not architecture work.
- **Exact accent color(s)** within the warm palette (terracotta vs coral vs sage as the primary action color) — worth a quick visual mockup pass once Claude Code has a basic screen up, rather than deciding in the abstract.
- **Where the upgrade prompt lives when a limit is hit mid-conversation.** The PA hitting its monthly message cap mid-thread is the awkward case: a paywall card in the chat thread is jarring, but a silent stop is worse. Probably a confirmation-card-styled message from the PA itself, in its own voice — worth prototyping before committing.
- **How much the paywall leans on RevenueCat's own paywall tooling** versus being built from our components. Their hosted paywalls are quicker and remotely updatable; ours guarantees the warm design system carries through. Leaning custom is the default here, given how much of this spec is about not looking like every other subscription app.
