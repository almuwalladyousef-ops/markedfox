# MarkedFox — project brief

**Product name:** MarkedFox · **Domain:** `markedfox.com` · **Repo:** `markedfox`
(working title of the old personal app was "Content OS" — that name is retired)

> **This file is the complete, self-contained context for the build.** Memory in
> Claude Code is keyed to the filesystem path, so a session here starts with empty
> memory — this file is the durable context and nothing outside it should be
> assumed. Keep its Phase 0 checklist and Log current as decisions change.

---

## What is being built

A commercial SaaS product for creators. Web first (PWA), native apps much later.
Two pillars at launch:

1. **Publisher** — one composer, publishing and scheduling to every major platform
   at once.
2. **DM & comment automation** — a ManyChat replacement. Comment triggers, keyword
   matching, DM sequences, follower automation. This is the differentiator.

A third pillar — **research & scripting** (Sandcastles-style: watch channels, flag
videos that outperform their own channel baseline, pull transcripts, generate hooks
and scripts) — is built within the launch cycle but sequenced last (owner decision
2026-08-13, reversing the earlier defer-to-v2 call): it reuses the same platform
APIs as the publisher and DM engine, so those two are made to work first and
research follows on their foundations. The Studio tier that carries it is public
from launch.

**Funnels** land post-launch, built on the same DM engine, and go into the existing
paid tier rather than creating a new one.

**Design target: a launch burst of ~100 users signing up at once**, from an
audience being grown in parallel at 4 posts per day. Beyond ~100 users, a
professional developer is hired and the app is rebuilt by hand. So this build
optimizes for surviving launch and learning fast, not for infinite scale. Where
those conflict, launch survival wins.

The owner is also user #1 in production — it replaces a $30/month posting tool he
pays for today — but that is a side effect of building it properly, not the target.
It is built for strangers from the first line.

---

## Current state

**Zero code.** This is a fresh repository. There is no prior work to migrate,
refactor, or preserve.

**Phase 0 progress as of 2026-08-10:**

- [x] Name chosen: **MarkedFox**
- [x] `markedfox.com` registered
- [x] Social handles reserved on Instagram, TikTok, YouTube, X, and Threads
- [x] Role account created: **`markedfox.usa@gmail.com`** — owns the Meta and
      TikTok developer accounts, and is the login of record for every service
      (Supabase, the VPS provider, Cloudflare, GitHub). Deliberately not a personal address,
      so the whole stack transfers with one handover if the product is sold.
- [x] Meta developer account created
- [x] TikTok developer account created under MarkedFox (the *account* only —
      it contains no apps yet; see the app-creation item below)
- [ ] **2FA on `markedfox.usa@gmail.com`**, recovery codes stored offline, recovery
      email and phone set. That inbox controls the Meta app and its Business
      Verification — losing it means losing weeks of approval progress with no
      appeal path. Audited 2026-08-13: 2-Step Verification is **off**; one passkey
      and one Google-prompt device are registered; recovery phone is **not set**;
      recovery email is set to `almuwalladyousef@gmail.com` but **unverified**.
      Backup codes only become available after 2SV is switched on.
- [ ] **Repoint the role account's recovery email before any sale.** It currently
      points at the owner's personal inbox, so a buyer receiving the role account
      would still have account recovery routed to the seller — an unremovable
      takeover path from the buyer's point of view. Fine while one person holds
      both; an exit-time task exactly like the Cloudflare zone move.
- [ ] Confirm the Meta app sits inside a **Business portfolio** at
      `business.facebook.com` — verification attaches to the portfolio, not the app
- [ ] **Create the MarkedFox TikTok app.** Verified 2026-08-13 by signing into
      the developer portal: the MarkedFox developer account exists (settings
      show `m***a@gmail.com`) but **contains no apps at all**. The earlier
      "two apps exist, resolve the duplicate" note was wrong — the pre-existing
      personal app is under a different TikTok login, not this one, so there is
      nothing here to delete and nothing to choose between. Create the app,
      then record its client key and secret in `.env.local`.
- [ ] Separately, check whether the old personal TikTok app has a completed
      Content Posting API audit worth preserving. This requires signing into
      that other TikTok account. If it has no audit, ignore it entirely —
      TikTok offers no transfer path, so it cannot be moved regardless.
- [ ] Facebook Page for MarkedFox, Instagram account switched to **Business**, and
      the two linked — the Instagram Graph API does not work without this
- [ ] Cloudflare Email Routing for `admin@` / `hello@` / `support@markedfox.com`
- [x] Cloudflare: `markedfox.usa@gmail.com` added as Super Administrator on the
      owner's personal Cloudflare account. Note that Super Admin covers the **whole
      account**, not just `markedfox.com` — Cloudflare's per-domain scoped roles are
      Enterprise-only. Acceptable while one person controls both accounts.
