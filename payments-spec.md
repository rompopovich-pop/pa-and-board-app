# Payments, Plans & Entitlements — shared spec

*Cross-cutting, like `design-ux-localization-spec.md`: payments belong to neither product on their own. Per-product free-tier limits live here; the UI for paywalls, usage meters and upgrade flows is specified in `design-ux-localization-spec.md` section 5a.*

## 1. What's decided

- **Native in-app purchase**, on both platforms — StoreKit on iOS, Play Billing on Android. Users buy inside the app with the payment method already on their device. **No web checkout in v1.**
- **RevenueCat** wraps both stores behind one interface, and handles receipt validation, entitlement state, cross-platform restore and webhooks. We do not write raw StoreKit or Play Billing code.
- **Three subscription plans**: **PA**, **Board**, and **Bundle** (both products). **Prices are final** — section 4.
- **Monthly and annual both ship in v1.**
- **Plan decides which tabs exist**, asymmetrically and on purpose: a PA subscriber has no Board tab at all, while a Board subscriber does see the PA tab. Section 4a.
- **The Board's upsell to the PA is contextual, never a banner.** It fires on a real thing the owner just tried to do for a named client. Section 4a is the detailed spec for it, and it is the main acquisition path for PA subscriptions.
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

**Prices come from store price points**, not arbitrary amounts — pick the nearest tier rather than designing around a specific figure. Both stores **localize price automatically** for each storefront, which quietly resolves the old "GBP-only or localized?" question: set the price in one anchor currency and other territories get a converted, tax-inclusive equivalent without extra work. Which currency anchors it is still open (section 9), since the figures below are in USD while the business is UK-based.

**Subscription groups matter more here than plan names do.** On Apple, put **PA, Board and Bundle in a single subscription group**. Within a group a user holds exactly one subscription at a time, and Apple handles upgrades, downgrades and crossgrades — including proration — for free. That is precisely the shape we want: Bundle *replaces* the individual plans rather than stacking with them, and someone moving from PA to Bundle is an upgrade Apple manages. Mirror this on Google Play using one subscription with base plans, or parallel products in equivalent arrangement.

A consequence worth stating: **a user cannot hold PA and Board as two separate subscriptions.** Wanting both means buying Bundle. If that's ever wrong commercially, it needs separate subscription groups and the smooth upgrade path is lost — so it's a decision, not an implementation detail.

### Prices — **final**

| Plan | Monthly | Annual | Annual saving |
|---|---|---|---|
| **PA** | **$4.50** | **$45** | ~17% |
| **Board** | **$6.50** | **$60** | ~23% |
| **Bundle** (both products) | **$11** | **$95** | ~28% |

**Annual ships alongside monthly in v1**: six products to configure rather than three, and the upgrade paths between them all need testing.

Two consequences of these numbers, stated here rather than discovered during a pricing review:

**The monthly Bundle is exactly PA + Board** ($4.50 + $6.50 = $11.00). The saving lives in the annual price ($95 against $105 for two annual plans). This is coherent, but it changes what the monthly Bundle can be *sold* on. Because the single subscription group above means nobody can hold PA and Board at once, the comparison a user actually makes is "Board at $6.50, or Bundle at $11" — the second product costs exactly its standalone price, with a genuine discount arriving only if they commit for a year. So **monthly Bundle copy must not claim a saving**; it is sold on getting both products, and the annual price is where "cheaper together" is true. The earlier rule in this section — *the Bundle must cost less than PA + Board separately* — is superseded by that reasoning; it was written before the single-subscription-group decision made buying both separately impossible.

**These figures are targets, not store price points.** Each store picks from its own price ladder: map each figure to the nearest available point in App Store Connect and Play Console, confirm what the console actually offers, and let the stores localize from there (they convert and apply tax per storefront). Don't assume $4.50 exists verbatim in both ladders, and don't design any layout around a specific string — see `design-ux-localization-spec.md` section 5a on rendering the store's own formatted price.

**Introductory offers** — free trials, intro pricing — are first-class on both stores and configured there rather than in our code. That makes the "trial or no trial" question cheaper to answer than it would have been with a processor (section 9).

## 4a. Plan visibility and the Board → PA upsell

The two products are **deliberately asymmetric** here. Building this as a generic paywall would lose the whole point, so it is specified in detail.

### Which tabs each plan sees

