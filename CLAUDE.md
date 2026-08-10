# MarkedFox — project brief

**Product name:** MarkedFox · **Domain:** `markedfox.com` · **Repo:** `markedfox`
(working title of the old personal app was "Content OS" — that name is retired)

> **Copy this file into the new project folder and rename it `CLAUDE.md`.** It is
> the complete, self-contained context for this build. Memory in Claude Code is
> keyed to the filesystem path, so a new folder starts with empty memory — this
> file is the durable context and nothing outside it should be assumed.

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
and scripts) — is deliberately deferred to v2, after there are paying customers.

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
      (Supabase, Hetzner, Cloudflare, GitHub). Deliberately not a personal address,
      so the whole stack transfers with one handover if the product is sold.
- [x] Meta developer account created
- [x] TikTok developer account created under MarkedFox
- [ ] **2FA on `markedfox.usa@gmail.com`**, recovery codes stored offline, recovery
      email and phone set. That inbox controls the Meta app and its Business
      Verification — losing it means losing weeks of approval progress with no
      appeal path.
- [ ] Confirm the Meta app sits inside a **Business portfolio** at
      `business.facebook.com` — verification attaches to the portfolio, not the app
- [ ] Resolve the duplicate TikTok app: a pre-existing personal one and the new
      MarkedFox one both exist. Keep the MarkedFox one unless the old app has a
      completed Content Posting API audit worth preserving.
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
- [ ] Provision Supabase, Cloudflare R2, Hetzner, GitHub repo, AI key

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
- **Hetzner VPS** — the only host. Caddy for auto-TLS, `systemd` units for the app
  and timers for the scheduler.
- **Cloudflare R2** — media, deleted after publish. Zero egress fees.
- **No Vercel.** Rollback is Hetzner snapshots plus a standby box that costs
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
  account, TikTok developer account, Supabase, Hetzner, Cloudflare, GitHub, and the
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
- **TikTok developer app stays where it is.** Already on the correct account, and
  no transfer path exists at TikTok. Only the redirect URI changes.
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
- **PWA now, native apps later.** Native belongs to the post-100 rebuild, along
  with the 15–30% in-app-purchase tax.

---

## Pricing

| | **Free** | **Pro $20/mo** | **Studio $49/mo** *(v2)* | **Enterprise** |
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
5. **Studio $49 does not launch.** Until pillar 3 exists it would be identical to
   Pro. It publishes the day research ships.
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
5. **Hetzner snapshots are the rollback** — taken before every deploy, restore
   verified once before launch.
6. **`npm run build` must be green before every commit.**

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
key and secret. Provision Supabase, Cloudflare R2, Hetzner, GitHub, and an AI key.

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
| Hetzner VPS while building | **~$5/month** |
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
   Cloudflare R2 account ID, access key, secret, and bucket; Hetzner IP with an SSH
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
  toggle" decision in favour of plan gating. Vercel dropped entirely — Hetzner
  snapshots are the rollback. Phases reordered around the fact that approvals
  require finished features, so the DM engine moved ahead of burst work and a
  dedicated filing-package phase was added. Entity settled: use the existing family
  LLC now, form a dedicated one only past 10–20 paying users. Stripe chosen over
  PayPal, Wise, and Whop. Platform pre-approval behaviour verified for TikTok,
  YouTube, X, and Meta. Product named **MarkedFox**, `markedfox.com` registered,
  handles reserved on all five platforms, and a single role account
  (`markedfox.usa@gmail.com`) established as the owner of every service so the whole
  stack transfers in one handover.