- [ ] **After ~2026-10-09** (60-day ICANN transfer lock on a newly registered domain
      expires): create a separate Cloudflare account owned by the role account, move
      the `markedfox.com` zone into it, and remove the role account from the personal
      account. Otherwise handing over the role account at sale time also hands over
      admin on the owner's unrelated personal domains.
- [ ] General ownership rule: new services sign up under the role account; anything
      already on a personal account gets the role account added as admin rather than
      migrated. Full consolidation is an exit-time task, not a now task.
- [ ] USPTO search, classes 9 and 42
- [ ] **File Meta Business Verification** — the longest pole in the plan
- [ ] **File for a D-U-N-S number** for the LLC (free, weeks of latency) —
      required for Apple Developer organization enrollment when the native apps
      come. Same file-the-slow-things-first logic as Business Verification
- [x] Provision Supabase (hosted project created 2026-08-12; CLI installed;
      stays in the personal default org by owner decision 2026-08-13 — an empty
      MarkedFox org exists as the exit-time transfer destination)
- [ ] Provision Cloudflare R2, the VPS, AI key (GitHub repo exists)

An older personal single-user app exists at `/Volumes/Yousef Disk/Content-Os`
(GitHub remote `almuwalladyousef-ops/Content-Os`). It is **reference only** and is
not being ported. Three commits in it are worth reading if the equivalent problem
comes up again:

- `ae98f10` — splitting messages over Instagram's 1000-character limit
- `8ad6b05` — deduplicating webhook deliveries so nothing sends twice
- `34bde3c` — fixing an un-tapped prompt locking a user out of a rule

Everything else in that repo is dead. In particular, three files there were
load-bearing for one user and fatal for two, and none of their patterns should be
repeated: OAuth tokens stored in browser cookies with one account per platform; a
"database" of JSON files in a personal Google Drive with read-modify-write and no
locking; and bespoke per-platform publishing functions with no shared interface.

That old app also felt slow for a structural reason: the database was JSON over the
network, and media proxied through home internet. Postgres plus object storage
fixes that by construction.

---

## Stack

- **Next.js + TypeScript + Tailwind**
- **Supabase** — Postgres and Auth. Row Level Security is the tenant-isolation
  mechanism: the database refuses other users' rows, so a route that forgets to
  scope fails closed instead of leaking.
- **A single VPS** — the only host. Hetzner preferred (monthly billing, no renewal
  cliff, cheap on-demand snapshots); Hostinger acceptable if already paid for.
  Caddy for auto-TLS, `systemd` units for the app and timers for the scheduler.
- **Cloudflare R2** — media, deleted after publish. Zero egress fees.
- **No Vercel.** Rollback is provider snapshots plus a standby box that costs
  nothing until booted. Vercel's free Hobby tier is not licensed for commercial
  use, so it is not an option either.
- **Nothing runs on a Mac mini.** Home internet and power are not product
  dependencies.

---

## The insight that sets the build order

**Approvals are not a final step. They require the features to already exist.**

- Meta App Review for `instagram_manage_messages` requires a screencast of the DM
  engine actually running, plus working test credentials. The DM engine must be
  finished *before* the review that legalizes it for other people can be filed.
- Every audit — Meta, TikTok, YouTube — requires a live privacy policy, terms, a
  marketing page, and a demo video. These are filing prerequisites, not launch
  polish.
- Meta Business Verification needs only the legal entity, which already exists. It
  can be filed in week one and it is the longest pole in the plan.

Meanwhile the job queue, burst survival, payments, onboarding, and the PWA need no
approvals at all. Those are exactly what gets built during the review wait.

```
entity (exists) ──> Business Verification (weeks) ──────────────┐
                                                               │
domain ─> VPS ─> auth ─> schema+RLS ─> adapters ─> DM engine ─> filing package
                                                               │
                                                               └─> FILE EVERYTHING
                                                                        │
                                        (during the wait) queue, payments, onboarding, PWA
                                                                        │
                                                    approvals land ─> beta 10 ─> launch
```

---

## Platform reality — verified, do not re-derive

This determines the adapter order and it is easy to get wrong.

