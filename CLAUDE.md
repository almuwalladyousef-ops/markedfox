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
- [x] **MarkedFox Business portfolio exists** (`business_id 1350181790431899`),
      audited 2026-08-13. Sole admin is the Facebook profile "Mark Snow" on the
      role account.
- [ ] **UNBLOCK THE META DEVELOPER ACCOUNT FIRST — everything at Meta is stuck
      behind it.** As of 2026-08-13 `developers.facebook.com` refuses all
      access with *"Account confirmation needed — We've noticed unusual
      activity on this developer account. Please complete the confirmation
      steps to regain access."* and a **Confirm Account** button. The page
      title is literally "Developer Platform Blocked User Error". No app can be
      created, and therefore Business Verification cannot be unblocked either,
      until the owner completes Meta's identity confirmation.
      Likely trigger: the account is days old and was signed into from an
      automated browser during the 2026-08-13 session, on top of several new
      sign-ins the same week. **Do Meta work from the owner's normal browser
      from now on** — a fresh developer account is exactly the profile Meta
      flags, and the app that carries Business Verification is not worth
      risking to save a few clicks.
- [x] **Meta app created 2026-08-13** — `MarkedFox`, App ID
      `2137342313486061`, `dev_mode`, compliant, no App Review submission yet.
      `META_APP_ID` is in `.env.local`; `META_APP_SECRET` still needs pasting
      from Settings → Basic.
- [ ] **Verify the app's contact email** — `contact_email_verified` is false.
- [ ] **Add products and request permissions** — `privileges` is empty, so
      nothing has been requested yet. Instagram Graph API and Facebook Login
      first.
- [ ] **Add a second admin to the Business portfolio.** Meta's own Security
      Center flags it: one admin means one lockout away from losing the
      portfolio that Business Verification and every Instagram permission
      attach to. There is no appeal path. A second admin on an account the
      owner also controls is enough.
- [ ] Note: the portfolio currently shows *"You can't use this business
      portfolio to advertise."* MarkedFox does not buy ads, so this is likely
      harmless, but confirm it is an ads-only restriction and not a wider
      portfolio limitation before filing anything that depends on the portfolio
      being in good standing.
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
- [ ] **File Meta Business Verification — now unblocked and the longest pole.**
      The app exists as of 2026-08-13 and Meta reports
      `business_verification_passes: false` against it, so this is finally
      actionable. Needs the Certificate of Formation, EIN letter, and proof of
      business address, with the address matching the documents exactly.
- [ ] **File for a D-U-N-S number** for the LLC (free, weeks of latency) —
      required for Apple Developer organization enrollment when the native apps
      come. **This is now the only genuinely file-it-in-week-one item left**,
      since Business Verification turned out to be gated. Blocked on one input
      that is recorded nowhere in this repo: the LLC's exact legal name.
- [x] Provision Supabase (hosted project created 2026-08-12; CLI installed;
      stays in the personal default org by owner decision 2026-08-13 — an empty
      MarkedFox org exists as the exit-time transfer destination)
- [ ] **Create the DigitalOcean droplet** — `tor1`, `s-1vcpu-2gb`, Ubuntu 24.04,
      SSH key auth, on an account owned by the role account. The entire server
      layer is already written and waiting in `deploy/`; this one click unblocks
      all of Phase 1.
- [ ] Provision Cloudflare R2 and an AI key (GitHub repo exists)

An older personal single-user app lives at GitHub remote
`almuwalladyousef-ops/Content-Os`. It is **reference only** and is not being
ported. Note that the local checkout the brief used to point at,
`/Volumes/Yousef Disk/Content-Os`, **no longer exists on disk** (verified
2026-08-13) — clone from the remote if any of the commits below are needed.
Three commits in it are worth reading if the equivalent problem comes up
again:

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
- **A single VPS** — the only host. **DigitalOcean `tor1` (Toronto),
  `s-1vcpu-2gb`, $12/month** (owner decision 2026-08-13, replacing Hetzner,
  which refused the signup). The region is chosen for **database** latency:
  Supabase is in `ca-central-1` (Toronto) and that region is fixed, so a
  European box would cross the Atlantic on every query. Nothing in North
  America matches Hetzner's price, so the build cost roughly doubles; 2GB is
  viable only because Postgres is external. See `deploy/README.md` for the
  runbook. Caddy for auto-TLS, `systemd` units for the app and timers for the
  scheduler.
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
- ~~Meta Business Verification needs only the legal entity, which already exists.
  It can be filed in week one and it is the longest pole in the plan.~~
  **Wrong — corrected 2026-08-13 by reading the live portfolio.** The MarkedFox
  Business portfolio's Security Center says verbatim: *"Verification for
  MarkedFox — Your organization does not need to be verified."* There is no
  Start Verification control to press. Meta gates the flow behind a portfolio
  that actually holds an app requesting permissions which require verification;
  an empty portfolio has nothing to verify. So Business Verification **cannot be
  filed in week one against a bare entity**. The order is: create the app inside
  the portfolio, request the permissions, and the verification requirement then
  appears. **Confirmed 2026-08-13** once the app existed: the Developer Tools
  MCP reports `business_verification_passes: false` for App ID
  `2137342313486061`, so Meta now tracks verification as a named requirement
  where the empty portfolio had offered nothing at all.

This removes the one lever the plan claimed to have over the schedule. Filing
early is still right, but "early" now means *as soon as the app exists and
requests permissions*, not week one — and that pulls app creation onto the
critical path ahead of everything else at Meta.

Meanwhile the job queue, burst survival, payments, onboarding, and the PWA need no
approvals at all. Those are exactly what gets built during the review wait.

