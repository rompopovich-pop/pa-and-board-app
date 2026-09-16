# Payments, Plans & Entitlements — shared spec

*Cross-cutting, like `design-ux-localization-spec.md`: payments belong to neither product on their own. Per-product free-tier limits live here; the UI for paywalls, usage meters and upgrade flows is specified in `design-ux-localization-spec.md` section 5a.*

## 1. What's decided

- **Native in-app purchase**, on both platforms — StoreKit on iOS, Play Billing on Android. Users buy inside the app with the payment method already on their device. **No web checkout in v1.**
- **RevenueCat** wraps both stores behind one interface, and handles receipt validation, entitlement state, cross-platform restore and webhooks. We do not write raw StoreKit or Play Billing code.
- **Three subscription plans**: **PA**, **Board**, and **Bundle** (both products, priced below the sum of the two).
- **Free tier on every plan**, with usage limits (section 3, approved). Paid unlocks full features.
- **Apple Small Business Program assumed** — the reduced commission rate for small developers.
- **The free tier is a real product, not a crippled demo.** Someone should be able to use it indefinitely and find it genuinely useful — the limits exist to cap our marginal costs, not to force a purchase.
- Rom's **UK business** and **UK bank account** still matter, but for receiving store payouts rather than for running a payment processor (section 7).

> **On rates and terms below:** platform commission structures, program thresholds and RevenueCat's pricing all change, and some are under active regulatory pressure in the UK and EU. Every number in this document is "as understood when written" — confirm against Apple, Google and RevenueCat's current published terms before relying on any of it commercially.

## 2. Why in-app purchase, and what it costs us

**The decision is user experience.** A native purchase sheet — Face ID, the card already on file, no browser hop, no re-entering details — converts better and feels like part of the app. A web checkout, even a good one, means bouncing the user out to Safari mid-flow. For a product whose whole premise is "warm, feels like a person", that hop is off-brand.

It also removes the compliance question entirely. Apple and Google generally require IAP for digital subscriptions that unlock in-app functionality; selling this through an external processor risks rejection. Going native means we're on the default-approved path rather than navigating carve-outs that shift with each policy update and court ruling.

**What it costs, recorded honestly so nobody is surprised later:**

| Cost | Detail |
|---|---|
| **Commission** | ~15% under Apple's Small Business Program and Google's reduced/subscription rate, versus roughly 3% for a card processor. That is the price of the smoother flow. |
| **No web purchase path** | If a desktop or web signup ever matters, that's a second billing integration, not a config change. |
| **Slower pricing changes** | Prices come from store price points and changes go through the store, so pricing experiments are slower than flipping a value in a dashboard. |
| **Refunds aren't ours** | Apple and Google own refunds. We can't issue one for a frustrated user; we can only see that it happened. Support replies need to say so kindly. |
| **Native builds required to test** | See section 8 — this one has an immediate effect on how the app is built and tested. |

### Commission structure

- **Apple**: the standard rate applies by default; the **Small Business Program** reduces it to the lower tier for developers under the annual revenue threshold. Enrollment is **an application, not automatic**, and status is reviewed annually — so it needs doing, and re-checking each year.
- **Google Play**: a reduced rate applies to the first tranche of annual earnings, and **subscriptions carry the lower rate** rather than the standard one. Broadly comparable to Apple's small-business rate for a product at this stage.
- Both platforms have faced regulatory change in the UK and EU that may alter these terms — worth a check before modelling margins.

## 3. Free-tier limits — **approved**

Approved as drafted. The principle behind them: **cap what costs us real money per use; be generous with what is essentially free.** Every PA reply costs Claude API tokens; every voice note costs speech-to-text and speech synthesis; every WhatsApp conversation and outreach SMS costs money per unit. Storage of clients, notes and history costs approximately nothing — so being stingy there would make the free tier feel mean without saving anything.

### PA — free tier

| Limit | Value | Why |
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

| Limit | Value | Why |
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

## 4. Pricing and store product setup