| Platform | Unaudited / pre-approval behaviour |
|---|---|
| **Instagram, Facebook, Threads** | Meta Development mode serves only accounts with an app role, but those accounts post **publicly** with full API access, including `instagram_manage_messages`. Fully usable by the owner from day one. |
| **X** | Pay-per-use since Feb 2026. **$0.015 per post, $0.20 if it contains a link**, no monthly minimum. No review of any kind. Legacy $200/mo Basic is closed to new signups. |
| **TikTok** | Unaudited clients force every post to `SELF_ONLY`, require the posting account to be private, and allow only 5 accounts to authorize per 24 hours. **Unusable for real posting until audited.** |
| **YouTube** | Unverified API projects have every `videos.insert` upload **locked to private, with no appeal** — the video must be re-uploaded manually. Worse than useless until audited. |
| **LinkedIn** | Posting to a member's own profile via `w_member_social` needs no partner program. Company pages and comment management need Community Management API partner access. |
| **Pinterest** | Trial access has limits; production needs review. |

TikTok's and YouTube's audits require a working app, legal pages, and a demo video
— but **not** a business entity. Only Meta's App Review depends on Business
Verification. Confirm on each form rather than assuming.

**Adapter build order:**

1. **Instagram** — the vertical slice
2. **X** — trivial, no review
3. **Threads + Facebook** — same Meta app, nearly free to add
4. **TikTok + YouTube** — build, then audit
5. **LinkedIn + Pinterest** — post-launch

---

## Locked decisions

- **Existing family LLC is the entity.** It already has an EIN, so Business
  Verification files immediately rather than after a formation wait, and Meta's
  address check passes against a real physical business address more easily than a
  new LLC's registered-agent address. A dedicated product LLC is only formed if the
  product reaches 10–20 paying users. Accepted trade: the Meta app is anchored to
  whichever Business portfolio is verified, so spinning the product into its own
  LLC later means re-verifying with Meta.
- **One role account owns everything: `markedfox.usa@gmail.com`.** Meta developer
  account, TikTok developer account, Supabase, the VPS provider, Cloudflare, GitHub, and the
  domain all sit under it. Never a personal address — the entire stack has to
  transfer in a single handover if the product is sold. It carries 2FA with recovery
  codes stored offline, because that inbox controls the Meta app and its Business
  Verification and there is no appeal path if it is lost.
- **New Meta app, not the old one.** The owner holds only a non-admin role on an
  older personal app, and neither verification nor App Review carries over. The app
  must sit inside a **Business portfolio** at `business.facebook.com` — verification
  attaches to the portfolio, not the app, and Instagram messaging permissions need
  that anchor. Creating the app first and adding it to a portfolio afterward is
  fine; moving an app between two portfolios *after* one is verified is what costs
  weeks.
- **The TikTok app is created fresh on the MarkedFox developer account.**
  Corrected 2026-08-13: that account holds no apps, so the earlier "the app
  already exists on the correct account, only the redirect URI changes" note
  was mistaken. Nothing needs moving — TikTok offers no transfer path anyway,
  which is precisely why the app is created on the role account from the start.
- **X is caption-field only and URLs are blocked server-side.** The URL guard is a
  13x cost control ($0.015 vs $0.20), so it is never a UI-only check.
- **Platforms are gated by plan.** This is packaging, not economics — every API
  except X costs $0 per post. It costs `canUserDo(...)` checks in the composer plus
  locked-state UI.
- **Adding a platform is one adapter file** in `lib/platforms/`. Never bespoke code
  in a route.
- **Stripe for payments**, using an account the owner already has working. Set a
  **custom statement descriptor** so the product name (not the restaurant's legal
  name) appears on card statements, and update the Stripe account's business
  description and website to match the product — otherwise an account registered as
  a restaurant that starts billing recurring SaaS from a new domain can trip
  Stripe's review and get funds held. PayPal was rejected (weak subscription API,
  poor failed-payment handling, no real customer portal) and Wise is not a customer
  payment processor at all. Whop was considered and rejected on cost: ~6–7% all-in
  versus Stripe's 4.4% on a $20 ticket, and its value is marketplace discovery the
  owner does not need.
- **Entitlements live in our own tables.** The payment processor's only job is
  writing to `subscriptions` via webhook. Swapping processors later is one adapter
  file.
- **PWA at launch; iOS and Android apps committed, sequenced after the web
  launch** (decided 2026-08-12). The web app launches to the ~100-user burst
  first; native follows once there are paying customers. Store IAP takes 15%
  under $1M/yr versus Stripe's ~4.4% on a $20 ticket, so the web paywall stays
  the primary sales path — `subscriptions.processor` already accepts `'apple'`
  and `'google'` beside `'stripe'`, each writing entitlements via its own
  webhook (Apple Server Notifications V2, Google RTDN). Apple organization
  enrollment needs a **D-U-N-S number** for the LLC — weeks of latency, so it
  is filed in Phase 0 beside Meta Business Verification. Apple is $99/yr,
  Google Play $25 once, both on the role account. No native framework is chosen
  yet; the scaffold keeps publish/connect/entitlement logic in route handlers
  and `lib/`, never inlined into React Server Components, so a native client
  calls the same endpoints.

