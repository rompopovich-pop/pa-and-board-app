# Payments, Plans & Entitlements — shared spec

*Cross-cutting, like `design-ux-localization-spec.md`: payments belong to neither product on their own. Per-product free-tier limits live here; the UI for paywalls, usage meters and upgrade flows is specified in `design-ux-localization-spec.md` section 8.*

## 1. What's decided

- **Processor**: Stripe. Rom registers as a **UK business**; payouts to a **UK bank account**; base currency **GBP**.
- **Three subscription plans**: **PA**, **Board**, and **Bundle** (both products, priced below the sum of the two).
- **Free tier on every plan**, with usage limits. Paid unlocks full features.
- **The free tier is a real product, not a crippled demo.** Someone should be able to use it indefinitely and find it genuinely useful — the limits exist to cap our marginal costs, not to force a purchase.

## 2. ⚠️ Decide before building: app-store billing rules

**This is the highest-risk open item in this spec, and it can invalidate the Stripe-only approach for the native apps.**

Apple (App Store Review Guideline 3.1.1) and Google Play have historically required digital subscriptions that unlock in-app functionality to be sold through **In-App Purchase**, taking a 15–30% cut — not through a third-party processor like Stripe. Carve-outs exist and are actively changing (external-purchase-link entitlements, regional regulatory rulings, "reader app" exceptions), and the rules differ by jurisdiction.

**Do not treat any summary of these rules — including this paragraph — as current.** Verify against Apple's and Google's live policy, for the UK specifically, before committing. This affects three things at once:

1. **Whether the native apps can ship with a Stripe paywall at all.**
2. **The data model** — if both IAP and Stripe can create a subscription, entitlements must record *which source* granted them, and reconcile two systems of record.
3. **Unit economics** — a 15–30% platform cut changes what the plans have to cost.

Three viable shapes, in rough order of compliance-safety:

| Option | Shape | Cost |
|---|---|---|
| **A. Dual billing** | IAP on iOS/Android, Stripe on web | Most compliant, most work, platform cut on mobile |
| **B. Stripe-only, web checkout** | Subscribe on the web; app reflects entitlement | Simplest to build; needs an approved external-link route or it risks rejection |
| **C. Web-first** | Validate willingness-to-pay on web/PWA, add native IAP later | Defers the decision; delays native launch |

**Recommendation: settle this before Session 10** (see `build-sequence.md`). Like the Meta template approval and the App Store developer accounts, it has real-world lead time and is not a coding problem.

## 3. Draft free-tier limits — for Rom to approve or adjust

**These numbers are a starting point, not a decision.** They are set from one principle: **cap what costs us real money per use; be generous with what is essentially free.** Every PA reply costs Claude API tokens; every voice note costs speech-to-text and speech synthesis; every WhatsApp conversation and outreach SMS costs money per unit. Storage of clients, notes and history costs approximately nothing — so being stingy there would make the free tier feel mean without saving anything.

### PA — free tier

| Limit | Draft value | Why |
|---|---|---|
| Assistant replies / month | **30** | Combined across app + WhatsApp. The main LLM cost driver. |
| Active reminders at once | **5** | Not a cost driver; a shape driver — enough to feel real, not enough to run a life on. |
| Voice notes in / month | **10** | Speech-to-text is cheap per minute but not free. |
| Spoken replies out | **Paid only** | Text-to-speech is the most expensive unit in the product. Free users still *send* voice; they get text back. |
| Email sends or drafts / month | **5** | Connecting Gmail is free; acting on it is the paid value. |
| Calendar | **Read free, create paid** | Reading availability is what makes the PA feel useful; writing is the commitment. |
| Research option sets / month | **3** | Each one is a web-search turn plus a long generation. |
| Outreach on your behalf | **Paid only** | Real per-message cost, and the highest-trust action in the product. |

### Board — free tier

| Limit | Draft value | Why |
|---|---|---|
| Boards | **1** | Multi-board is a power-user need (see `business-board-spec.md` section 7). |
| Clients | **20** | The value metric. Enough to run a genuinely small practice. |
| Notes / history per client | **Unlimited** | Storage is free. Capping this would be the meanest possible limit. |
| Follow-up rules | **1** (the generated default) | Extra rules are the paid refinement value. |
| Board refinements / month | **5** | Each is an LLM schema edit. |
| Quick capture / month | **20** | Each is an LLM parse. |
| Spreadsheet import | **Allowed, capped at the client ceiling** | See below. |

### Bundle — free tier

Both free tiers as above, concurrently. The Bundle's value is in the paid tier, not a richer free tier.

### Two rules that matter more than the numbers

**Importing must not be a loophole.** A free user can import a spreadsheet, but the import stops at the client ceiling: it fills to 20 and reports plainly how many rows were left unimported and what upgrading would bring in. Silently truncating, or refusing the whole file, are both worse than telling them.