**Prices come from store price points**, not arbitrary amounts — pick the nearest tier rather than designing around a specific figure. Both stores **localize price automatically** for each storefront, which quietly resolves the old "GBP-only or localized?" question: set the GBP price, and other territories get a converted, tax-inclusive equivalent without extra work.

**Subscription groups matter more here than plan names do.** On Apple, put **PA, Board and Bundle in a single subscription group**. Within a group a user holds exactly one subscription at a time, and Apple handles upgrades, downgrades and crossgrades — including proration — for free. That is precisely the shape we want: Bundle *replaces* the individual plans rather than stacking with them, and someone moving from PA to Bundle is an upgrade Apple manages. Mirror this on Google Play using one subscription with base plans, or parallel products in equivalent arrangement.

A consequence worth stating: **a user cannot hold PA and Board as two separate subscriptions.** Wanting both means buying Bundle. If that's ever wrong commercially, it needs separate subscription groups and the smooth upgrade path is lost — so it's a decision, not an implementation detail.

Still to decide: **the actual prices**, and whether **annual** ships alongside monthly in v1 (annual doubles the products to configure and the upgrade paths to test). The Bundle must cost less than PA + Board separately, or it isn't a bundle.

**Introductory offers** — free trials, intro pricing — are first-class on both stores and configured there rather than in our code. That makes the "trial or no trial" question cheaper to answer than it would have been with a processor (section 9).

## 5. RevenueCat integration

**Why RevenueCat rather than raw StoreKit / Play Billing:** one SDK and one entitlement model across both platforms, server-side receipt validation we don't have to write or keep correct as receipt formats change, cross-platform restore, and webhooks that turn purchase events into something our backend can act on. The alternative is maintaining two native billing integrations and a receipt-validation service — a large amount of subtle, security-sensitive work that is not this product's differentiator.

**Shape of it:**