---

## Asset separation and transferability

The product is expected to be sold eventually, so its identity is kept separate from
the owner's personal identity at every layer. Separating now is cheap; retrofitting
it during a sale is not. The role account `markedfox.usa@gmail.com` is the master
key — handing it over carries most of the stack with it.

**The operating rule: anything not yet created gets created on the role account.**
Adding the role account as an admin is only the workaround for things already created
under a personal account. Payment methods do not need separating — a personal card on
a product account is an entity expense, and a buyer simply swaps the card.

**One deliberate exception:** R2 stays on the same personal Cloudflare account as the
domain, because an R2 custom domain requires the zone to live in the same account.
Both move together after the registration lock lifts.

| Asset | Separable | Mechanism | Action |
|---|---|---|---|
| **Domain + DNS + Email Routing + R2** | Yes | Cloudflare accounts are separate units and one login can belong to several | Currently on a personal Cloudflare account. After ~2026-10-09 (60-day registration lock) move the zone into a dedicated Cloudflare account owned by the role account |
| **GitHub repo** | Yes | Repo transfer, instant, no lock | Nothing — currently under `almuwalladyousef-ops`, fine |
| **Supabase** | Yes | The **organization** is the transferable and billable unit — projects move between orgs and org ownership hands over. A separate login account is unnecessary | **Owner decision 2026-08-13: the project stays in the personal default org.** Moving it is a one-click dashboard transfer, so consolidation is an exit-time task like everything else. An empty **MarkedFox** org (`jxbuzgxqvtrgdecxyszj`) already exists on the account as the ready-made destination for that day. Region is ca-central-1 — changing it later is a data migration, not a setting |
| **VPS** | Yes, but only cleanly if started right | Moving a server between provider accounts is a snapshot-and-restore or a support ticket, not a setting | Create a **new provider account** under the role account. Hetzner is preferred — monthly billing with no renewal cliff, and cheap on-demand snapshots, which the rollback strategy depends on. Hostinger is acceptable if already paid for, but its advertised price needs a long prepaid term, renewal is typically 2–3× that, and its snapshot allowance is thinner — confirm on-demand snapshots exist before relying on them. Expect possible identity/payment verification taking up to a day, so create the account before it is needed |
| **Meta app** | Yes | Business portfolio supports multiple admins — add buyer, remove self | App must live inside its own **Business portfolio**, not float loose |
| **Facebook Page** | Yes | Page admin roles | Page is separate from any personal Page |
| **Instagram, TikTok, X** | Yes | Separate logins, hand over credentials | Already separate |
| **YouTube channel** | Yes | The channel sits on a dedicated Google account, so the account itself is the product's — hand over the login. A Brand Account would only be needed if the channel were stuck on a personal Google identity | Nothing |
| **Role account Gmail** | Yes — it is the master key | Hand over credentials | 2FA with offline recovery codes. Also repoint the recovery email and recovery phone away from the owner's personal identity at handover — otherwise the seller keeps a recovery route into the account that carries the whole stack |
| **Stripe** | **No** | Stripe accounts are bound to a legal entity and do not transfer. The buyer opens their own and Stripe runs a support-assisted, PCI-compliant migration of customer and card data | Standard for acquisitions; budget time for it, not a one-click step |

Note that **customers never connect their own Supabase.** This is a single
multi-tenant database holding every user's rows, including their encrypted OAuth
tokens. That is why RLS is the entire tenancy story, and why the Supabase
organization is the single most valuable asset in a sale.

**The VPS is deliberately disposable and does not need to transfer at all.** Code
lives in Git, all state lives in Supabase, and media in R2 is deleted after publish.
The box is only a machine running code it pulled from the repo, so a buyer provisions
their own server, deploys from the repo, and points DNS at it. Nothing is migrated.
The same reasoning means R2 buckets never need moving — there is nothing durable in
them.

**So the only asset that must transfer intact is Supabase.** Everything else either
moves as an object (GitHub repo, Cloudflare zone), is a login handover (the social
accounts and the role account), or is disposable (the VPS, R2). This is why creating
Supabase under the role account matters more than any other account decision here.

---

## Pricing

| | **Free** | **Pro $20/mo** | **Studio $49/mo** | **Enterprise** |
|---|---|---|---|---|
| Posts | 10/week | Unlimited | Unlimited | Unlimited |
| Platforms | 3 — Instagram, TikTok, YouTube | All | All | All |
| X | ✗ | 300/mo, no external links | 300/mo, no external links | Raised |
| DM rules | 1, capped monthly sends | Unlimited rules, monthly send cap | Same | Raised |
| Research (pillar 3) | ✗ | ✗ | Credit allowance | Raised |
| Funnels *(post-launch)* | ✗ | ✓ | ✓ | ✓ |