```
entity (exists) ─> portfolio (exists) ─> APP + permission requests ─┐
                                                                   │
                             Business Verification unlocks (weeks) ─┤
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
- **A public API and an MCP server: yes, both, and both after launch**
  (owner decision 2026-08-22). Recorded so it is not re-argued.

  *API keys are the substrate and the MCP server is one consumer of them.*
  Keys are what buy Zapier, Make, n8n, agencies scripting bulk posts, and the
  MCP server, for no per-integration work — and Buffer and ManyChat both ship
  an API, so past some size its absence is the thing people notice. They have
  a permanent cost: hashed at rest and never retrievable after creation,
  scoped, revocable, audited per key, and rate-limited separately from the UI
  because a key is a loop rather than a person. Every keyed route runs
  `canUserDo` server-side, which the publish path already does.

  Note that native does **not** need this. Supabase has native SDKs, so the
  iOS and Android apps hold a session the way the web does. Keys stand on
  their own merits.

  *The MCP server is a thin wrapper over that same HTTP API and never its own
  engine* — the moment it grows logic of its own it is a fourth pillar with
  its own bugs. Its honest value is "post this everywhere" and "turn this
  outlier into a script" from a chat client. The DM engine, which is the
  actual differentiator, is not something anybody drives from a chat window.

  **Trigger:** first paying customers, or the first customer who asks.
  Approvals are the launch schedule and none of this touches them.

  **One fork to decide then, not now:** a *local* MCP (an npx package, the
  user pastes a key) is a weekend; a *remote* one at `markedfox.com/mcp` needs
  OAuth 2.1 and makes MarkedFox an OAuth provider, guarding other people's
  encrypted platform tokens. Start local; go remote only if people use it.
- **The owner's own MCP is a separate, much smaller thing** (owner decision
  2026-08-22), and it comes **after the data is verified against real
  connected accounts** — an MCP over numbers nobody has checked only launders
  wrong numbers into a chat window at speed.

  It is single-user and local, so almost none of the cost above applies: no
  OAuth provider, no key-management UI, no rate limiting for strangers, no
  consent screens. One `.mcp.json` entry pointing at a local process holding
  the owner's own credentials. It is a tool for running MarkedFox, not a
  product surface, and it must not be confused with the customer-facing one
  above or it will drag that one's requirements along with it.

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
| **VPS** | Yes, but only cleanly if started right | Moving a server between provider accounts is a snapshot-and-restore or a support ticket, not a setting | Create the **DigitalOcean account under the role account**, not a personal login. Region `tor1`, size `s-1vcpu-2gb`. Hetzner was preferred on price but refused the owner's signup, and was in any case the wrong region for a `ca-central-1` database. Weekly backups stay off — the rollback is an on-demand snapshot before each deploy, which `deploy/deploy.sh` takes |
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

| | **Free** | **Starter $8/mo** | **Pro $20/mo** | **Studio $49/mo** | **Enterprise** |
|---|---|---|---|---|---|
| **Workspaces** | 1 | 2 | 5 | 10 | Unlimited |
| **Accounts per workspace** | 3 | Unlimited | Unlimited | Unlimited | Unlimited |
| Posts *(pooled)* | 2/day | Unlimited | Unlimited | Unlimited | Unlimited |
| Drafts | ✗ | Text only | ✓ | ✓ | ✓ |
| Scheduling | ✗ | ✗ | ✓ | ✓ | ✓ |
| Video upload | 1GB short · 256GB long | 1GB short · 256GB long | 1GB short · 256GB long | 1GB short · 256GB long | Raised |
| Platforms | All except X | All except X | All | All | All |
| X *(pooled)* | ✗ | ✗ | 300/mo, no external links | 400/mo, no external links | Raised |
| DM rules *(pooled)* | 1 | Unlimited | Unlimited | Unlimited | Raised |
| DM sends *(pooled)* | 200/mo | 5,000/mo | 10,000/mo | 15,000/mo | Raised |
| Research credits *(pooled)* | ✗ | ✗ | ✗ | Credit allowance | Raised |
| Funnels *(post-launch)* | ✗ | ✗ | ✓ | ✓ | ✓ |

**Drafts are a ladder, not a feature everyone has (owner decision,
2026-09-07)** — `none` on Free, `text` on Starter, `any` on Pro and above. The
two halves of a draft cost different amounts: media sits in R2 until the post
goes out or the draft is deleted, which is the same open-ended storage that
made scheduling paid, while a caption is a few hundred bytes. One string rather
than two booleans, because two flags can contradict each other and a ladder
cannot. A missing key reads as `any`, exactly as `scheduling` defaults to true.

**The plan cards state their limits and never justify them (owner decision,
2026-09-07).** Every line used to carry its reason — why X is capped, why a
scheduled video waits in storage — and the pricing page had a whole "Why is X
different?" panel. Those are our costs, argued at somebody who has not
objected, on the screen where they decide whether to pay. The number is the
promise; the reason is our business. Pricing rule 1 still binds: the X cap is
stated wherever "unlimited" appears. The cap, not the excuse.

**Starter $8 is the entry paid tier (owner decision 2026-09-03).** Its shape is
one rule: it may contain nothing that costs us money or load. Posting is $0 per
post on every platform it includes, so unlimited posting is genuinely free to
give. Everything metered is excluded — X (bills per post), research credits
(AI spend), and scheduling (media parked in R2 until the tick fires). That last
exclusion is also what stops Starter eating Pro: scheduling is the feature
people actually buy a posting tool for, so the ladder holds.

**The model, settled 2026-08-16 (owner). Two scopes, and the split is the whole
design:**

- **Per workspace — connected accounts.** Free gets three *in each workspace*,
  so a Free user with two workspaces may connect six accounts in total. This is
  the natural unit: a workspace is one brand or client, and its accounts belong
  to it.
- **Pooled across every workspace — posts, DM sends, DM rules, X posts, video
  minutes, research credits.** One budget per account, spent from whichever
  workspace the user likes. Pooling is not a nicety: Meta rate-limits per app
  rather than per user, and the Studio tier's credits are real API spend, so a
  user must never be able to multiply an allowance by creating workspaces.

Enforced by scope in `snapshot.ts`: pooled figures filter on `user_id`,
the per-workspace figure on `workspace_id`. Proven on live rows — three
accounts in each of two workspaces, while posts from both count against one
total.

**Nothing is ever shown as "Locked".** Every platform renders as a toggle. One
outside the plan wears a 💎 badge, and toggling it opens an upgrade prompt
naming what the plan gives. A user should see what upgrading buys, not a dead
row. The same applies to "+ New workspace" past the plan's count.

**Scheduling is a paid feature (owner decision, 2026-08-25).** Free can
publish now and save drafts; it cannot set a time. The reason is a real cost
rather than packaging, which makes it the one gate here that is not arbitrary:
a scheduled post's media is uploaded when the button is pressed and then sits
in R2 until the tick fires, which may be weeks. Media is transient by design in
this product, and a free account parking storage indefinitely is the single way
that stops being true. For the same reason **no plan may schedule a video over
5GB** — publishing one now is unaffected at any size the platform will take.

**Upload ceilings are per kind of post, not per plan.** A short video or story
is 1GB; a long video is 256GB, which is YouTube's own ceiling. Above 4GB the
browser uploads in parts, because R2 refuses a single PUT over 5GiB.

**X is the permanent exception to "unlimited".** Every other platform costs $0
per post; X bills $0.015, or $0.20 with a link. So it is excluded from Free
outright and carries a hard monthly number on every paid plan. **That has to be
stated wherever the word "unlimited" appears** — the dashboard says it on the X
tile, and the pricing page must say it in the plan comparison rather than in
fine print.

**Annual billing at roughly two months free.** The audience is hot for about one
week — annual converts that week into cash upfront instead of monthly churn risk.

**Pricing rules:**

1. **"Unlimited" only for what is free to serve.** Instagram, TikTok, YouTube,
   Facebook, Threads, LinkedIn, and Pinterest cost nothing per post. X, AI calls,
   transcription minutes, and storage are metered upstream and always carry a hard
   number — and that limit is stated wherever the word "unlimited" appears, not
   buried.
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
8. **Every code change ends deployed** (owner standing instruction,
   2026-08-22). Work is not finished on a branch; it is finished on
   `markedfox.com`. Do not stop to ask — merge to `main`, push, and deploy.

   The full sequence, every time:

   ```
   npm run build && npx tsc --noEmit && npx eslint src && npx vitest run
   git checkout main && git merge <branch> && git push
   supabase db push --linked          # only if there are new migrations
   ssh deploy@markedfox.com 'sudo bash /srv/markedfox/current/deploy/deploy.sh'
   curl -sS -o /dev/null -w '%{http_code}' https://markedfox.com/
   ```

   Four things that are not optional:

   - **Green first.** Rule 6 already gates the commit; this gates the deploy.
     A red build deploys nothing, because `deploy.sh` builds on the box and
     leaves the old release running if it fails.
   - **Migrations before code.** Push the migration first and write it so the
     currently-running code survives it — added nullable columns, never a
     rename or a drop in the same release. The old release really does keep
     serving while the new one builds, as of 2026-08-29: `deploy.sh` builds in
     a second tree at `/srv/markedfox/build` and swaps the finished `.next` in
     with the service stopped. Before that it built in place and every request
     during the build came back 500.
   - **`deploy@`, never `root@`.** Root login is off by design and one failed
     root attempt bans the whole IP through fail2ban for about fifteen
     minutes, locking out the owner's machine too.
   - **Never `--skip-snapshot`.** The DigitalOcean snapshot `deploy.sh` takes
     is the entire rollback story (rule 5).

   The one exception: a change that touches only `sessions/`, `handoff/` or
   `CLAUDE.md` still gets committed and pushed, but needs no deploy — nothing
   the server runs has changed, and a rebuild-and-restart for a markdown file
   is a minute of downtime risk for nothing.

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

Also the security pass, because this is the last gate before strangers hand the
product OAuth access to their own accounts. Run `/security-review` on the branch,
then a pentest sweep with **Strix** (`github.com/usestrix/strix`, Apache 2.0 — an
autonomous AI pentester: Docker plus our own LLM key, no account or service
signup). Rules for that run, decided 2026-08-21:

- **Install it at Phase 7, not before.** The tool changes fast and the installer is
  a `curl … | bash`, so it is read (`curl -sSL https://strix.ai/install | less`)
  and run at the moment it is used, never saved for later.
- **Point it at a local checkout, never at `markedfox.com`.** Production is a
  1 vCPU / 2GB box holding other users' encrypted OAuth tokens, and a scan against
  it would trip fail2ban and Cloudflare besides.
- **Scope it to the routes that carry the real surface:** the OAuth connect and
  callback handlers, the Stripe webhook, the Meta webhook signature check, the
  `/r/<token>` tracked-link redirect (open redirect), and the server-side media
  fetches (SSRF).
- **It does not replace `scripts/rls-smoke.mjs`.** Cross-tenant isolation is
  proven deterministically by that smoke plus RLS in the database; a generic
  scanner reasons about row ownership badly and its silence is not evidence.

**Exit:** approvals granted for every platform shipping at launch; any unapproved
platform fully removed; `/security-review` clean and the Strix run triaged, with
every finding either fixed or written down with the reason it was dismissed.

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
| VPS while building | **~$12–15/month** — DigitalOcean `s-1vcpu-2gb` in `tor1` at $12, plus a few dollars of on-demand snapshots at $0.06/GiB. Revised up from the original ~$6 Hetzner estimate: Hetzner refused the signup and was the wrong region for a `ca-central-1` database, and nothing in North America matches its pricing |
| Supabase, R2, transactional email, uptime monitoring, GitHub | **$0** — free tiers |
| AI keys while testing | ~$0–5/month, pay-per-use |
| **Total to build** | **$12 once plus ~$12–20/month** (revised 2026-08-13 from ~$5/month when the VPS moved to DigitalOcean Toronto) |
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
- **2026-08-14 → 08-16** — Phase 1 closed (all five exit criteria verified,
  see `sessions/2026-08-15-phase1-live.md`, `2026-08-16-workspaces-facebook-
  threads.md`): DigitalOcean Toronto droplet, Caddy TLS on `markedfox.com`,
  auth surface, connections layer with a real Instagram adapter, Facebook and
  Threads adapters, workspaces as a plan limit, pricing rewritten to
  per-workspace accounts + pooled usage. Meta deauthorize/data-deletion
  callbacks live. Open at the end of 08-16: the owner's own browser would not
  navigate on the Facebook/Threads toggles although both flows verified clean
  from a fresh session (`handoff/2026-08-16-owner-tasks.md`).