**Never hold their data hostage.** Exceeding a limit — including after a subscription lapses — degrades to **read-only, never deletion and never lock-out**. Existing clients stay visible and editable; adding the 21st prompts an upgrade. A user who cancels can still read everything they put in. This is a product commitment, not a nice-to-have, and it should survive any re-tuning of the numbers above.

## 4. Pricing

Deliberately not fixed here — it's Rom's commercial call. Two structural points worth deciding alongside it:

- **The Bundle must cost less than PA + Board separately**, or it isn't a bundle.
- **Monthly and annual** prices per plan (annual usually 2 months free) — decide whether annual ships in v1 or later, since it doubles the Price objects and the upgrade/downgrade paths to test.
- **Single currency (GBP) or localised pricing?** GBP-only is far simpler for v1. Hebrew-speaking users seeing GBP is a friction point worth naming, not a blocker. See `design-ux-localization-spec.md` section 8 for how price is displayed.

## 5. Stripe integration

**Objects.** One Stripe **Product** per plan (PA, Board, Bundle); one **Price** per product per billing interval, in GBP. Free tier is *not* a Stripe object — it's the absence of an active subscription.

**Checkout.** Use **Stripe Checkout** (hosted) rather than a bespoke card form for v1: it keeps PCI scope minimal and handles **SCA / 3-D Secure**, which is mandatory for UK and EU cardholders. Use the **Customer Portal** for plan changes, payment-method updates and cancellation — that removes an entire screen's worth of billing UI we'd otherwise build and maintain.

**Entitlements are derived, cached, and never trusted from the client.** The backend owns the mapping from Stripe subscription state to what a user can do. The app asks the backend what it's entitled to; it never decides for itself, and a client claiming "I'm on Bundle" means nothing.

**Webhooks** drive entitlement changes. At minimum: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`. Verify the **webhook signature** on every request — the same discipline already applied to the WhatsApp `X-Hub-Signature-256` webhook — and make handlers **idempotent**, since Stripe retries and delivers out of order.

**Dunning.** `invoice.payment_failed` should not instantly revoke access. Stripe's Smart Retries plus a grace period (suggest 7 days), with a warm in-app notice, then read-only per section 3.

**Testing.** Stripe test mode plus the Stripe CLI for local webhook forwarding. Build against test mode throughout; live keys are a deployment concern, not a development one.

## 6. Data model additions

- `subscriptions` — user_id, plan (`pa` / `board` / `bundle`), status (`active` / `trialing` / `past_due` / `canceled`), source (`stripe` / `apple` / `google` — see section 2), stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end
- `usage_counters` — user_id, metric (e.g. `pa_replies`, `voice_notes_in`, `email_sends`, `research_sets`, `board_refinements`, `quick_captures`), period_start, count — one row per user per metric per billing month
- `entitlements` — derived, not stored as truth; computed from `subscriptions` + `usage_counters` and cached. Keeping this *derived* means a plan change or a Stripe correction never leaves a stale grant behind.

**Metering is cross-cutting.** Every metered action needs a counter increment at the point the cost is incurred — inside the conversation engine, the voice pipeline, the Google tools, the research tools, the Board generation engine. This is the single most invasive part of the payments work, which is why `build-sequence.md` gives it its own session rather than bolting it onto the paywall UI.

## 7. UK business & tax

Real-world items with lead time, independent of code:

- **Stripe account** in the UK business's name, verified (company details, directors, bank account). Start this early — verification is not instant.
- **VAT.** Selling digital services to consumers has its own VAT rules; UK registration becomes mandatory above the registration threshold, and sales into the EU have their own treatment. **Stripe Tax** can calculate and collect this, but somebody has to decide registration status and switch it on. Check current thresholds and rules with an accountant rather than from this document.
- **Prices inclusive or exclusive of VAT** — a display decision with legal weight for UK consumers (see `design-ux-localization-spec.md` section 8).
- **Payouts**: UK bank account, Stripe's default rolling schedule.
- **Terms of service, refund and cancellation policy** — required by Stripe, and by UK consumer law for digital subscriptions.

## 8. Open decisions

- **Section 2's app-store question** — the one that blocks the most.
- **Exact prices** per plan and interval, and whether annual ships in v1.
- **Free-tier numbers in section 3** — Rom to approve or adjust.
- **Trial or no trial.** A 7- or 14-day full-feature trial converts better than a limited free tier for some products, and cannibalises it for others. The two can coexist but the interaction needs deciding.
- **What happens to a Bundle subscriber who downgrades to one product** while holding data in the other — read-only per section 3, presumably, but worth confirming.
- **Per-seat or per-account?** Assumed per-account for v1; a therapist with an assistant is a plausible near-term exception.