**Annual billing at roughly two months free.** The audience is hot for about one
week — annual converts that week into cash upfront instead of monthly churn risk.

**Pricing rules:**

1. **"Unlimited" only for what is free to serve.** Instagram, TikTok, YouTube,
   Facebook, Threads, LinkedIn, and Pinterest cost nothing per post. X, AI calls,
   transcription minutes, and storage are metered upstream and always carry a hard
   number.
2. **X is never unlimited.** Unlimited X at $20 means a 30-post-per-day user costs
   $13.50/month — 68% of the plan before any other cost. A 300/month cap puts the
   worst case at $4.50 and almost nobody reaches it.
3. **Video upload minutes are capped on every plan.** Unlimited video is unlimited
   transcode CPU and storage.
4. **Free gets one DM rule.** Meta rate-limits **per app, not per user** — free
   users burn the same shared budget paying users need.
5. **Studio $49 is public from launch** (owner decision 2026-08-13, reversing the
   earlier launch-hidden call). Only Enterprise stays hidden. Consequence to
   manage: until research ships, Studio is Pro at 2.45x the price — research must
   land before or at launch, or Studio checkout should be held back at the last
   moment. The `is_public` flag in `plans` makes that a row edit.
6. **Enterprise is a "Contact us" mailto with zero build.** Limits are rows in the
   `plans` table, so raising a cap for one account is a row edit, never code. No
   SSO, no contracts — none of that is relevant at 100 users.
7. **Features that cost nothing to serve go into existing tiers.** Funnels, new
   platforms, and new rule types raise the value of Pro rather than spawning a
   tier. Only metered features justify a new tier.

**Positioning:** ManyChat is $15+/month and publishes nothing. Buffer publishes and
does no DMs. The pitch is one line — *everything ManyChat does plus everything
Buffer does, for less than either*. The moat is the combination and the audience,
not out-featuring either incumbent at its own game.

---

## Rules

1. **Phases are gated.** All exit criteria pass before the next phase starts.
2. **Exit criteria are verified, not believed.**
3. **No code assumes one user, one account per platform, or a shared secret.**
4. **Payments, login, sessions, and entitlements are foundational** (Phase 2
   schema), not features added later.
5. **Provider snapshots are the rollback** — taken before every deploy, restore
   verified once before launch.
6. **`npm run build` must be green before every commit.**
7. **Every working session writes a log to `sessions/`** (`YYYY-MM-DD-topic.md`):
   decisions made, what was built, verification results, open items. The next
   session reads the latest log before proposing anything. **Handoff briefs for
   other chats/assistants live in `handoff/`** (`YYYY-MM-DD-topic.md`) — a
   handoff is written for a different reader than a session log and never
   contains secrets.

---

## Phases

### Phase 0 — Entity and filings opened

Week one, before any code. Everything here has weeks-to-months of latency outside
our control.

Register `markedfox.com` (Cloudflare Registrar, at cost) and **reserve** `@markedfox`
on Instagram, X, TikTok, YouTube, and Threads. Three reasons, in order of weight:
they are part of the **transferable brand asset package** if the product is ever
sold (a buyer discounts or demands a fix when a handle belongs to a squatter); they
are squatting defense; and they are a trust signal for strangers about to hand the
product OAuth access to their own accounts. These accounts are **not operated** —
there is no brand content plan, because distribution comes from the owner's existing
personal audience. Once there is real revenue, **file a trademark** (~$250–350 per
class at USPTO) for the same reason: it is the most transferable asset in the package
and it blocks copycats. Run a USPTO search for "markedfox" in
classes 9 and 42 before the name goes onto legal pages or into Business
Verification. Create the new Meta developer account, then the Business portfolio,
then the Business app inside it. **File Meta Business
Verification immediately** with the Certificate of Formation, EIN letter, and proof
of business address. Authorize the Meta Developer Tools MCP. Note the TikTok client
key and secret. Provision Supabase, Cloudflare R2, the VPS, GitHub, and an AI key.

**Exit:** `markedfox.com` resolves and the social handles are claimed; the Meta app
exists under the right account with App ID and secret in hand; Business Verification
is submitted; every credential collected.

### Phase 1 — Ground

Scaffold the app. Provision the VPS **first** — it is the only host, so it exists
before any domain or redirect URI points at it. Harden it (non-root, SSH keys only,
ufw, unattended-upgrades). Caddy for auto-TLS, `systemd` units plus timers. Point
DNS at the VPS. Register OAuth redirect URIs against the real domain, once, against
their final home. Create the Supabase project and R2 bucket. Enable snapshots.