- **2026-08-16 (Phase 3 — publisher built, live, and proven on real
  accounts)**. See `sessions/2026-08-16-phase3-publish.md` for detail.

  *Publish layer.* One path for "now" and "scheduled": `POST /api/posts` →
  `createPost()` refuses bad targets, plan denials, missing adapters, and
  invalid content *before any row exists*; `publishPost()` (pure orchestrator,
  injectable store) publishes per target, writes one `history` row per platform
  attempt, one `post_publish` usage row per post that went anywhere plus one
  `x_post` per X account, and settles `published`/`partial`/`failed` with a
  per-platform `last_error`. Each adapter declares `rules` (caption limit,
  media caps, mixing, hashtags) beside `capabilities`; `validateContent()` runs
  the same numbers in the composer and the API, so the UI can never be more
  permissive. `containsExternalLink()` computes the X URL guard server-side.
  Composer at `/dashboard/compose`, outcomes and cancel at `/dashboard/posts`.

  *Scheduler.* The systemd timer's script is now a thin HTTP trigger of
  `POST /api/internal/scheduler/tick` (bearer `SCHEDULER_SECRET`, fail-closed;
  Caddy 404s `/api/internal/*` publicly) because the adapters are TypeScript
  inside the app. The tick also renews expiring tokens and purges spent media.

  *Meta configuration, all owner-fixed this day.* Facebook needed
  `pages_manage_posts` added to the app; Threads needed a **Threads Tester**
  invite accepted on threads.com, because an unpublished app lets only testers
  authorize. The "toggles do not work in my browser" symptom was neither: the
  callback only read Meta's `error` parameter and not `error_code`/
  `error_message`, so a refusal fell through to the state check and reported
  `bad_state`. It now reads both, before the state check.

  *First real posts.* Instagram (`instagram.com/reel/DcHDcalAYEt`), Facebook,
  and Threads have all published from the composer, including a video uploaded
  through R2. The first attempt was a `partial` — Instagram timed out — which
  incidentally proved the "partial failure names precisely what failed"
  criterion on live data.

  *Media.* Uploads go from the browser **straight to R2** on a presigned PUT;
  bytes never cross the droplet, which matters on 1 vCPU / 2GB. SigV4 is
  hand-rolled and verified against AWS's own published test vector. Bucket
  `markedfox-media`, public reads via the r2.dev subdomain, CORS set by API.
  Storage cleans itself on the tick: media is deleted when its post is done
  (at once for published/canceled, after 24h for partial/failed, never for
  scheduled), objects are retained while any unpurged post still references
  them, and **uploads that were never posted are collected after 48h** —
  that orphan case was found on live data holding 109MB.

  *Token lifetime.* Instagram and Facebook store Page tokens, which never
  expire; Threads stores a 60-day user token and there is no permanent
  variant. The tick renews anything inside 7 days of expiry, so Threads never
  lapses. Measured: Meta accepts a refresh of a token under 24h old but
  returns the ORIGINAL expiry — a silent no-op.

  *Bugs found and fixed on live data*, each recorded in the session log:
  refresh failures marked healthy connections `expired` (now only a dead grant
  does); `deploy/sync-env.sh` matched key names as `[A-Z_]+` and silently
  skipped every `R2_*` variable; Instagram's 60s container poll sat on top of a
  measured 32s typical case (video now 300s with backoff, since Meta rate-
  limits per app); Threads published anyway when its container never finished.

  *Verified:* 175 unit tests, `scripts/publish-smoke.mjs` 28/28 live through a
  running app, the R2 path proven end to end on production, and real posts on
  all three platforms. Deployed `13903c4`.

  **Phase 3 is NOT closed.** Built and proven: Instagram, Facebook, Threads.
  Still open, all blocked on owner action rather than code: **X** (needs a
  developer account and keys — no review, pay-per-use, the cheapest next
  adapter), **TikTok** (app must be created, then audited), **YouTube** (audit;
  unverified projects have every upload locked to private with no appeal).
  LinkedIn and Pinterest remain post-launch by design.

  *Open risk, owner-deferred:* Gmail blocked `markedfox.usa@gmail.com` on
  2026-08-16 and it took an appeal to restore. That inbox owns the Meta app,
  Business Verification, TikTok, Supabase, the VPS, Cloudflare, GitHub, and the
  R2 keys, and still has 2FA off with no recovery phone. Owner has chosen to
  handle it later.

