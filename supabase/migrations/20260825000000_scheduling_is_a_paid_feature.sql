-- Scheduling becomes a paid feature (owner decision, 2026-08-25).
--
-- Free can publish now and can save drafts; it cannot set a time. The reason
-- is a real cost rather than packaging: a scheduled post's media is uploaded
-- when the button is pressed and then sits in R2 until the tick fires, which
-- may be weeks. Media is transient by design in this product, and a free
-- account parking storage indefinitely is the one way that stops being true.
--
-- Purely additive to the limits jsonb, so the release running right now — which
-- does not read the key — is unaffected, and the code that does read it treats
-- a missing key as `true`. Free is the only row that has to say false, but
-- every row says it out loud so `plans.limits` stays readable on its own.

update public.plans
set limits = limits || '{"scheduling": false}'::jsonb
where id = 'free';

update public.plans
set limits = limits || '{"scheduling": true}'::jsonb
where id <> 'free';