**Exit:** the app serves on the real domain over valid TLS; all OAuth flows connect
end to end; a scheduled post fires from a systemd timer and publishes; Supabase
backup/restore tested; a snapshot restore tested.

### Phase 2 — Users and tenancy

The phase that makes it a product, and the highest-stakes one.

Supabase Auth with signup, login, password reset, and email verification.
**Persistent sessions** via refresh tokens — nobody re-authorizes their platforms
because a session expired. Schema: `users`, `workspaces`, `connections`,
`scheduled_posts`, `history`, `dm_rules`, `usage`, `plans`, `subscriptions`.
**`canUserDo(user, action)` from day one**, backed by `plans`, encoding the whole
pricing table. Usage rows for every costed action. `connections` stores encrypted
tokens keyed by `(user_id, workspace_id, platform)`, with **many accounts per
platform per user**. **RLS on every table, written before the routes that use
them.** Token encryption that fails loudly without the secret rather than falling
back to a dev key. Server-side token refresh so background jobs never snapshot
tokens.

**Exit:** two accounts sign up and are fully isolated; one user connects two
Instagram accounts at once; clearing cookies loses no connection; a background job
publishes with no browser session open; every table's RLS policy listed; reading
another user's data returns empty or 403, proven by test; a plan-locked platform
cannot be published to **by API**, not merely hidden in the UI; every costed action
writes a usage row.

> A cross-tenant leak is business-ending at any user count — it is someone else's
> Instagram account. RLS is what makes this affordable to get right: let the
> database refuse, rather than relying on remembering to scope every query.

### Phase 3 — Platform adapters (pillar 1)

A `Platform` interface — connect, refresh, publish, capabilities (`text`, `image`,
`video`, `carousel`, `schedule`, `analytics`) — with a registry in
`lib/platforms/`, one file per platform, in the order listed above. The composer
targets any combination of connected accounts, rendering plan-locked platforms as
locked rather than hidden. Per-platform validation (caption limits, aspect ratios,
media rules) surfaced **before** publish, never as an error after. The X guard and
X post counting enforced server-side.

**Exit:** every platform publishes from a test account; a hypothetical new platform
touches exactly one new file; the composer blocks invalid content before submit; a
URL in a caption blocks the X post server-side, proven by test; the 301st X post in
a month is refused; partial failure reports precisely which platform failed and
why.

### Phase 4 — DM and comment automation (pillar 2)

Deliberately ahead of burst work, because Meta will not review
`instagram_manage_messages` without a screencast of it running.

The DM engine on Postgres, per user. Per-user webhook routing — one Meta webhook,
fanned out by account. A rules engine: comment trigger to DM reply, keyword
matching, per-post targeting. Follower and new-follower automation. Sequences.
Per-tenant delivery dedupe. Send counting against plan caps. Tap and click tracking
with per-rule analytics. A rule builder a non-technical buyer can use unaided.
Structured so funnels are a later addition to this engine, not a new one.

**Exit:** two users' rules run simultaneously without cross-talk; a comment on user
A's post never triggers user B's rule, proven by test; duplicate webhook deliveries
are dropped, verified under replay; rules survive a server restart mid-sequence; a
webhook burst from many accounts loses no event; the free-plan send cap is
enforced; a rule built by someone else, without instructions, works.

> This is the biggest external risk in the plan. `instagram_manage_messages` is the
> hardest permission Meta grants and the one ManyChat holds as a licensed Tech
> Provider. It works on the owner's own account in Development mode regardless, so
> it gets built and proven either way — and the publisher must be able to sell
> without it.

### Phase 5 — Filing package, then submit everything

Privacy policy and terms written for real customers, live on the domain. A public
marketing page, because reviewers check that the product is real. A demo screencast
per platform showing each requested permission in use. Test credentials for every
reviewer. A data deletion callback and account deletion endpoint, which Meta
requires.

Then file all at once: **Meta App Review** (`instagram_basic`,
`instagram_content_publish`, insights, `instagram_manage_messages`, Facebook page
publishing, Threads), the **TikTok audit** (Content Posting API for third parties
plus `video.list`), the **YouTube API audit**, **LinkedIn** partner access,
**Pinterest** review, and **X** production access.

**Exit:** legal pages and marketing page live; a demo video per requested
permission; every submission filed with dates recorded; Business Verification
confirmed complete.

### Phase 6 — Build through the wait

Nothing here is blocked by a reviewer, so it happens while submissions sit in
queues. It is also the phase that exists because 100 people arrive on one day.