- **2026-08-19 (Phase 4 built, then pillar 3 built).** See
  `sessions/2026-08-19-markedfox-session.md` and
  `sessions/2026-08-19-research.md`.

  *Four adapters and the marketing site* (`198d1b3`): X, TikTok, YouTube,
  Snapchat; landing, `/pricing`, `/privacy`, `/terms`, four-column footer.
  Each adapter declares `requiredEnv`, so a platform without keys renders
  "Coming soon" rather than failing.

  *An adversarial multi-agent review, and everything it confirmed* (`f661c75`):
  YouTube's 60s `AbortSignal` was killing every upload longer than a minute;
  X and Snapchat token endpoints returned dead grants as HTTP 400 that we
  classified as retryable, so a dead connection stayed "active" forever;
  refresh-token rotation could redeem a single-use token twice under concurrent
  publishes; Snapchat buffered whole videos two to three times in a 2GB box;
  server-side media fetches had no SSRF guard; TikTok's `mediaMax` of 35
  exceeded the composer's own cap of 20. **And the privacy policy promised
  three things the product did not do** — so disconnect, working Meta
  deauthorize/data-deletion callbacks, and self-serve account deletion were
  built rather than the copy softened. They were Meta App Review requirements
  anyway.

  *TikTok Direct Post audit UX* (`7b33648`): privacy selector with no default,
  interaction toggles gated by live `creator_info`, commercial-content
  disclosure, and the consent line TikTok's guidelines require. Options ride
  `platform_overrides[platform].options` — no new column.

  *Phase 4 — the DM and comment automation engine* (`3704dc2`): webhook →
  rules → queue → send. Signature-verified Meta webhooks deduplicated by the
  platform's own event id; a matcher (keywords, per-post targeting, never the
  account's own activity); a Postgres queue claimed with `FOR UPDATE SKIP
  LOCKED`; a worker enforcing Meta's 24-hour window and the plan's send cap
  **before** sending; tracked `/r/<token>` links; per-rule analytics through a
  `SECURITY INVOKER` function so RLS scopes them. Tenant isolation is the
  account→connection lookup itself. Deployed and proven: `dm-smoke` 26/26
  against production.

  *Pillar 3 — research and scripting* (`f62c72d`): watch a channel, score every
  video against **that channel's own recent median**, generate hooks/outline/
  script from the winners. Median not mean, a 20-video recent window, a 48-hour
  maturity gate, and `null` rather than a confident wrong number — the small
  channel's 30k breakout ranks above the big channel's ordinary 2.2M day, which
  is the whole point and is an explicit test. Providers state their real limits:
  YouTube reads any channel with a plain API key (separate from the publishing
  OAuth client, so research works before the upload audit); Instagram reads any
  public business account through a connection, with likes carrying the baseline
  because business discovery hides views; **TikTok can only read the connected
  account's own videos — its Research API is academic-only, and the UI says so
  with the alternative**; X works but bills per read; Snapchat has no content
  API and is absent from the registry. Gated by `use_research` and
  `spend_research_credits`; credits are `ai_call` usage rows recorded only after
  the model answers. 342 tests; `research-smoke` 19/19 on live rows including
  RLS in both directions.

  *Phase 6 begins — burst survival* (`f5e3abf`): the two things that turn
  launch day into an outage rather than a busy afternoon. **The shared
  rate-limit budget**, because Meta and TikTok limit per *app*, not per user —
  every customer including free ones spends one allowance, so a burst can
  throttle the whole product and the failure lands on people who did nothing.
  Permission is asked before spending, through a Postgres function whose
  increment-and-check is atomic (proven: twenty simultaneous requests against a
  budget of five let exactly five through), and a real 429 is recorded so every
  other worker stops. Crucially, a post refused by **our own** budget goes back
  to the queue with a retry time rather than to the user as a failure —
  otherwise burst protection reads as data loss. "Post now" is unmetered: the
  user is watching and should get the platform's own answer. **And a real queue
  claim**: `FOR UPDATE SKIP LOCKED` plus a 15-minute lease, so a worker killed
  mid-publish no longer strands its post in `publishing` forever (a deploy
  restart used to do exactly that). The lease is generous on purpose —
  reclaiming a post that is still publishing would post it twice, which is worse
  than posting it late. 367 tests; `burst-smoke` 22/22 on live Postgres.

  **Deployed and live: `f5e3abf`.** Production smokes: dm 26/26, research 19/19,
  burst 22/22, publish 13/15 (the two are the smoke reaching `/api/internal/*`,
  which Caddy 404s publicly by design).

  **Still owner-blocked:** Meta webhook configuration (three dashboard steps,
  and the screencast it unlocks is what Phase 5 is waiting for),
  X/TikTok/YouTube/Snapchat credentials, a YouTube Data API key and an AI key
  for research, Cloudflare Email Routing, and the role account's 2FA.

- **2026-08-20 — research completed to the full engine, then Stripe.**

  *Research, part two* (`70a8fde`, `708fc81`, see
  `sessions/2026-08-19-research.md`): the owner supplied a detailed
  Sandcastles breakdown that showed step 3 — deconstructing WHY a video
  worked — was missing, and it is the step the pillar exists for. Built: the
  **breakdown** (hook quoted verbatim, ten named hook patterns, curiosity
  loop, beats, format, takeaway; the parser forgives fenced/prefaced/
  string-beat answers because a correct answer in the wrong shape still cost
  a credit). Generation now feeds on the breakdown and **never sees the
  original wording** — a remix by construction. **"Validated outlier" means
  something**: tiers under/normal/strong/outlier/validated, where validated
  requires >10x AND a ≥10-video baseline. Plus **projects** (5-stage
  pipeline), a standalone **hook generator**, a **transcript downloader**
  (any YouTube link, free), and a **channel audit** (a channel judged only
  against its own history). Tracking became a tier: Studio 150 channels at
  12h refresh, Enterprise unlimited at 1h, enforced per owner in the sweep.
  409 tests; research-smoke 30/30 on live rows.

  *Stripe* (`147f5a5`, see `sessions/2026-08-20-billing.md`): the Phase 2
  rule made real — the processor's only job is writing to `subscriptions`
  via webhook. Thin fetch client, no SDK; signature verification pure and
  tested (timestamp window, HMAC over `timestamp.body`, timing-safe).
  Only `customer.subscription.*` events move entitlements; replays dedupe on
  Stripe's event id; out-of-order events cannot roll a subscription
  backwards (`last_event_at` gate inside the UPDATE filter); unknown
  statuses map to `canceled` — less access is always the safe wrong answer;
  an active subscription on an unknown plan fails loudly while a dying one
  still gets its downgrade. Checkout and portal are Stripe-hosted; price ids
  are `plans` table columns, so repricing is a row edit. **Failed payment →
  Free limits proven on live rows.** 437 tests; billing-smoke 16/16 against
  production with self-signed events.

  **Deployed and live: `147f5a5`.** Production smokes: billing 16/16,
  dm 26/26, research 30/30, burst 22/22.

  **Owner: 5 Stripe dashboard steps turn payments on** (secret key, four
  price ids into the plans rows, webhook endpoint + real `whsec_`,
  statement descriptor MARKEDFOX) — listed in the session log. The
  `STRIPE_WEBHOOK_SECRET` deployed today is a generated placeholder.

  **Phase 6 still to do:** onboarding, data export, the PWA, health checks
  and alerts that reach a phone, cost tracking for X and AI. None can take
  the box down.

- **2026-08-20 → 08-21 — the three pillars get their surfaces.** See
  `sessions/2026-08-20-studio-surfaces.md` and
  `handoff/2026-08-21-markedfox-handoff.md`.

  The owner supplied 68 screenshots of Crosspost, ManyChat and Sandcastles
  plus a demo transcript, and asked for each section to have its reference
  product's features. All three engines already worked and were proven on
  live data; what did not exist was the surface a person works in.

  *A shared shell.* There was no `dashboard/layout.tsx` — every page drew its
  own header and back-link, and the styling had drifted into two dialects
  with the on/off toggle written from scratch three times. One sidebar
  (Publish / Automate / Research / Create / Setup), one vocabulary in
  `src/components/ui.tsx`.

  *Research.* Feed with every filter in the URL and applied by Postgres;
  Channels page with four discovery modes; five-tab analysis with keyboard
  actions; idea inbox with arrow-key triage; hook vault; five-stage script
  pipeline; auto-analyze rules; persona. The breakdown gained the half it was
  missing — the IDEA (topic, seed, angle, the belief it overturns), separate
  from the execution, because copying someone's structure while keeping their
  idea is plagiarism and the reverse is a different video.

  *Automations.* The builder is a sentence with a live phone preview of what
  actually arrives. Eight templates. LIVE/STOPPED list with Runs / Sends /
  Clicks / CTR / Emails. New engine behaviour: follow-ups that skip anyone who
  already clicked, and email capture.

  *Publisher.* Per-platform settings declared as data in
  `lib/platforms/publish-options.ts` and applied by the adapters (YouTube
  visibility/title/description/tags/#shorts/COPPA, X and Threads reply
  control, Instagram share-to-feed); drafts; month/week/day calendar;
  per-platform preview. Plus first-run onboarding.

  *Two adversarial reviews found 24 real bugs; all fixed.* The four that
  mattered: channel discovery could burn 8,000 of the 10,000 daily YouTube
  quota units in one click, and the hallucination filter it paid for checked
  nothing because `search.list` returns a nearest match for any string;
  research credits were check-then-act; publishing a reopened draft left the
  draft behind so it could post twice; selecting several files posted the same
  one N times.

  *Two rules now pinned by tests.* Nothing is ever a "Locked" or "Coming soon"
  label — plan-locked, cap-blocked and unconfigured all render as live
  controls that explain themselves. And anything metered reserves before it
  spends and releases on failure, so "no credit was used" is always true.

  **Deployed and live: `05e40a1`.** Four migrations applied. 530 tests;
  production smokes studio 41/41, dm 26/26, research 30/30, burst 22/22,
  billing 16/16, rls all-pass. **Not verified: nobody has signed in and
  clicked through the new pages.**

  **Owner-blocked, in the order that unblocks the most:** an AI key
  (`GEMINI_API_KEY` or `GROQ_API_KEY`) turns the largest thing built this
  session from a browser into a tool; `YOUTUBE_API_KEY` for research;
  X/TikTok/YouTube/Snapchat OAuth credentials; Stripe's real keys; the Meta
  webhook configuration that still gates App Review and the launch; and the
  role account's 2FA.

- **2026-08-21 — the design handoff, implemented.** See
  `sessions/2026-08-21-redesign.md`. Branch
  `claude/handoff-completion-2d2d54`, six commits, **not merged and not
  deployed**.

  A full visual redesign, supplied as a README plus 24 HTML prototypes. The
  structural half first: every colour now resolves through CSS variables
  exposed to Tailwind as `bg-panel` / `border-line` / `text-muted` and the
  rest, so **light is the default theme and dark is one attribute away**. The
  choice is written to the attribute, `localStorage` and a cookie at once, and
  the server renders `data-theme` from the cookie, so there is no flash. Two
  breakpoints of our own: `shell` at 880px, where the sidebar becomes a fixed
  bottom tab bar with Compose raised in the centre, and `wide` at 1020px,
  where the two-column research and builder layouts stack.

  Then every screen: Accounts, Compose (sticky preview aside), Calendar,
  Posts, Drafts, Automations, Templates, the rule builder, the research feed,
  Ideas, Hooks, Scripts, Channels, Persona, Auto-analyze, the analysis page,
  Projects, Settings, the marketing landing and pricing pages, and the auth
  forms. The fox mark supplied by the owner replaces the placeholder SVG
  everywhere it appeared.

  *One deliberate departure from the handoff.* It asked for a "Coming soon"
  pill on platforms this deployment has no keys for; that stays a live toggle
  that explains itself, because the house rule against dead labels is pinned
  by `every-platform-shown.test.ts`. Unconfigured platforms wear "Setup
  needed" instead, and the upgrade badge's "On Pro · 300/mo" is read from the
  `plans` table rather than written into the page.

  *One piece of new behaviour, not a restyle:* "Edit time" on a scheduled
  post, a server action scoped exactly like cancel, so a post the tick has
  already claimed cannot have its time rewritten underneath it.

  **The open item from 2026-08-20 is closed:** the pages have now been signed
  into and clicked through, in light and dark, at 1280px and 375px, using a
  throwaway `auth-smoke-*` user with seeded rows (deleted afterwards, cascade
  confirmed). That found and fixed two layout bugs — the sidebar footer pushed
  off the bottom by the nav column, and the mobile wordmark colliding with the
  workspace switcher. Build, lint, typecheck and 530 tests green. Screens with
  no data on a fresh account (the month grid with posts in it, the feed's
  cards, idea triage, the hook vault) were seen only in their empty states.

  **Merged, pushed and deployed the same day: `64f00b3` is live on
  markedfox.com** (snapshot taken, health check green). One operational
  lesson, recorded because it cost an hour: the deploy login is `deploy@`,
  never `root@` — root login is off by design and a single failed root attempt
  bans the whole IP through fail2ban for about fifteen minutes, locking out
  the owner's machine along with it. See `handoff/2026-08-21-redesign-live.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- **2026-08-21 (later) — the home screen, and the calendar absorbing Posts.**
  See `sessions/2026-08-21-home-and-calendar.md`.

  The app now opens on the person's own work rather than on setup.
  `/dashboard` is **Home**: the total posts, followers and following across
  every connected account, then a grid of their real posts — pulled from each
  platform, including posts never published through MarkedFox — filtered by
  platform and by All / Short videos / Photos / Text posts. The old dashboard
  moved to `/dashboard/accounts`.

  *Reading an account is one adapter file.* `PlatformAdapter` gained an
  optional `insights` capability (`readProfile`, `listMedia`, plus a declared
  `primaryMetric` and `metered` flag). Instagram, Facebook, Threads, TikTok,
  YouTube and X have one; Snapchat deliberately does not, because it has no
  API for reading an account's own posts, and the screen says so. The metric
  is declared rather than assumed: Instagram business reads carry **likes**
  (the media edge has no play counts), TikTok and YouTube carry **views**, and
  a card labelling one as the other would be a lie nobody could catch.
  TikTok's scopes grew by `user.info.profile`, `user.info.stats` and
  `video.list` — all self-serve, none part of the posting audit.

  *It is a cache, and that is the point.* Migration
  `20260821000000_account_overview.sql` adds `account_profiles` and
  `account_media` (applied to the hosted project). Meta and TikTok rate-limit
  **per app** and X bills per read, so nothing on the page calls a platform:
  the scheduler tick sweeps the five stalest accounts older than six hours and
  never touches metered ones, Refresh forces a workspace read, a separate
  button includes X with the cost said out loud, and a first load with an
  empty cache fires one throttled fill after the page paints. A failed read
  records the reason and **keeps the last good numbers** rather than blanking
  them.

  *Calendar rebuilt to the reference shape* — month/year heading, ‹ Today ›, a
  date jump, Month/Week/Day, an account avatar filter, search, and thumbnail
  cards that share a column when they overlap. **The Posts page is gone**: its
  per-platform outcomes, failure reasons, Cancel and Edit time now live in the
  detail panel on the post itself, and `/dashboard/posts` redirects to the
  calendar.

  542 tests; build, lint and typecheck green; both screens signed into and
  clicked through at 1280px and 375px in light and dark, with Cancel proven
  round-trip on live rows and the read-failure path proven not to crash.

- **2026-08-21 (later still) — the reference layout, exactly.** The owner
  supplied Crosspost screenshots of the home screen, the sidebar and the
  new-post flow and asked the app to match them.

  *Sidebar:* a floating rounded panel, and **collapsible** — client state for
  an instant toggle plus an `mf-sidebar` cookie the server reads, so the first
  paint is already the chosen width. Collapsed is a 76px icon rail. **New post
  left the nav and became the one solid button at the top**; `/dashboard/
  compose` is now `/dashboard/new-post`, with the old URL redirecting.

  *Home:* overlapping avatars with ‹ › walking the accounts (the carousel IS
  the platform filter, `?account=<id>`), the name with Drafts and Refresh, the
  three totals, the handle/bio/link on a single account, centred All / Short
  videos / Photos / Text posts, and a masonry grid whose tiles carry the
  platform's brand badge and its view or like count.

  *New post is two steps:* the post in a 9:16 frame on the left; on the right
  the accounts, a borderless caption field, and **Choose platforms** as
  brand-coloured app tiles labelled Reel / Short / TikTok / Thread when the
  post carries video, followed by each platform's "Share on …" settings in the
  reference's two-column shape. A sticky Save draft / Next bar; Next is the
  review step — preview, when, publish — because a publish button under a page
  of platform settings is a button nobody has read.

  542 tests; build, lint and typecheck green; clicked through at 1280px and
  375px in light and dark, including the collapsed rail, platform selection,
  the TikTok settings section, and Next landing on review.

- **2026-08-22 — the second design handoff, implemented.** See
  `sessions/2026-08-22-dashboard-redesign.md`. Branch
  `claude/handoff-completion-2d2d54`, nine commits, merged to `main`.

  A README with every measurement in it, one interactive HTML prototype, and a
  screen-to-file map. **Merged and deployed the same day: `b2991f5` is live.** The brief was "easier to read, easier to understand,
  less bulky", with a restructure rather than a polish pass.

  *Three things underneath every screen.* An **icon set** —
  `src/components/icons.tsx`, 45 paths on one 24×24 grid, replacing the text
  glyphs (`✎ ▤ ⚡ ◇ ⊕`) and the 💎, which were a font's opinion of a symbol
  rather than ours and fell back to a box on Android. **Density**, which
  turned out to be the largest part of "easier to read" and is not layout at
  all: body from a 13.5px floor to 15px, metadata 11→13px, nav labels
  13→14.5px, card padding 18→22–28px, section gaps 14→22px. And
  **`TwoPane`/`StickyPane`** — a wrapping flex row with a floor per pane, never
  a grid, because a `328px minmax(0,1fr)` track lets the content column shrink
  under its own minimum.

  > Recorded because the handoff's own numbers get it wrong: a wrapping flex
  > line breaks on **base** sizes and only then shrinks, so the bases decide
  > whether it wraps, not the floors. Every two-pane here is sized to the
  > ~920px a 1280px window leaves beside the rail.

  *The shell.* 262/92px, with the collapse toggle still visible at 92px.
  Settings moved to the rail's footer and **Connected accounts moved inside
  it** — setup somebody visits twice and then never, which was pushing the
  daily pages down.

  *Screens.* **Home's grid changes shape with the account** (Instagram a square
  grid, TikTok/YouTube 9:16 with views, Threads/X a timeline, combined the
  masonry) because one layout makes neither look like the thing it copies.
  **Calendar** gained the centred platform filter and defaults to month, whose
  cells take their height from the viewport. **New post is five steps** — kind,
  file, caption and platforms, per-platform settings, review — since the old
  single column put the publish button under a screenful of YouTube settings.
  **"+ New automation" is two stages**, template picker then builder, and the
  builder's keywords are chips. **Research** put its filter panel behind a
  toolbar toggle and gave Ideas the four analysis blocks from the breakdown.
  **Settings is a menu and thirteen panes.**

  *New behaviour, not restyling:* a real `/api/account/export` (RLS-scoped,
  tokens and caches deliberately excluded), profile picture upload to R2,
  email/name and password changes, "Remove all" channels, and **platform /
  post-type priority** — migration `20260822000000_user_profile_and_
  preferences.sql` adds `avatar_url` and a `preferences` jsonb to `users`, and
  Home reads both. The reconciler drops preferences naming something removed
  and appends anything added since, so a new platform is never invisible to
  existing users.

  *One handoff row deliberately absent:* "Join the community". There is no
  community yet, and a row pointing at nothing is the dead control this
  redesign spent its time removing.

  *Bugs found.* `buttonClass(tone, size, "border-accent …")` silently lost —
  two border-colour utilities in one class string are resolved by CSS source
  order, not by writing order — so two accent states rendered plain. A
  `render(id)` callback was crossing a Server/Client boundary. The composer's
  action bar sat under the mobile tab bar, making Publish unreachable on a
  phone. The home avatar stack overflowed 375px. The mobile tab bar lit Videos
  while on Ideas. And the data export silently omitted `usage` because its
  column list named two columns that do not exist — a skip now logs why.

  551 tests (542 + 9 for the preferences reconciler); build, lint and typecheck
  green; migration pushed. Signed in with seeded rows and clicked through in
  light and dark at 1280px and 375px: every screen above, plus the export
  endpoint's actual output. **Not verified:** anything needing a real platform
  connection or an AI key, neither of which is configured here and neither of
  which changed.

- **2026-08-25 — the composer rebuilt, and video editing in the browser.**
  See `sessions/2026-08-25-composer-rebuild.md` and
  `handoff/2026-08-25-composer-and-media-editing.md`. Seven commits, all
  merged and deployed; live at `201538a`.

  Started as "use the real platform logos" and became a rebuild of the
  new-post flow across five rounds of owner feedback with reference
  screenshots.

  *The marks.* Nine hand-drawn monochrome glyphs replaced by the owner's
  actual app icons in `public/platforms/`, each prepared to one rule: a full
  square, the mark edge to edge, **the corner radius belonging to the
  container** — an asset carrying its own corners fights whatever it is placed
  inside. The trim is a flood fill seeded from the border, which destroyed the
  Facebook mark (its `f` runs off the bottom edge, so the flood travelled up
  the stem) and is now guarded on the border actually being a surround.
  `--platform-edge`, a theme-flipping hairline, replaced a per-platform ring
  list that was wrong in one theme whichever way it was written.

  *Upload moved to the moment of commit.* Picking a file uploads nothing; the
  bytes stay in the tab and the preview is a local `blob:` URL. A post
  abandoned halfway now leaves no orphan in R2. **A scheduled post uploads
  when you press Schedule, not at the scheduled minute** — the tick runs
  server-side with no browser open, so this is the only place it can happen.

  *Trim and volume, in the browser* (`lib/media/edit.ts`, pure and tested,
  plus `ffmpeg-client.ts`). No platform API takes either, and transcoding on a
  1 vCPU droplet is the thing the media path exists to avoid. The video stream
  is **never** re-encoded — `-c:v copy` makes a trim a remux, at the cost of
  cutting on the nearest earlier keyframe, which the UI says out loud. Audio
  re-encodes only when the volume changed. An untouched clip never fetches the
  32MB core: proven byte-identical at 155,385 bytes in half a second, against
  an edited clip going 10s → 4.167s at exactly −6.0dB in three. The core is
  self-hosted (`scripts/copy-ffmpeg.mjs` on `prebuild`, gitignored) because
  ffmpeg's worker uses `importScripts`, and single-threaded because the
  multi-threaded core needs COOP/COEP, which would break every cross-origin
  image the app shows. Speed was dropped by owner decision.

  *The flow.* Five steps — kind, file, caption, settings, review — with a
  drop zone that actually accepts a drag, an autoplaying centred preview with
  Audio and Trim beside it, the accounts' own profile pictures over the
  caption, and a review step that shows the post under the platform's chrome
  rather than printing the caption back. Schedule opens a four-wheel dialog.
  **Long video** is wired; **Story** is surfaced and deliberately refuses to
  publish, naming the missing adapter work — the alternative is posting
  somebody's story to their feed. `DESTINATION` is one table keyed by kind
  that decides both the word each platform uses and whether the kind can go
  there at all.

  *Settings for every platform with an adapter.* Facebook's title and
  embeddable, and Snapchat's `locale` and `skip_save_to_profile` — the last
  two found hardcoded in the adapter's own body, which is exactly why they
  were worth offering. Instagram gained allow-comments, profile display,
  rename audio, and **Trial** on the owner's second ask, labelled honestly as
  something Instagram may ignore. **TikTok's panel was restyled with every
  audit-relevant behaviour held still**, and its tests caught a "just a
  restyle" string change that was not one.

  *Palette reversed.* The warm-paper set is gone; light is neutral near-white,
  dark is the same family inverted in value. Corners are rounder on the
  owner's call to follow Apple's proportions. Every toggle is the accent —
  there were three different switches, one green with an orange knob.

  *Seven bugs, each recorded in the session log.* The fox mark was squashed
  because an `<img>` with a fixed height is still a shrinking flex item;
  `submit` read the mode from state where two buttons set it; `icon: "name"`
  type-checked and crashed the settings step at render, and the field is typed
  now; and three separate faults in the schedule wheels — `scroll-smooth`
  swallowing direct scroll writes, `offsetTop` measured before layout, and the
  selection never following the scroll.

  567 tests, build, typecheck and lint green; trim and volume measured with
  `ffprobe` on a real clip through the real R2 path; every step clicked
  through with nine seeded connections. **Open:** the owner says the screens
  still do not match his references and the specific differences have not been
  named — ask before rebuilding again. Apple's design guidance arrived at the
  very end and is applied only as far as the corner radii.

- **2026-08-25 (later) — the motion pass.** The app was reviewed against Emil
  Kowalski's design-engineering principles and every finding fixed. See
  `sessions/2026-08-25-motion-pass.md`. Merged and deployed: live at `f3bdffb`.

  The structural half was already sound; the motion layer was missing almost
  entirely. Before this, `src/` held **zero** `:active` press states, zero
  custom easing curves, no entrance on any of the three dialogs, no
  `prefers-reduced-motion` rule, and no spinner.

  *Foundations.* Three easing curves in `globals.css`, with the strong ease-out
  installed as `--default-transition-timing-function` — which fixes every
  `transition-[…] duration-150` already written in the app without touching one
  of them. Four entrance classes built on `@starting-style` (`.mf-overlay`,
  `.mf-modal`, `.mf-sheet`, `.mf-popover`), so a React conditional render
  animates in with no mounted-flag effect. Enter-only by design: React unmounts
  on the same tick, so there is no exit frame to transition from. Nothing
  scales from `scale(0)`. A reduced-motion block that keeps colour and opacity
  and stops everything positional, with the spinner as the one exception.

  *Press feedback* in `BUTTON_BASE` and on every other control primitive, plus
  the seventeen bespoke buttons carrying `hover:brightness-[1.08]`. The
  segmented control is deliberately exempt — pressed tens of times a session,
  where motion reads as lag rather than as feedback.

  *The three dialogs* were written separately and their differences were
  accidents: one closed on Escape and two did not, three different backdrop
  opacities, and two checked the backdrop on `click` rather than `mousedown` —
  so selecting text inside a dialog and releasing outside it closed the dialog
  and took the selection with it. `src/components/overlay.tsx` now holds
  `useEscape()` and `overlayProps()` and all three use them. The calendar's
  post detail is a real bottom sheet on a phone and a centred dialog above the
  `shell` breakpoint.

  *A real tooltip* replaces the browser's `title` attribute on the icon-only
  dock: a delay on the first, **none on the next**, which is why "did another
  one just close" is module state rather than component state. Plus a spinner
  at 25 call sites that previously only swapped a label, named transition
  properties on the 56 elements using the bare `transition` utility, a
  fade-and-rise between the composer's five steps, and a capped stagger on
  Home's grid.

  *Two review findings that were wrong, recorded because they are easy to
  re-derive:* Tailwind v4 already wraps every `hover:` utility in
  `@media (hover: hover)`, and it compiles `scale-*`/`translate-*` to the
  standalone `scale`/`translate` properties — so a transition list naming only
  `transform` would have caught none of the press states.

  *One bug worth keeping:* `.mf-enter` first shipped as an `animation`
  shorthand containing `var()` beside an `animation-delay`. Lightning CSS
  expands a shorthand when a longhand sits next to it and cannot expand one
  holding a `var()`, so it emitted an empty `animation-duration` and the
  entrance silently did nothing. It type-checked, built and passed all 567
  tests in that state; only reading the computed rule in the browser caught it.

  567 tests, build, typecheck and lint green. Clicked through signed-in in
  light and dark at 1280×720 and 375×812 with seeded connections and a
  scheduled post, including the drag-from-inside-a-dialog case that used to
  dismiss it, the sheet caught mid-rise at `translateY(100%)`, and a live
  spinner during a real data export. **Not verified:**
  `prefers-reduced-motion` under an actual OS setting — the rule was read back
  from the deployed stylesheet and is correct, but nothing exercised it with
  the preference on.

- **2026-08-25 (later still) — bigger files, and scheduling becomes a paid
  feature.** See `sessions/2026-08-25-upload-limits-and-scheduling.md`. Merged
  and deployed.

  Four owner decisions in one thread: a short video may be **1GB**, a long one
  **whatever YouTube allows** (256GB), **Free cannot schedule**, and **nothing
  over 5GB may be scheduled on any plan**. Plus: leaving the composer at any
  point throws the post away — only Save draft and Schedule keep anything.

  *Sizes.* `checkUpload` takes the kind of post as context, so the same clip is
  refused as a Short and accepted as a Long video; the refusal says so rather
  than only naming the number. The per-row error is **derived at render** and
  not stored, because the kind can change after the file was picked and a
  stored refusal would survive the person doing exactly what it told them.

  *Multipart upload, which the 256GB figure required.* R2 refuses a single PUT
  over 5GiB, so this could not be a constant change — above 4GiB the browser
  uploads in parts. One request signs every part URL at once (ten thousand
  round trips is the alternative); `File.slice` keeps one part in memory, so a
  200GB file is not 200GB of RAM. **Completion deliberately takes no ETags from
  the browser**: `ListParts` gives the server the same list from the other end,
  which removes both the CORS expose-header requirement and any need to trust
  the tab across ten thousand requests — and the server refuses to assemble
  anything short of the expected count, because a truncated video that
  publishes is worse than an upload that fails loudly. It is also what makes
  the ceiling *binding* rather than declared: an upload can only be as large as
  the parts we agreed to sign, where a single PUT's length is only ever the
  browser's claim.

  *Scheduling.* `plans.limits.scheduling`, false on Free
  (`20260825000000_scheduling_is_a_paid_feature.sql`, additive to the jsonb so
  the running release was unaffected). `parsePlanLimits` treats a **missing**
  key as `true`, unlike every other field, which throws — a migration that has
  not landed must not quietly take scheduling from someone paying for it. The
  gate is checked before the row is written, before the bytes move when the
  browser declares `intent: "schedule"`, and on Edit time — the last mattering
  for exactly one case, someone who scheduled on Pro and has since dropped to
  Free. Both refusals open a dialog offering "Post now instead"; neither is a
  disabled button, per the standing rule against dead controls.

  *One bug worth keeping.* `CompleteMultipartUpload` answered `InvalidPart: One
  or more of the specified parts could not be found` with nothing missing.
  `ListParts` returns each ETag with its quotes as entities — `&quot;abc&quot;`
  — and the code escaped the `&` a second time on the way back out, mangling
  every ETag into a value R2 had never issued. The message reads like a missing
  part rather than a corrupted one. `decodeXml`/`escapeXml` now live in their
  own pure module with the double-escape case pinned by a test.

  584 tests, build, typecheck and lint green; migration applied and read back
  from the rows. Proven signed-in and straight at the API: `scheduling_locked`
  on Free, `scheduled_media_too_large` at 6GB with 4GB accepted, `use_multipart`
  at 8GB, and multipart refused for a scheduled 8GB. Against the live bucket:
  create → part PUT → complete → object readable at exactly the right size →
  deleted; then two parts declared and one sent, complete refused with "1 of 2
  parts", abort, 404. **Not verified:** the browser half of a multipart PUT —
  the bucket's CORS allow-list has no entry for the auto-assigned dev-server
  origin, and the single-PUT path fails identically from it, which is how the
  cause was placed.

- **2026-08-25 (later still) — the minimal pass.** See
  `sessions/2026-08-25-minimal-pass.md`. Merged and deployed: live at
  `113da9f`.

  Owner brief: redesign the buttons, spacing, corners, the little elements and
  the speed, fix the boxes, and make it minimal. A system pass, not a screen
  pass — nothing here changes what the app does.

  *Measured first.* The app carried **23 distinct corner radii** (now 5),
  **18 box-shadow values** (now 2), **63 arbitrary pixel paddings** (now 0) and
  **17 hand-rolled copies of `buttonClass`** (now 0). Three of those radii —
  `rounded-lg`, `rounded-xl`, `rounded-2xl` — were doing the same job, a
  bordered container, at three different values on adjacent screens. That is
  why the interface read as assembled rather than designed.

  *The rules, all mechanical so nobody has to guess.* **Corners follow height:**
  a control under 32px takes `md` (10px), a control or tile above it `lg`
  (14px), a surface holding other surfaces `2xl` (18px), a hairline bar `sm`,
  anything circular `full` — and every remaining Tailwind radius name is mapped
  onto one of them in `globals.css`, so a stray class cannot invent a sixth.
  **Two elevations:** `--elev1` under something raised in place, `--elev2` under
  something floating free of the page; a card gets neither and separates with a
  hairline. **Three durations:** 110ms for every answer to a pointer, 160ms for
  something moving on screen, 240ms for a surface arriving from off it.

  *Speed, and it is real rather than cosmetic.* All 84 pointer responses moved
  from 150ms to 110ms and `--default-transition-duration` carries that value, so
  every bare `transition-*` in the codebase got faster without being edited. Six
  sites using `transition` or `transition-all` now name the two or three
  properties they change, and every `transition-[background,…]` was corrected to
  `background-color` — the shorthand makes the browser watch background-image,
  -position and -size for a change that only ever happens to the colour.

  *Boxes.* `Stat` is no longer a box; it is the most-repeated element in the app
  and every instance sat inside a `Card` inside a panel, so a number arrived
  wrapped in three rectangles. New `StatRow` divides a row of them with a
  hairline. The settings menu is one bordered list per group instead of thirteen
  bordered rows inside a bordered column. The automations account list, the
  research toolbar and the sidebar's usage meter lose their inner borders the
  same way. `Notice` and `UpgradeCard` carry a left rule rather than a full
  outline. The page-level radial accent wash is gone, which is why a white card
  now looks white.

  *Buttons.* Hover is a named colour, not a `brightness()` filter — that filter
  is why `ink` needed 1.45 while `primary` needed 1.08 and `quiet` needed 0.97,
  three numbers tuned by eye against three starting values, each behaving
  differently in the other theme. And a disabled filled button loses its fill
  instead of fading it: 45% of the accent is still unmistakably the accent, so
  the washed-orange *Next* on the composer's first step read as the brand colour
  rendering wrong rather than as a control not yet available.

  *Little elements.* The last three text glyphs (`↗ ◎ ✳` on the research metric
  pills) use the icon set, for the reason `icons.tsx` exists at all. **The
  connected-accounts switches were still success green** where the shared toggle
  had already been reversed to the accent — the screen a new user spends the
  most time on was the one screen with a different "on" colour. The dock's New
  post button no longer grows under the pointer; hover is a colour everywhere
  else and scale is the press.

  *Two real bugs found on the way.* The calendar printed "August 2026" twice,
  as its heading and again as the range label directly underneath. The
  composer's first step reserved 38vh of empty space between one row of five
  pills and the button that answers them.

  584 tests, build, typecheck and lint green. Clicked through signed-in with
  seeded rows (five connections with profiles and media, seven posts across
  every status, three automations, three research channels) in light and dark at
  1440×900 and 375×812, across every dashboard screen plus the marketing and
  auth pages, with the token values read back from the running page.
  **Not verified:** `prefers-reduced-motion` under a real OS setting, unchanged
  from the previous session.

- **2026-08-29 — the Impeccable pass: states, contrast, browser surfaces.**
  See `sessions/2026-08-29-impeccable-pass.md`. The official **Impeccable**
  design skill (`github.com/pbakaus/impeccable`, v4.1.1) was installed via
  `npx impeccable install` into `.claude/skills/impeccable/` — now tracked in
  git — and its detector plus audit/harden playbooks drove a gap pass.

  *States that did not exist.* The app had no 404, error, or loading UI at all;
  a mistyped URL or the research pages' Free-plan `notFound()` rendered Next's
  unstyled default. Added: root and dashboard `not-found.tsx` (the dashboard
  one keeps the shell), root and dashboard `error.tsx`, `global-error.tsx`,
  and `dashboard/loading.tsx`. **Next 16 renamed the error boundary's recovery
  prop from `reset` to `retry`.**

  *Contrast, measured.* `--faint` (3.3:1) and the light ok/warn/sky text tones
  (3.2–4.1:1) label real content at 11–13px; all now ≥4.5:1 on every surface
  they sit on (light faint #6b6b75, ok #15803d, warn #b45309, sky #0369a1;
  dark faint #8f8f9b). Soft tints untouched. White-on-accent deliberately kept.

  *Browser surfaces themed:* accent `:focus-visible` ring (keyboard only,
  inputs excluded), accent `::selection`, accent caret, and a skip link past
  the ~40-tab-stop sidebar. *Detector findings fixed:* the 2px left rules on
  `Notice`/`UpgradeCard` are gone (fill alone marks the block). *Glyphs:* the
  pricing ✓/–, onboarding and script-stage ✓, and "… ✓" labels moved to the
  icon set (new `minus` icon); the phone preview's ♡💬↗ stay, they depict
  Instagram, not us.

  *Two bugs from the browser pass:* the mobile marketing header collided at
  390px (wordmark now yields below `sm`), and plan denials printed raw ids
  ("does not include x") — `can-user-do.ts` now goes through
  `PLATFORM_LABELS`.

  584 tests, build, typecheck, lint, detector 0 findings. Verified on the
  production build via headless Chrome/CDP with a throwaway Free user:
  26 screens at 1440×900 and 390×844, zero horizontal overflow, dark spot
  check, fixes re-shot, new CSS rules read back from the built stylesheet.
  Throwaway user deleted.

- **2026-08-29 (later) — the deploy stopped breaking the page it was
  deploying.** The fix was written on 2026-08-25 in the
  `handoff-completion-2d2d54` worktree and left uncommitted (see
  `handoff/2026-08-25-deploy-window-and-error-boundaries.md`); ported to
  `main` and landed today. See `sessions/2026-08-29-atomic-deploy.md`.

  *The deploy built in place.* `deploy.sh` ran `next build` inside
  `/srv/markedfox/current`, the directory the live process was serving from,
  and Turbopack rewrites `.next` over several minutes on a 1 vCPU box. Every
  request the old process handled during those minutes came back 500 with
  `ChunkLoadError: Cannot find module .../chunks/ssr/src_1q9rin3._.js` — the
  chunk was not missing, it had been replaced under a process that had already
  resolved the manifest naming the old one. The note in this file claiming the
  old release kept serving described something the script did not do, and has
  been corrected.

  Now the build happens in a second checkout at `/srv/markedfox/build` and the
  live tree changes only in one `mv` with the service already stopped, so the
  downtime is a boot rather than a build. The previous build is kept as
  `.next.prev`, and a release that comes up unhealthy is **rolled back to it
  automatically** rather than leaving the site down for someone to restore a
  snapshot. The script also re-execs itself from a copy in `/tmp` first,
  because it lives inside the tree it resets and bash reads a script by byte
  offset as it runs. The first run had to be started from a copy in `/tmp` for
  the same reason — the script at its normal path was still the old one.

  *And a tab open across a deploy always broke.* Its chunk URLs stop existing
  the moment a new build lands, whatever the deploy does. The 2026-08-29
  Impeccable pass had already given the app its three error boundaries; what
  they lacked was the recognition. `src/components/stale-build.ts` names that
  family of failure (`ChunkLoadError`, "Failed to fetch dynamically imported
  module", and the wording each browser uses) and `useStaleBuildReload`
  **reloads once**, guarded by a 20-second mark in `sessionStorage` so a
  genuinely broken build shows the screen instead of looping. All three
  boundaries call it and keep their design; each gained a "Reload the page"
  button beside "Try again", because retrying a stale tree fails identically.

- **2026-08-29 (later still) — the landing page, rebuilt.** See
  `sessions/2026-08-29-landing-rebuild.md`. The owner supplied three
  reference landing pages (Linkme, ManyChat, Sandcastles) and asked for one
  MarkedFox page that tells the whole story: find what works, post it
  everywhere, let the comments sell, own the numbers, run it from one
  place. Thirteen sections built from the product's own shapes in dark
  mockup frames (`_components/home/mocks.tsx`), an interactive DM demo
  running the app's real rule templates, the plan grid reading the same
  rows as `/pricing` (now `_components/plans-data.ts`), and a 25-answer
  categorised FAQ. Every capability the references sell that the app does
  not have — commerce, paywalls, tips, courses, a bio link, native apps —
  is absent rather than promised, and the platform-review status is stated
  in the open. `marketing-copy.test.ts` pins no borrowed social proof, no
  dead labels, and the X cap beside every "unlimited". 597 tests, build,
  lint, typecheck and detector green; 0px overflow at 1440 and 390 in both
  themes.

- **2026-08-31 — production-readiness audit.** See
  `sessions/2026-08-31-production-audit.md`. Baseline was green (599 tests), so
  this hunted for what passes tests and still fails a customer. Three gaps.

  *The checkout success screen could never render.* Stripe was returned to
  `/dashboard/settings`, which is a `redirect()` to the accounts pane, so the
  query string never survived — the "Payment received" and "Checkout canceled"
  cards sat correct and unreachable while a paying customer landed on
  Connected accounts with no confirmation. Return URLs are now a pure module
  and a test pins the rule: a checkout return path must be a page that reads
  `?checkout=`, never one that redirects.

  *Nothing rate limited our own endpoints.* `platform_budgets` protects the
  platforms from us; nothing protected us from a caller — sign-in was
  grindable, and sign-up and password-reset would mail any address an attacker
  named on our sending reputation. `20260831000000_rate_limits.sql` adds the
  counter in the budget's own shape (one atomic increment-and-check; proven on
  live rows to let exactly five of twenty simultaneous callers through), wired
  into the three auth entry points and both presigned-upload routes, pruned
  from the scheduler tick. **It fails open by design, including when the
  service client itself throws** — a limiter that fails closed turns a missing
  env var into "nobody can sign in", which is worse than the abuse it stops.
  RLS remains the thing that fails closed.

  *The production env template had gone stale* — no X, YouTube or Snapchat
  after those adapters shipped, so a fresh droplet loses four platforms
  silently. Completed and pinned by `env-docs.test.ts`, which reads both
  templates against the vars the code actually reads.

  639 tests, build, lint, typecheck green; new `rate-limit-smoke` 13/13 on live
  Postgres; rls all-pass, burst 22/22, billing 16/16, dm 26/26 unchanged. Live
  plans read back and confirmed to match the marketing numbers — every
  `stripe_price_*` is still UNSET, which stays the owner blocker. Deployed
  `f61d8e5`.

- **2026-09-01 — Stripe configured, one owner step from live.** See
  `sessions/2026-09-01-stripe-live.md`. Through the owner's signed-in Chrome,
  on the Codove Stripe account (the login's only account, which already bills
  an unrelated product): MarkedFox Pro and Studio created with all four live
  prices, the price ids written into the `pro`/`studio` plans rows and read
  back; webhook destination `markedfox-production` →
  `https://markedfox.com/api/webhooks/stripe` on exactly the three
  `customer.subscription.*` events; the real `whsec_` replaced the 2026-08-20
  placeholder in `.env.local` and on the droplet (synced, restarted, health
  200). Proven: billing-smoke **16/16 against production with the real
  secret**. Statement descriptor MARKEDFOX set **per product, not
  account-wide** — the account-level descriptor would have rewritten the other
  product's customers' card statements. Webhook API version is the account's
  `2026-02-25.clover` (the dashboard no longer offers basil); code-side basil
  pin is outbound-only and unaffected. **Remaining blocker:** the permission
  layer refused agent creation of API keys, so `STRIPE_SECRET_KEY` is still
  unset — checkout/portal stay off until the owner creates the restricted key
  (exact 6-step recipe in the session log) and runs `deploy/sync-env.sh`.

- **2026-09-02 — security headers, method handling, and security.txt.** See
  `sessions/2026-09-02-security-headers.md`. A focused hardening pass on three
  confirmed public findings; nothing here changes what the app does.

  *A real Content-Security-Policy, nonce-based.* `src/lib/security/csp.ts`
  builds it as a pure function and `src/proxy.ts` sets it on both the response
  (what the browser enforces) and the request (what Next reads to stamp the
  nonce onto its own inline scripts — without it the RSC payload is blocked and
  nothing hydrates). `script-src` has **no** `'unsafe-inline'`, which is the
  whole point. The usual objection to nonces — that they disable static
  generation — does not apply here: the root layout already awaits `cookies()`,
  so the build reports exactly two static routes and both are PNGs.

  Three deliberate loosenings, each with a reason rather than a shrug.
  `style-src` keeps `'unsafe-inline'` because 26 components pass a
  `style={{…}}` prop and no nonce can cover a style *attribute* — and note that
  a nonce in that directive would make the browser ignore `'unsafe-inline'`, so
  it must never gain one. `img-src`/`media-src` allow any https origin because
  avatars and thumbnails come from whatever CDN each platform uses this month,
  and an allow-list of those silently blanks somebody's picture; images do not
  execute. `'wasm-unsafe-eval'` plus `worker-src 'self' blob:` for the in-browser
  ffmpeg trim, with `child-src` mirroring it because Safari has no `worker-src`.
  `connect-src` names the Supabase project (https and wss) and **our own** R2
  account, never `*.r2.cloudflarestorage.com`. `form-action` names Stripe's
  checkout and portal, because with JavaScript off the Server Action's redirect
  is a form navigation and Chrome checks it against that directive.

  *`poweredByHeader: false`*, so responses stop naming the framework whose CVEs
  to try.

  *TRACE returned `500`, and the fix could not go where it looked like it
  should.* Next builds a WHATWG `Request` from the Node request **before**
  middleware runs, and that constructor throws on TRACE, TRACK and CONNECT
  (`TypeError: 'TRACE' HTTP method is unsupported`), so no proxy code can ever
  answer them. They are refused in `deploy/Caddyfile` with a 405 and an `Allow`
  header; `src/proxy.ts` keeps the same allow-list as the second line, for a
  method Caddy forwards and no route implements. POST and OPTIONS stay on the
  list deliberately — the Stripe and Meta webhooks POST, and preflights are
  OPTIONS.

  *`/.well-known/security.txt`* is a route handler rather than a file, because
  RFC 9116 requires an `Expires` and a date written into a static file goes
  quietly invalid on a day nobody is looking. Contact is
  `support@markedfox.com`, which the product already publishes — deliberately
  **not** the role account, whose whole value is that the people reading a
  security.txt do not have it. **Open owner item:** Cloudflare Email Routing for
  `support@` is still unconfigured (Phase 0), so mail to it bounces today.

  *One config change that is not a code change:* `public/ffmpeg/**` is now
  eslint-ignored. It is Emscripten output copied in by `prebuild` and
  gitignored, and its two `no-this-alias` errors had made `npm run lint` exit 1
  since the day it landed.

  668 tests (639 + 29 new), build, typecheck and lint green — lint now at 0
  errors, from 2. Verified on the production build through headless Chrome:
  every script tag on a page carries the matching nonce including the theme
  bootstrap, a client component's `onClick` still fires, and six marketing/auth
  pages plus eight dashboard pages report zero CSP violations and zero console
  errors after a real Supabase sign-in with a throwaway `auth-smoke-*` user
  (deleted afterwards). The Stripe webhook still answers POST and OPTIONS.

- **2026-09-03 — Stripe unblocked, then a fifth tier: Starter $8.** See
  `sessions/2026-09-03-starter-plan.md`.

  *Stripe is live.* `STRIPE_SECRET_KEY` was the last blocker from 2026-09-01;
  the owner created the restricted key and it is now in `.env.local`, on the
  droplet, and in the running process, verified by fingerprint match across all
  three. A live `GET /v1/subscriptions` returns 200, so checkout and the billing
  portal work. **One repair on the way in:** the key had been pasted twice into
  one line (214 chars, both halves byte-identical), which would have failed
  every Stripe call while looking configured.

  *And a bug worth keeping.* `deploy/sync-env.sh` compares **key names, not
  values**, so it reports "unchanged" for a key whose value differs and can
  never push a corrected secret. It only did no harm here because the droplet
  already held the good copy. Left as-is deliberately, recorded so the next
  person does not trust its "unchanged".

  *Starter — $8/mo, $80/yr, public.* A fourth public tier between Free and Pro
  (`20260903000000_starter_plan.sql`). The design constraint is the whole
  thing: **it may contain nothing that costs money or load.** Unlimited posting
  and unlimited connected accounts, because posting is $0 per post on every
  platform it carries; 2 workspaces, unlimited DM rules, 5,000 DM sends. No
  scheduling, no X, no research, no funnels.

  `platforms` is an **explicit list of the eight non-X platforms rather than
  `null`** — `null` means every platform and would hand the cheapest paid tier
  the one platform that bills us per post. The cost of that choice is recorded
  in the migration: a platform added to the registry later is not in the list
  and reads as locked for Starter until the row is edited.

  *One open number.* `dm_sends_per_month: 5000` is the owner's figure and
  inverts the value ladder — 625 sends per dollar against Pro's 500, on the one
  allowance that is genuinely constrained (Meta rate-limits per app, so DM
  sends spend a budget every customer shares). 2,500 was recommended and not
  taken. It is one number in one row.

  *Three hardcoded plan maps found, two by grep and one by the compiler.*
  Widening `IntendedPlan` from two ids to three broke
  `signup-form.tsx`'s `PLAN_LABELS`, and `actions.ts` carried a two-branch
  ternary that would have told a Starter signup they chose Studio. Both now
  read one shared `INTENDED_PLAN_NAMES` map.

  *The pricing grid stayed at four columns* by moving Enterprise out of it and
  into a full-width band underneath — a `contact: true` flag on the plan row,
  not a hardcoded id in the component. Enterprise is a mailto with no price and
  no checkout, so it never belonged in a row of comparable priced columns.

  *Two tests were asserting counts that a new tier breaks*, both replaced with
  set assertions that are stronger than what they replaced:
  `scripts/rls-smoke.mjs` checked `plans.length === 4` (a number that proves
  nothing about whether anon can still read the table), and
  `marketing-copy.test.ts` proved the X caveat only file-wide. The new per-plan
  version caught that Enterprise settles X in a third wording.

  689 tests (668 + 21), build, typecheck and lint green; migration applied and
  the row read back. **The live row was run through the real gate**, not a
  fixture: unlimited posting past 900/day, `scheduling_locked`,
  `plan_platform_locked` on X, `workspace_cap` at 2, `research_locked`, and the
  5,000th DM allowed with the 5,001st refused. Production smokes rls all-pass,
  billing 16/16, burst 22/22, dm 26/26. Pricing page clicked through at 1440
  and 390 in light and dark: four equal columns, Enterprise banded, yearly
  toggle correct, zero horizontal overflow, zero console errors.

- **2026-09-06 — Starter is sellable.** The Stripe product was created through
  the owner's signed-in Chrome, the same path Pro and Studio took on
  2026-09-01. `prod_VD9bNAYbZCCER0`, descriptor MARKEDFOX **on the product**
  (account-level would rewrite what the other business's customers see),
  with `price_1UCjIcGXUyubwKz3MV8JO8Xh` at $8/mo and
  `price_1UCjIcGXUyubwKz3AqNG7ot3` at $80/yr, both written into the `starter`
  row. Proven by creating a live checkout session against each price —
  `status=open` at exactly $8.00 and $80.00 — then expiring both.

  *The API route was tried first and correctly refused:* the production
  restricted key reads products but cannot write them. The key was left
  unchanged rather than widened. A server key on a public droplet has no
  business creating products; checkout only reads prices.

  *A near-miss worth keeping.* The account already held `Starter B2C` ($59/mo)
  and `Starter B2B` ($79/mo) belonging to Codove, the unrelated business
  sharing it. The owner believed Starter was already made and was remembering
  those. Either price id in the `starter` row would have billed MarkedFox
  customers $59 or $79 — which is why the product is named **MarkedFox
  Starter** and why the ids were read back from the API rather than copied by
  eye.

- **2026-09-06 → 09-07 — the phone rebuilt, and the plans reshaped.** Thirteen
  commits, `1bfdea8` → `6222b14`, all deployed. Two migrations. 700 → 713
  tests. See `sessions/2026-09-07-mobile-and-plan-shape.md` and
  `handoff/2026-09-07-next-session.md`.

  *Stripe finished.* `STRIPE_SECRET_KEY` arrived — pasted twice into one line,
  214 chars, repaired in place rather than reissued. **MarkedFox Starter**
  created through the owner's browser (`prod_VD9bNAYbZCCER0`, $8/mo and $80/yr,
  descriptor on the product), both price ids in the row, proven by opening a
  live checkout at each price. Near-miss recorded: the shared Stripe account
  already held Codove's `Starter B2C` ($59) and `Starter B2B` ($79), which is
  what the owner was remembering when he said Starter existed.

  *The phone navigation took five attempts and four were wrong* — chip row,
  corner hamburger, press-the-active-tab, floating pill, and finally a caret on
  the section name. The third is the one worth remembering: it is the phone
  convention and it is invisible, and the owner went looking for Calendar and
  could not find them. A convention nobody can see is a feature nobody uses.

  *Home reads like the profiles it shows:* small avatar left, numbers beside
  it, one face and a count on "everything", YouTube saying **subscribers**
  (declared on the adapter beside `primaryMetric`). The read-failure notice
  shrank three times, ending as a dot and a count.

  *Two bugs of the same shape, both about absolute positioning.* The landing
  page scrolled 196px sideways because `.sr-only` labels escaped an
  `overflow-x-auto` that was not their containing block; the account-size menu
  ran 95px off a phone because a 256px panel had no horizontal anchor. And a
  third of a different shape: **no `<img>` in the app had an `onError`**, so a
  dead avatar URL rendered the browser's broken glyph — and `onError` alone
  would not have fixed it, because these pages are server-rendered and the 404
  has already failed before React hydrates.

  *Screens stopped explaining our configuration to customers.* "Needs an AI key
  on this deployment" in eight places, raw provider errors on Home
  (`Malformed token envelope: expected "v1.<iv>.<ciphertext>.<tag>"`), and the
  pricing page's "Why is X different?" panel — all removed.

  *Long videos became possible:* `account_media.duration_seconds`, nullable,
  where null means unknown and appears in neither Short nor Long rather than
  being guessed into one. YouTube, TikTok and X report length; Instagram,
  Facebook and Threads do not at any API version. The parser earned its test
  immediately — YouTube's `"P0D"` for an unfinished live stream parsed to zero
  seconds, which sorts as short.

  *Plan rows reshaped* (`20260907010000_plan_shape.sql`): drafts ladder, Free
  to one workspace and every platform except X, Studio to 400 X posts and
  15,000 DM sends.

  *Four tests were corrected rather than deleted*, each pinning something it
  did not mean to check: a rule proved by a page that stopped redirecting, an X
  assertion pinned to the literal 300, a post-type list spelled out by hand,
  and a route list that a new page would silently fall off.

