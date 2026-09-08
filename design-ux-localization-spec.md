# Design, UX & Localization — shared spec (applies to both the PA and the Business Board)

This covers the cross-cutting design decisions that apply to both products, since they live in one app and should feel like one coherent piece of software, not two bolted-together tools.

## 1. Design principles
- **Warm, not corporate.** Both products are standing in for a human (a PA, or a business's client relationship) — the visual language should feel calm and personal, not like enterprise software. Soft, human tone in copy; avoid jargon in the UI itself ("Board" not "Database," "Follow up" not "Trigger rule").
- **Conversation-first for the PA, structured-but-simple for the Board.** The PA's whole interface is a chat thread (text or voice) — keep that uncluttered, minimal chrome, focus on the conversation. The Board is more data-dense by nature (client lists, fields) but should stay legible — generous spacing, clear hierarchy, no dense spreadsheet feel.
- **Trust is visual, not just functional.** Anything the PA is about to do on the user's behalf — send an email, book something, message a third party — needs a visually distinct "this needs your OK" state (a confirmation card, not just a text bubble) so it's never ambiguous whether something has actually happened yet.
- **One shared design system** (color palette, typography, spacing, core components — buttons, cards, list items, the confirmation-card pattern) used by both products, so switching between PA mode and Board mode feels like the same app, not a context switch.

## 2. Core UX patterns
- **Confirmation state**: a consistent, recognizable card style for anything pending the user's approval — booking options, an ambiguous email draft, an outreach request about to go out. Same pattern reused everywhere it applies across both products.
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

## 6. Design tokens — built for easy redesign later

Every color, spacing value, and corner radius in the app should be a **named token** (e.g. `--surface-1`, `--text-accent`, `--radius`), defined once in a single theme file, and every screen should reference the token, never a hardcoded value. This is what the mockups shared during design discussions already do — colors like `var(--bg-accent)` or `var(--text-secondary)` rather than specific hex codes.

Why this matters concretely: if the warm & personal accent color needs to shift from coral to sage six months from now, or the corner radius needs to go rounder, that's a one-line edit in the theme file that updates every screen at once — not a hunt through dozens of components changing hardcoded values one by one. Have Claude Code set this theme file up in Session 0 (the shared foundation session) as the actual source of truth, and treat every subsequent screen as consuming it, not defining its own colors. This is standard practice, but worth stating explicitly as a build requirement rather than assuming it'll happen by default.

## 7. Remaining open decisions
- **Adding a third language later (e.g. Spanish)** — not needed for launch, but since the i18n/RTL foundation is being built correctly from Phase 1, adding a language after launch should mainly be translation work, not architecture work.
- **Exact accent color(s)** within the warm palette (terracotta vs coral vs sage as the primary action color) — worth a quick visual mockup pass once Claude Code has a basic screen up, rather than deciding in the abstract.
