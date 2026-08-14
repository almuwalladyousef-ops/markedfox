# Phase 1 — provisioning the MarkedFox server

The runbook for standing up the single VPS that hosts everything. Follow it in
order; each step assumes the previous one finished.

## Why DigitalOcean Toronto

Hetzner was the original choice on price (€4.50 for 2 vCPU / 4GB) but would not
accept the owner's signup. The replacement is chosen on **latency to the
database, not to users**: the Supabase project lives in `ca-central-1`
(Toronto), and that region is fixed because changing it is a data migration
rather than a setting. A European box would put the Atlantic between the app and
its own Postgres on every query, roughly 90–100ms per round trip, on an app that
makes several queries per request.

So the target is Toronto specifically.

| | |
|---|---|
| Provider | DigitalOcean |
| Region | `tor1` (Toronto) |
| Size | `s-1vcpu-2gb` — $12/month |
| Image | Ubuntu 24.04 LTS |
| Backups | off; on-demand snapshots instead ($0.06/GiB/month) |

**The cost is roughly double the original plan** and nothing in North America
matches Hetzner's pricing — equivalent 4GB specs run about $24/month. 2GB works
because Postgres is external, so the droplet runs only Next.js and the scheduler.
The build is the memory peak, not serving traffic, which is why `bootstrap.sh`
adds 2GB of swap.

## 1. Create the droplet

Sign in to DigitalOcean **as the role account**, `markedfox.usa@gmail.com` —
not a personal login. The whole stack has to transfer in one handover.

- Region **Toronto (tor1)**, Ubuntu 24.04 LTS, Basic / Regular, `s-1vcpu-2gb`
- Authentication: **SSH key**, not a password. Upload the owner's public key.
- Hostname: `markedfox-web`
- Leave weekly backups off — the rollback strategy is on-demand snapshots taken
  before each deploy, which `deploy.sh` handles.

Note the droplet's public IPv4 address.

## 2. Point DNS at it

In Cloudflare, on the `markedfox.com` zone:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `@` | *droplet IP* | DNS only |
| A | `www` | *droplet IP* | DNS only |

**Set the proxy to "DNS only" (grey cloud) for the first certificate issue.**
Caddy proves domain control over plain HTTP, and Cloudflare's proxy intercepts
that challenge. Turn the orange cloud back on afterwards if you want it.

Wait until `dig +short markedfox.com` returns the droplet IP before continuing.
Caddy cannot get a certificate before that resolves, and repeated failures hit
Let's Encrypt rate limits.

## 3. Bootstrap the box

From your Mac, in a checkout of this repo:

```bash
ssh root@<droplet-ip> 'bash -s' < deploy/bootstrap.sh
```

This updates the system, adds 2GB of swap, creates the `markedfox` service
account and a `deploy` sudo account, installs Node 22 and Caddy, configures
`ufw` (only 22/80/443 inbound), hardens SSH to keys-only with no root login,
enables unattended security upgrades with a 04:30 reboot window, and starts
`fail2ban`.

It refuses to disable root SSH if `deploy` has no authorized key, so a
misconfiguration cannot lock you out.

**Root SSH is off after this.** Log in as `deploy` from now on.

## 4. Clone the repo

```bash
ssh deploy@<droplet-ip>
sudo -u markedfox git clone https://github.com/almuwalladyousef-ops/markedfox.git /srv/markedfox/current
```

## 5. Write the production environment

```bash
sudo install -m 600 -o markedfox -g markedfox \
  /srv/markedfox/current/deploy/env.production.example \
  /srv/markedfox/.env.production
sudo -u markedfox nano /srv/markedfox/.env.production
```

Two keys must be generated once and then never changed:

```bash
openssl rand -base64 32   # TOKEN_ENCRYPTION_KEY
openssl rand -base64 32   # NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` decrypts every stored platform OAuth token. Losing or
rotating it means every user reconnects every account. Back it up as carefully
as the role account itself.

## 6. Install Caddy config and the systemd units

```bash
sudo bash /srv/markedfox/current/deploy/install-units.sh
```

Validates the Caddyfile before reloading, installs `markedfox.service` plus the
scheduler service and timer, and starts the timer.

## 7. Install doctl, so deploys can snapshot

```bash
sudo snap install doctl
doctl auth init   # paste a DigitalOcean API token with read+write scope
```

`deploy.sh` refuses to run without it, because a deploy with no rollback point
is exactly the situation snapshots exist for. `--skip-snapshot` overrides that
for development only.

## 8. First deploy

```bash
sudo bash /srv/markedfox/current/deploy/deploy.sh
```

Snapshots, fetches `main`, installs, builds, restarts, then polls the app until
it answers. It exits non-zero and prints the journal if the site does not come
up — a deploy that leaves the site down must fail loudly.

## Verifying Phase 1's exit criteria

Phase 1 is not done until all of these pass. They are checks, not assumptions.

```bash
# TLS on the real domain, valid certificate
curl -sSI https://markedfox.com | head -1
echo | openssl s_client -connect markedfox.com:443 -servername markedfox.com 2>/dev/null \
  | openssl x509 -noout -dates -issuer

# The app is not reachable except through Caddy
curl -sS --max-time 5 http://<droplet-ip>:3000/ || echo "correctly refused"

# Service survives a reboot
sudo reboot   # then, once back:
systemctl is-active markedfox.service caddy
systemctl list-timers markedfox-scheduler.timer --no-pager

# The scheduler timer is actually firing
journalctl -u markedfox-scheduler.service -n 20 --no-pager

# Firewall
sudo ufw status verbose        # only 22, 80, 443 in

# Snapshot restore — the one people skip. Restore the snapshot onto a new
# droplet, confirm it boots and serves, then destroy it. An untested backup
# is not a backup.
doctl compute snapshot list
```

Still outstanding for Phase 1 beyond this runbook: the R2 bucket, the Supabase
backup/restore test, and OAuth redirect URIs — which cannot be registered until
the Meta and TikTok apps exist.

## Operating notes

```bash
# Logs
journalctl -u markedfox.service -f
journalctl -u markedfox-scheduler.service --since "1 hour ago"
sudo tail -f /var/log/caddy/markedfox.log

# Restart / status
sudo systemctl restart markedfox.service
systemctl status markedfox.service

# Roll back to a snapshot: restore it from the DigitalOcean control panel onto
# the same droplet. The box is disposable by design — code is in git, state is
# in Supabase, and media in R2 is deleted after publish — so rebuilding from
# scratch is a valid recovery path too.
```