A **job queue with a concurrency cap**, Postgres-backed via `SELECT … FOR UPDATE
SKIP LOCKED`, so publishing never runs unbounded. Separate queues and caps per job
type. Retries with backoff and a dead-letter state a human can inspect. Media
lifecycle: upload, object storage, publish, delete. **Platform rate-limit
budgeting** — Meta and TikTok rate-limit per app, not per user, so every customer
including free users shares one budget; back off before the platform does. A
concurrent signup path handling 100 OAuth connections in an hour. Health checks,
uptime monitoring, and alerts that reach a phone. Cost tracking for X and AI.

Then Stripe (Free and Pro only, monthly and annual, upgrade, downgrade, failed
payment), a mailto for Enterprise, onboarding that needs no explanation, error
states a stranger can act on, account deletion and data export, the PWA, and a
support path with canned answers for the OAuth questions every user will ask.

**Exit:** 100 posts due in the same minute all publish with none dropped and the
box responsive; killing the server mid-publish loses no job; media is deleted post
publish and storage stays flat over a week; hitting a rate limit backs off and
recovers; breakage alerts arrive without a user reporting it; a stranger signs up,
subscribes, connects, and publishes with no help; failed payment downgrades access;
a Pro to Free downgrade re-applies every Free limit; account deletion genuinely
removes all data; the app installs to a phone home screen and works.

### Phase 7 — Approvals land

A hard gate. Answer reviewer follow-ups, resubmit rejections, close any gap a
reviewer names, and cleanly remove any platform that is not approved.

**Exit:** approvals granted for every platform shipping at launch; any unapproved
platform fully removed.

> Do not show the app to the audience before this passes. A hundred people hitting
> "Connect Instagram" and failing burns the launch and the credibility of the exact
> audience being built for months.

### Phase 8 — Launch

A closed beta of 10 users from the audience running real workflows for two weeks.
Fix everything it surfaces. Then open to the audience and watch queue depth, error
rate, rate limits, and costs.

**Exit:** beta ran two weeks with no data loss and no cross-tenant incident; the
launch burst was absorbed without an outage; paying customers.

---

## Cost

| | |
|---|---|
| Domain | $12/year |
| Legal entity | **$0** — already owned |
| Every approval and audit | **$0** |
| VPS while building | **~$6/month** — Hetzner CX22 at €4.50 (2 vCPU, 4GB, 40GB, 20TB traffic) plus ~€0.90 for snapshots. Hourly billing, no contract. Billed in EUR, so expect a small foreign-transaction fee |
| Supabase, R2, transactional email, uptime monitoring, GitHub | **$0** — free tiers |
| AI keys while testing | ~$0–5/month, pay-per-use |
| **Total to build** | **$12 once plus ~$5/month** |
| Infra at 100 users | **~$52–99/month** — Supabase Pro $25, VPS $10–17, snapshots $2, R2 $5, email $0–20, AI $10–30 |

Payment processing fees and X costs only appear once there is revenue and users
posting. Break-even is roughly 3–5 paying users for infrastructure, so out of ~100
signups the conversion floor is about 5%.

The owner currently pays $30/month for posting tools. This costs $5/month to build.

**Timeline:** roughly 3–4 months to filing-ready, then 6–12 weeks of approvals
overlapping Phase 6. Realistic launch around February 2027. Approvals are the
schedule; filing early is the only lever we control.

---

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `instagram_manage_messages` refused | **Kills pillar 2** | Built and proven in Development mode regardless; the publisher must sell alone |
| Cross-tenant data leak | **Kills the business** | RLS from Phase 2, verified by test, not by discipline |
| Business Verification drags | High | Filed week one against an entity that already has an EIN |
| App Review rejected on missing artifacts | High | Phase 5 exists to produce them before filing |
| Unlimited X eats the Pro margin | High | Hard 300/month cap plus a server-side URL block; usage rows from day one |
| Launch burst takes the box down | High | Phase 6 exit criteria are the rehearsal |
| Launching before approvals land | High | Phase 7 is a hard gate |
| LinkedIn partner access refused | Medium | Ship without it; the adapter stays ready |
| Free users burning the shared Meta rate-limit budget | Medium | One rule and a send cap on Free, plus Phase 6 budgeting |
| Product later needs its own LLC | Low | Accepted: re-verification with Meta, weeks, and only if it sells |
| Scope creep back toward three pillars at once | Medium | Pillar 3 is explicitly v2; this file is the answer to "should we just add it" |

---

## What the owner does, and what Claude does

**Owner — none of this is code, and all of it is on the critical path:**

1. Register `markedfox.com`, claim the `@markedfox` handles, run the USPTO check.
2. Create the Meta developer account on `markedfox.usa@gmail.com`, then the
   Business portfolio, then the app inside it.