| The user is on | PA tab | Board tab |
|---|---|---|
| **PA** (paid) | Full | **Absent** |
| **Board** (paid) | Visible, evidently a paid product | Full |
| **Bundle** | Full | Full |
| **No paid plan** | Visible, free tier (section 3) | Visible, free tier (section 3) |

**A PA subscriber has no Board tab at all** — absent from the tab bar, not greyed out, not a teaser. Someone who bought a personal assistant is not necessarily a business owner, and a permanently locked mode is clutter that makes the app feel like it was sold to someone else. There is nothing to upsell here: a person with no clients to track has no moment where a CRM would help, so manufacturing one would be the nagging this product refuses to do.

**The one exception is not negotiable: a user who has Board data always keeps the Board tab.** A Bundle or Board subscriber who moves down to PA-only has clients, notes and history in there. Hiding the tab would make their own data unreachable, which is exactly what section 3 forbids — *read-only, never deletion and never lock-out*. So the rule to implement is **"absent if they have never created a board"**, not "absent if unentitled". A lapsed owner sees their board, reads everything, and is invited back; they are never told their clients are gone by a tab quietly vanishing.

**A Board subscriber does see the PA tab, and that is the point.** The Board is where the moments live that make a personal assistant obviously worth having — a client to chase, a reminder to send, an invoice going unpaid. Hiding the PA from the very users best positioned to want it would cost us the product's most natural upgrade path.

**What "paywalled" means for that tab, reconciled with the approved free tier.** Section 3 grants *everyone* a real PA free tier — 30 assistant replies a month, 5 reminders, 10 voice notes in. That is approved and stays true for Board subscribers and free users alike, so the PA tab is **not a dead lock screen**: it opens, it works, and it works within those limits. What is gated is what section 3 says is paid — spoken replies, outreach, calendar writes, email beyond the monthly five — plus everything past the monthly cap. The tab's first-open state for a user with no PA plan introduces what the assistant does and what it costs, in the app's own voice, and then lets them try it. A user who has never used the PA meeting a locked door learns nothing about why they'd pay for it; a user who has had it draft two emails knows exactly.

> If the intent is instead that buying Board **withdraws** the PA free tier, that contradicts section 3 as approved and needs deciding explicitly — it is listed in section 9 rather than assumed here.

### The upsell is an action they wanted, not a banner

**The mechanism: the Board surfaces the moments where an assistant would help, as real actions on the client record. The action is always visible. Only the doing is gated.** Tapping it when unentitled opens a card that says what the assistant would do *for this named client, right now*, with the price and a way to buy. It never hides the action, and it never leaves it silently broken.

**The moments that trigger it** — each is something an owner already wants to do, not an invented occasion:

| On the record | The assistant would |
|---|---|
| A follow-up is due (Board Phase 2) | Message the client to get them booked back in |
| A next appointment is set | Send the appointment reminder the day before |
| An unpaid balance or invoice field has a value | Send the payment request |
| A visit needs preparation | Send the instructions — what to bring, where to park, how to prepare |
| A session or job was just logged | Send the thank-you, the aftercare note, or the "shall we book the next one?" |

Each carries a channel — **WhatsApp or email** — chosen from what the client record actually holds.

**Not the same thing as contacting them yourself.** The client record already offers **Call** and **WhatsApp** buttons that open the owner's own apps with the client's number. Those are free, always available, and stay that way — they are the owner doing it. The gated action is **the assistant doing it for them**, and the two must be visually and verbally distinct, or the upsell is selling something the user can already do by hand and will read as a con.

**On payment requests specifically: the assistant sends the ask, it does not take the money.** The message carries whatever the owner already uses — their payment link, their bank details, an invoice attachment. Collecting client payments in-app is a different product with its own store-policy and money-handling questions, and is out of scope.

### The three states of a gated action

1. **Entitled** — the PA composes the message and shows the **ordinary confirmation card** before anything is sent, exactly as it does for the user's own outreach (`pa-whatsapp-spec.md` section 7, Phase 4). The upsell is the only thing that changes with the plan; the confirmation discipline never does.
2. **Not entitled** — the contextual upsell card described below.
3. **Never** absent, disabled without explanation, or apparently working but doing nothing.

### What the upsell card says

It is a **confirmation card** (`design-ux-localization-spec.md` section 2), in the ordinary design system: same rounded card, same attention accent, same confirm/decline pair. Not an interstitial, not a modal takeover, not a different visual language.

It carries, in this order:

