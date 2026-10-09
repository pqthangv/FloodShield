#!/usr/bin/env bash
# Sets up the FloodShield API on a fresh Ubuntu server (made for Oracle Cloud's free VM).
# Safe to run again: it skips what is already done, and pulls and restarts the API.
#
# On the server:
#   git clone https://github.com/pqthangv/FloodShield.git
#   cd FloodShield
#   bash deploy/setup.sh        # first run creates deploy/.env and stops: fill it in
#   nano deploy/.env
#   bash deploy/setup.sh        # second run starts everything
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }

say "Settings (deploy/.env)"
if [ ! -f deploy/.env ]; then
  cp deploy/.env.example deploy/.env
  echo "Created deploy/.env. Fill in DOMAIN, DATABASE_URL and CONTACT_EMAIL:"
  echo "  nano deploy/.env"
  echo "then run this script again."
  exit 0
fi
if grep -q '^ADMIN_TOKEN=$' deploy/.env; then
  sed -i "s/^ADMIN_TOKEN=$/ADMIN_TOKEN=$(openssl rand -hex 32)/" deploy/.env
  echo "Generated an ADMIN_TOKEN (see deploy/.env)."
fi
for key in DOMAIN DATABASE_URL CONTACT_EMAIL; do
  if ! grep -q "^$key=." deploy/.env; then
    echo "Fill in $key in deploy/.env first (nano deploy/.env), then run this script again."
    exit 1
  fi
done
if grep -q '^DOMAIN=floodshield-yourname' deploy/.env; then
  echo "Replace the example DOMAIN in deploy/.env with your DuckDNS name, then run this script again."
  exit 1
fi
chmod 600 deploy/.env

say "Swap file (the free AMD VM has only 1 GB of memory)"
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
echo "ok"

say "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
docker --version

say "Firewall: allow web traffic (ports 80 and 443)"
# Oracle's Ubuntu images block every port except SSH inside the VM, on top of the cloud
# "security list" rules you add in the Oracle console.
for port in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null \
    || sudo iptables -I INPUT -p tcp --dport "$port" -j ACCEPT
done
if ! command -v netfilter-persistent >/dev/null; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent >/dev/null
fi
sudo netfilter-persistent save >/dev/null
echo "ok"

say "Latest code"
git pull --ff-only

say "Starting the API and HTTPS (the first build takes a few minutes)"
sudo docker compose -f deploy/docker-compose.yml up -d --build
sudo docker image prune -f >/dev/null

DOMAIN=$(grep '^DOMAIN=' deploy/.env | cut -d= -f2-)
say "Waiting for https://$DOMAIN/health"
for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/health" 2>/dev/null; then
    echo
    echo "Done. The API is live at https://$DOMAIN/api/v1"
    echo "Self-check: https://$DOMAIN/health?upstream=1"
    exit 0
  fi
  sleep 5
done
echo "Not reachable yet. Check that $DOMAIN points to this server's public IP, that ports 80/443"
echo "are open in the Oracle security list, and look at: sudo docker compose -f deploy/docker-compose.yml logs"
exit 1