- **Products** configured in App Store Connect and Play Console, then mapped in RevenueCat to **Offerings** (what the paywall shows) and **Entitlements** (what access a purchase grants). Suggest three entitlements: `pa`, `board`, and Bundle granting **both**, so entitlement checks stay per-product rather than per-plan.
- **App side**: `react-native-purchases` (RevenueCat's React Native SDK). It fetches the current Offering to render the paywall, runs the purchase, and exposes the customer's entitlements. **Identify the user to RevenueCat with our own user ID** (`logIn`) on sign-in, so entitlements follow the account across devices and platforms rather than being stranded on one install.
- **Server side**: **RevenueCat webhooks** are the source of truth for our backend. On purchase, renewal, cancellation, billing issue, refund or product change, RevenueCat posts to us and we update the `subscriptions` row and recompute entitlements. **Verify the webhook's authorization header** — the same discipline already applied to the WhatsApp `X-Hub-Signature-256` webhook — and make handlers **idempotent**, since webhooks retry and can arrive out of order.

**Server-side entitlement enforcement is not optional here, and this product has a specific reason.** The PA is reachable over **WhatsApp, where there is no app and no SDK** — a user messaging the business number has no client to check. Entitlements therefore have to be resolvable from our own database for a phone number with no app session at all. The client SDK is for *rendering* the paywall; the backend decides what actually runs. A client claiming "I'm on Bundle" means nothing.

**Billing issues get a grace period, not an instant cut-off.** Both stores support billing-retry and grace-period settings — configure them in App Store Connect and Play Console rather than in code — and treat a user in grace as still entitled, with a warm in-app notice. Only once the store reports the subscription actually lapsed does section 3's read-only state apply.

**Restore purchases must exist.** Apple requires a way for a user to restore previous purchases (reinstall, new device). RevenueCat's `restorePurchases` covers it; the paywall needs the button (`design-ux-localization-spec.md` section 5a).

## 6. Data model additions

- `subscriptions` — user_id, plan (`pa` / `board` / `bundle`), status (`active` / `in_grace_period` / `expired` / `canceled`), store (`app_store` / `play_store`), revenuecat_customer_id, product_id, current_period_end, will_renew
- `usage_counters` — user_id, metric (e.g. `pa_replies`, `voice_notes_in`, `email_sends`, `research_sets`, `board_refinements`, `quick_captures`), period_start, count — one row per user per metric per billing month
- `entitlements` — derived, not stored as truth; computed from `subscriptions` + `usage_counters` and cached. Keeping this *derived* means a plan change, a refund or a store correction never leaves a stale grant behind.

Keeping `store` on the subscription row costs nothing now and matters later: it's what makes a web/Stripe path addable without a migration, and it's what support needs in order to tell a user *where* to cancel — since we can't do it for them.

**Metering is cross-cutting.** Every metered action needs a counter increment at the point the cost is incurred — inside the conversation engine, the voice pipeline, the Google tools, the research tools, the Board generation engine. This is the single most invasive part of the payments work, which is why `build-sequence.md` gives it its own session rather than bolting it onto the paywall UI.

## 7. UK business & tax

**Going native simplifies this substantially.** In the UK, the EU and most major markets, **Apple and Google act as merchant of record**: they sell to the customer, and they collect and remit the VAT. That removes the tax-calculation integration, the digital-services VAT registration question for those sales, and the inclusive-versus-exclusive display decision — store prices are shown tax-inclusive by the platform.

What still needs doing, none of it code:

- **App Store Connect and Google Play Console accounts** for the UK business, with **banking and tax forms completed**. Payouts don't flow until these are in place, and they take time.
- **Apple Small Business Program enrollment** — an application with an annual review, not an automatic rate (section 2).
- **Corporation tax and accounting** on the payouts received. Platform payouts arrive net of commission and on the stores' own schedules, which differ from each other; the bookkeeping is not the same shape as processor payouts.
- **Terms of service, refund and cancellation policy** — still required, and the refund policy must be honest that refunds are handled by Apple or Google rather than by us.
- **Confirm merchant-of-record treatment for every territory you actually sell in.** It is the norm in the markets that matter here, but it isn't universal, and "Apple handles all our VAT everywhere" is the kind of assumption that is cheap to check and expensive to get wrong.

## 8. Testing and build implications

**This changes how the app is built, starting before the payments session.** The IAP native module cannot run in Expo Go — the current web-export-and-screenshot workflow used through Sessions 0-3 cannot exercise a purchase at all. Specifically:

- The app needs a **development build** (`expo-dev-client`) or EAS builds, with `react-native-purchases` in the native layer.
- **iOS**: StoreKit configuration files allow local testing in the simulator without App Store Connect round-trips; sandbox Apple IDs cover the fuller flow on device.
- **Android**: licence testers plus an internal testing track; purchases need a signed build uploaded to Play.
- **Neither store's purchase flow can be tested on the web build**, so paywall *layout* can be checked in the existing web workflow, but purchase, restore, upgrade and lapse paths need real devices.

Worth standing this up early — a store account that isn't ready, or a dev build that won't compile with the native module, blocks the payments sessions completely.

## 9. Open decisions

- **Exact prices** per plan, which store price tier, and whether **annual** ships in v1.
- **Trial or intro offer?** Now cheap to configure on both stores. A free trial converts better than a limited free tier for some products and cannibalises it for others — and we have both, so the interaction needs deciding rather than defaulting.
- **Can a user ever hold PA and Board separately** rather than buying Bundle? Section 4 assumes not, which is what buys the smooth Apple-managed upgrade path.
- **Family Sharing** (Apple) — supported per-product; decide whether a Bundle should be shareable.
- **What happens to a Bundle subscriber who downgrades to one product** while holding data in the other — read-only per section 3, presumably, but worth confirming.
- **Per-seat or per-account?** Assumed per-account for v1; a therapist with an assistant is a plausible near-term exception, and IAP makes multi-seat harder than a processor would.
- **Whether a web/Stripe path is ever wanted** for desktop signup or for markets where store economics are poor. Not v1; the `store` column in section 6 keeps the door open.
