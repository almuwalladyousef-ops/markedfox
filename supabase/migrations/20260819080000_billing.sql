-- Stripe billing.
--
-- The entitlement side of this already exists and does not change: `plans`
-- holds the limits, `subscriptions` holds who is on what, and canUserDo reads
-- a snapshot of both. Stripe's ONLY job is writing to `subscriptions` through
-- a webhook — which is what makes swapping processors later one adapter file
-- rather than a migration.
--
-- So all that is needed here is the mapping between our plan ids and Stripe's
-- price ids, plus the bookkeeping a webhook needs to be safe to replay.

alter table public.plans
  -- Nullable on purpose: Free has no price, Enterprise is a mailto, and a
  -- deployment without Stripe configured has none of them. A plan with no
  -- price id simply cannot be checked out, and the UI says so.
  add column stripe_price_monthly text,
  add column stripe_price_annual text;

-- Stripe delivers events at least once and out of order. Both are handled the
-- same way as Meta's webhooks: the platform's own event id is the dedupe key,
-- and a duplicate is stored once and processed once.
create table public.billing_events (
  id text primary key,
  type text not null,
  -- Which subscription/customer it touched, for tracing a user's billing
  -- history without going to the Stripe dashboard.
  processor_customer_id text,
  processor_subscription_id text,
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index billing_events_status_idx
  on public.billing_events (status, received_at)
  where status in ('pending', 'failed');

alter table public.billing_events enable row level security;
-- No policies: service role only. Billing events carry another tenant's
-- customer ids and amounts, so no user may read them.

-- Subscriptions gain the fields a real billing lifecycle needs. The existing
-- columns (plan_id, status, processor, processor_customer_id,
-- processor_subscription_id, current_period_start/end, cancel_at_period_end)
-- already covered most of it.
alter table public.subscriptions
  -- monthly | annual. Which cadence they bought, so the UI can offer the
  -- switch and say what renewal will cost.
  add column billing_interval text
    check (billing_interval in ('monthly', 'annual')),
  -- The Stripe event that last moved this row. Lets a replayed or out-of-order
  -- event be ignored rather than rolling a subscription backwards.
  add column last_event_at timestamptz;

-- A customer id must map to exactly one user, or a webhook cannot tell whose
-- subscription it is describing.
create unique index subscriptions_processor_customer_idx
  on public.subscriptions (processor_customer_id)
  where processor_customer_id is not null;