3. File Meta Business Verification.
4. Authorize the Meta Developer Tools MCP:
   `claude mcp add --transport http meta_developer_tools https://mcp.facebook.com/devtools`
   then `/mcp` in an interactive session, signing in with the new email. It offers
   API discovery, app status, compliance deadlines, and webhook debugging. It is
   read-mostly and **cannot create apps**, and the sign-in repeats on every client
   restart.
5. Provide credentials: Supabase project URL plus anon and service-role keys;
   Cloudflare R2 account ID, access key, secret, and bucket; VPS IP with an SSH
   public key installed; Meta App ID and secret; TikTok client key and secret; a
   Gemini or Groq API key.
6. Later: file the TikTok and YouTube audits, which need a demo video but not an
   entity.

**Claude — the build**, in the phase order above.

---

## First actions in the new session

1. Read this file in full before proposing anything.
2. Scaffold: Next.js, TypeScript, Tailwind, Supabase client wiring (server, client,
   middleware), the first migration containing the full schema with RLS policies,
   `canUserDo`, and the `lib/platforms/` interface with the Instagram adapter
   stubbed.
3. Keep this file as `CLAUDE.md` and update its Log section as decisions change.

---

## Log

- **2026-08-09** — Original plan created, then retargeted for a ~100-user launch
  burst. Supabase and RLS settled; X caption-only settled; approvals made a hard
  pre-launch gate; native apps deferred to the post-100 rebuild.
- **2026-08-10** — Scope cut to two launch pillars, with research and scripting
  deferred to v2. Readback and LinkScribe cut entirely. Fresh repository confirmed.
  New Meta app under a dedicated role account; the TikTok app stays where it
  is. Pricing settled, which reversed the earlier "every platform is a plain
  toggle" decision in favour of plan gating. Vercel dropped entirely — provider
  snapshots are the rollback. Phases reordered around the fact that approvals
  require finished features, so the DM engine moved ahead of burst work and a
  dedicated filing-package phase was added. Entity settled: use the existing family
  LLC now, form a dedicated one only past 10–20 paying users. Stripe chosen over
  PayPal, Wise, and Whop. Platform pre-approval behaviour verified for TikTok,
  YouTube, X, and Meta. Product named **MarkedFox**, `markedfox.com` registered,
  handles reserved on all five platforms, and a single role account
  (`markedfox.usa@gmail.com`) established as the owner of every service so the whole
  stack transfers in one handover.
- **2026-08-13** — Initial scaffold built and verified (see
  `sessions/2026-08-12-scaffold.md`): Next.js 16.3 + TypeScript + Tailwind v4,
  hand-authored with exact pins; `src/` layout with `src/proxy.ts` (Next 16
  renamed middleware); Supabase wiring (browser/server/service-role clients +
  session-refresh proxy); fail-loud AES-256-GCM token crypto; the full 9-table
  migration with RLS on every table, signup trigger, and plan seeds;
  `canUserDo` as a pure function over an entitlement snapshot; `lib/platforms/`
  registry with Instagram stubbed. Build/typecheck/lint/31 tests green with
  zero env vars. Single-owner workspaces for now (multi-seat = future
  `workspace_members` migration); all limits in `plans.limits` jsonb with
  `null` = unlimited; **placeholder caps pending owner sign-off** — Free 200 DM
  sends/mo + 60 video min/mo, Pro 10,000 DM sends/mo + 600 video min/mo.
  Hosted Supabase project created by owner, CLI installed; migration push +
  RLS smoke test awaits credentials. Native reversed from "post-100 rebuild"
  to committed-but-after-web-launch; D-U-N-S filing added to Phase 0.
  `sessions/` log convention adopted (rule 7).
- **2026-08-13 (later)** — Migration applied to the hosted project
  (`pktdpxpafycyqiusvyhq`, ca-central-1) via `supabase db push`; RLS smoke
  test passed 22/22 (`scripts/rls-smoke.mjs`): signup trigger, cross-tenant
  isolation on all 8 tenant tables, subscriptions write-locked to service
  role, usage undeletable, plans uneditable, cascade cleanup. `.env.local`
  written from CLI-fetched keys plus a generated `TOKEN_ENCRYPTION_KEY`; dev
  server runs session refresh with no warnings. **Studio reversed to public
  from launch** (owner: research is built alongside the publisher and DM
  engine since they share the same APIs, sequenced after them; only
  Enterprise stays hidden) — pillar 3 moved from v2 back into the launch
  cycle, pricing rule 5 rewritten. Open: the Supabase project sits in the
  personal default org "Yousef almuwallad", not a dedicated MarkedFox org —
  transfer via dashboard before launch (asset-separation rule).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
