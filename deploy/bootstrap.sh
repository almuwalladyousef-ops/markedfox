#!/usr/bin/env bash
#
# One-time hardening and provisioning for a fresh Ubuntu 24.04 droplet.
# Run once, as root, on a brand new box:
#
#   ssh root@<droplet-ip> 'bash -s' < deploy/bootstrap.sh
#
# Idempotent: safe to re-run if it fails partway.

set -euo pipefail

APP_USER="markedfox"
APP_DIR="/srv/markedfox"
NODE_MAJOR="22" # Next.js 16 needs Node 20.9+; 22 is the current LTS.

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root on the droplet." >&2
  exit 1
fi

log "Updating the base system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

log "Installing packages"
apt-get install -y -qq \
  curl ca-certificates gnupg git ufw fail2ban unattended-upgrades \
  debian-goodies apt-listchanges

log "Creating the ${APP_USER} service account"
# No password, no shell login by password: this account exists to own the app
# and its systemd units, not to be logged into interactively.
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  adduser --system --group --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi
mkdir -p "$APP_DIR"
chown -R "${APP_USER}:${APP_USER}" "$APP_DIR"

log "Creating the deploy account"
# A human account with sudo, used for SSH and running deploys. Root SSH is
# disabled below, so this is the only way in.
if ! id -u deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
  usermod -aG sudo deploy
fi
# Carry over whichever key DigitalOcean installed for root at droplet creation.
if [[ -f /root/.ssh/authorized_keys ]]; then
  install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
  install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
fi

if [[ ! -s /home/deploy/.ssh/authorized_keys ]]; then
  echo "REFUSING to continue: /home/deploy/.ssh/authorized_keys is empty." >&2
  echo "Disabling root SSH now would lock you out of the box." >&2
  echo "Add your public key to that file, then re-run this script." >&2
  exit 1
fi

log "Adding swap"
# A 2GB droplet running `next build` is genuinely tight — the build is the
# memory peak, not serving traffic. 2GB of swap turns a hard OOM kill during
# deploy into a slow build, which is the trade worth making on a $12 box.
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  # Swap is insurance against the build spike, not somewhere to run from.
  sysctl -w vm.swappiness=10
  grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf
fi
free -h

log "Installing Node.js ${NODE_MAJOR}"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_MAJOR}* ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y -qq nodejs
fi
node -v

log "Installing Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

log "Configuring the firewall"
# Default deny inbound. Only SSH and the two web ports are reachable; the Next
# server on 3000 is bound to localhost and never exposed directly.
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status verbose

log "Hardening SSH"
# Keys only, no root login, no password guessing.
cat > /etc/ssh/sshd_config.d/99-markedfox.conf <<'SSHCONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
SSHCONF
sshd -t
systemctl restart ssh

log "Enabling unattended security upgrades"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'AUTOCONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
AUTOCONF
# Reboot automatically for kernel updates, at a time nobody is posting.
sed -i 's|^//Unattended-Upgrade::Automatic-Reboot ".*";|Unattended-Upgrade::Automatic-Reboot "true";|' \
  /etc/apt/apt.conf.d/50unattended-upgrades
sed -i 's|^//Unattended-Upgrade::Automatic-Reboot-Time ".*";|Unattended-Upgrade::Automatic-Reboot-Time "04:30";|' \
  /etc/apt/apt.conf.d/50unattended-upgrades
systemctl enable --now unattended-upgrades

log "Enabling fail2ban"
systemctl enable --now fail2ban

log "Preparing the application directory"
install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
# The env file holds the Supabase service-role key and the token encryption
# key. Owner-read-only, and never in git.
install -m 600 -o "$APP_USER" -g "$APP_USER" /dev/null "${APP_DIR}/.env.production"

log "Done"
cat <<'NEXT'

Bootstrap complete. Remaining steps, in order:

  1. Point DNS at this droplet (A record for markedfox.com and www).
     Caddy cannot issue a certificate until the name resolves here.
  2. Copy the env file:      deploy/env.production.example -> /srv/markedfox/.env.production
  3. Install the units:      sudo bash deploy/install-units.sh
  4. First deploy:           sudo -u markedfox bash deploy/deploy.sh

Root SSH is now disabled. Log in as `deploy` from here on.
NEXT