1. **The specific thing, named.** The client's name, the channel, and what would be sent. *"I'd send Dana a WhatsApp reminder about Thursday's session, and let you know when she replies."* Never "Unlock PA features".
2. **What it would keep doing.** One line on the ongoing value, not a feature list: *"Same for anyone else on your board who needs chasing."*
3. **The price**, from the store, for the smallest plan that unlocks it. For a Board subscriber that is the Bundle upgrade; for a free user it is whichever of PA or Bundle fits what they are doing. State the billing period and that it renews — the store-mandated disclosures in `design-ux-localization-spec.md` section 5a apply to this card exactly as they do to the plan screen, because it is a purchase surface.
4. **Upgrade**, and a real **Not now** beside it with real contrast.

**Tone is the PA's, first person, warm and brief.** English: *"I could send Dana that reminder for you — she hasn't booked since her last session. Your assistant is $4.50 a month, or $11 with the Board."* Hebrew: *"אני יכול לשלוח לדנה את התזכורת במקומך — היא לא קבעה תור מאז הפגישה האחרונה."* Never urgency, never a countdown, never a scarcity claim.

### Rules that keep it from becoming a nag

- **It appears on a tap, never on its own.** The owner opens it by reaching for the action. No interstitials on launch, no banner across the board list, nothing that appears while they are doing something else.
- **Declining is remembered.** After "Not now", the action stays where it is but stops re-explaining itself at length: the next tap shows a compact version. The full card is worth showing again only after a meaningful interval or a different kind of moment.
- **One at a time.** A record with three eligible moments shows the most relevant action, not three upsells stacked up.
- **Never sell what we cannot yet do.** A gated action must not ship before the capability behind it works, or the first thing a paying customer discovers is that they bought nothing. See the dependency note below.
- **After the purchase, finish the job.** Completing an upgrade returns to the same action, for the same client, and carries on — landing them back on the board list to find their own way is how you turn a new subscriber into a refund.

### What this depends on

The paid side of every action above is **PA outreach to a third party** (`pa-whatsapp-spec.md` section 7, Phase 4) reached **from a Board client record** (`business-board-spec.md` section 6, Phase 4). Email-only moments can lean on the Gmail tools that already exist, but the WhatsApp ones cannot.

That has a direct consequence for build order, and `build-sequence.md` currently says the opposite: its note that *Sessions 10-11 can move ahead of Session 9 if validating willingness-to-pay matters more than feature completeness* was written when the paywall was a plan-comparison screen with no dependency on the Board↔PA integration. **It now has one.** Shipping this upsell before that integration exists would mean taking money for an action that cannot run. Either the sequencing note is amended, or an early-payments release ships the plan screen only and holds the contextual upsell back until Session 9 lands.

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

- ~~**Exact prices** per plan, and whether **annual** ships in v1~~ — **decided**, section 4. What remains is mechanical: mapping each figure to the nearest store price point in both consoles.
- **Which storefront anchors the prices.** The figures in section 4 are in USD while the business is UK-based (section 7). Setting the US price and letting the stores convert gives a GBP price nobody chose; setting the GBP price and letting them convert gives a USD price nobody chose. Pick the anchor deliberately, and sanity-check what the other major storefronts land on.
- **Does buying Board withdraw the PA free tier?** Section 4a assumes not — the section 3 free tier holds for everyone, and the PA tab is a working sample rather than a locked door. The alternative (Board subscribers get a fully paywalled PA tab) is a real option, but it contradicts section 3 as approved and would need re-approving there.
- **How long "Not now" lasts** on a contextual upsell (section 4a) before the full card is worth showing again, and whether a different trigger type resets it.
- **Trial or intro offer?** Now cheap to configure on both stores. A free trial converts better than a limited free tier for some products and cannibalises it for others — and we have both, so the interaction needs deciding rather than defaulting.
- **Can a user ever hold PA and Board separately** rather than buying Bundle? Section 4 assumes not, which is what buys the smooth Apple-managed upgrade path.
- **Family Sharing** (Apple) — supported per-product; decide whether a Bundle should be shareable.
- **What happens to a Bundle subscriber who downgrades to one product** while holding data in the other — read-only per section 3, presumably, but worth confirming.
- **Per-seat or per-account?** Assumed per-account for v1; a therapist with an assistant is a plausible near-term exception, and IAP makes multi-seat harder than a processor would.
- **Whether a web/Stripe path is ever wanted** for desktop signup or for markets where store economics are poor. Not v1; the `store` column in section 6 keeps the door open.
