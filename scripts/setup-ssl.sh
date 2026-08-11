#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-ssl.sh  –  Lokales HTTPS für Tablet-Demos (WLAN + iPhone-Hotspot)
#
# Verwendung:
#   ./scripts/setup-ssl.sh                 # alle lokalen IPs + .local-Hostname
#   ./scripts/setup-ssl.sh 172.20.10.2     # zusätzliche IP(s) erzwingen
#
# Wann ausführen?
#   • Einmalig nach mkcert-Setup
#   • Immer nach Netzwechsel: Heim-WLAN ↔ iPhone-Hotspot
#     (die Mac-IP ändert sich → Zertifikat neu erzeugen)
#
# Einmalig Mac:    brew install mkcert && mkcert -install
# Einmalig Tablet: rootCA.pem per AirDrop → installieren + „vollständig vertrauen“
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SSL_DIR="$REPO_ROOT/frontend/ssl"
FRONTEND_PORT=6054

is_demo_ip() {
  local ip="$1"
  [[ "$ip" =~ ^192\.168\. ]] \
    || [[ "$ip" =~ ^10\. ]] \
    || [[ "$ip" =~ ^172\.(1[6-9]|2[0-9]|3[0-1])\. ]] \
    || [[ "$ip" =~ ^192\.0\.0\. ]] \
    || [[ "$ip" =~ ^172\.20\.10\. ]]
}

# ── 1. Alle relevanten Hostnamen/IPs sammeln ─────────────────────────────────
declare -a HOSTS=()
add_host() {
  local h="$1"
  [[ -z "$h" ]] && return
  for existing in "${HOSTS[@]+"${HOSTS[@]}"}"; do
    [[ "$existing" == "$h" ]] && return
  done
  HOSTS+=("$h")
}

add_host "localhost"
add_host "127.0.0.1"

# Bonjour-/mDNS-Name (oft stabiler als die IP, wenn das Tablet ihn auflöst)
LOCAL_HOSTNAME="$(scutil --get LocalHostName 2>/dev/null || true)"
if [[ -n "$LOCAL_HOSTNAME" ]]; then
  add_host "${LOCAL_HOSTNAME}.local"
fi

# Default-Route (aktives Netz: WLAN oder Hotspot)
ACTIVE_IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' || true)
PRIMARY_IP=""
if [[ -n "${ACTIVE_IF:-}" ]]; then
  PRIMARY_IP=$(ipconfig getifaddr "$ACTIVE_IF" 2>/dev/null || true)
  if [[ -n "$PRIMARY_IP" ]] && is_demo_ip "$PRIMARY_IP"; then
    add_host "$PRIMARY_IP"
  fi
fi

# Alle privaten / Apple-Hotspot-IPs aller Interfaces (WLAN + ggf. Bridge/Hotspot)
while IFS= read -r ip; do
  if is_demo_ip "$ip"; then
    add_host "$ip"
  fi
done < <(ifconfig | awk '/inet /{print $2}')

# Manuell übergebene Zusatz-IPs
for arg in "$@"; do
  add_host "$arg"
done

# Mindestens eine erreichbare LAN/Hotspot-IP?
HAS_LAN_IP=false
for h in "${HOSTS[@]}"; do
  if is_demo_ip "$h"; then
    HAS_LAN_IP=true
    break
  fi
done

if [[ "$HAS_LAN_IP" != true ]]; then
  echo "❌  Keine lokale WLAN-/Hotspot-IP gefunden."
  echo "   Mac mit WLAN oder iPhone-Hotspot verbinden, dann erneut:"
  echo "   ./scripts/setup-ssl.sh"
  echo ""
  echo "   Verfügbare Interfaces:"
  ifconfig | awk '/^[a-z]/{iface=$1} /inet /{print "   " iface " → " $2}'
  exit 1
fi

echo "ℹ️  Aktives Interface: ${ACTIVE_IF:-unbekannt}"
echo "ℹ️  Primäre IP:        ${PRIMARY_IP:-–}"
echo "ℹ️  Zertifikat-Hosts:  ${HOSTS[*]}"

# ── 2. mkcert prüfen ─────────────────────────────────────────────────────────
if ! command -v mkcert &>/dev/null; then
  echo "❌  mkcert nicht gefunden. Installieren mit: brew install mkcert && mkcert -install"
  exit 1
fi

# ── 3. Zertifikat generieren ─────────────────────────────────────────────────
mkdir -p "$SSL_DIR"
cd "$SSL_DIR"

echo "🔐  Generiere Zertifikat…"
mkcert -key-file local-key.pem -cert-file local.pem "${HOSTS[@]}"

echo ""
echo "✅  Zertifikat gespeichert:"
echo "   $SSL_DIR/local.pem"
echo "   $SSL_DIR/local-key.pem"

# ── 4. Frontend-Container neu starten ────────────────────────────────────────
cd "$REPO_ROOT"
if docker compose ps --services --filter status=running 2>/dev/null | grep -q frontend; then
  echo ""
  echo "🔄  Starte Frontend-Container neu…"
  docker compose restart frontend
  echo "✅  Frontend läuft wieder."
else
  echo "ℹ️  Frontend-Container nicht aktiv – kein Neustart nötig."
  echo "   Danach: ./start-docker.sh"
fi

# ── 5. Demo-URLs ─────────────────────────────────────────────────────────────
CA_PATH="$(mkcert -CAROOT)/rootCA.pem"
DEMO_IP="${PRIMARY_IP:-}"
if [[ -z "$DEMO_IP" ]]; then
  for h in "${HOSTS[@]}"; do
    if is_demo_ip "$h"; then
      DEMO_IP="$h"
      break
    fi
  done
fi

echo ""
echo "────────────────────────────────────────────────────────────"
echo "📱  Tablet-Demo (AI App Hub)"
echo ""
echo "    Heim-WLAN:        Mac + iPad im gleichen WLAN"
echo "    Kundendemo:       iPhone-Hotspot → Mac verbinden →"
echo "                      iPad ebenfalls in den Hotspot →"
echo "                      dieses Skript erneut ausführen"
echo ""
echo "    Empfohlene URL:   https://${DEMO_IP}:${FRONTEND_PORT}"
if [[ -n "${LOCAL_HOSTNAME:-}" ]]; then
  echo "    Alternativ:       https://${LOCAL_HOSTNAME}.local:${FRONTEND_PORT}"
fi
echo ""
echo "    Einmalig Root-CA auf dem iPad vertrauen:"
echo "    1. open \"$CA_PATH\""
echo "    2. AirDrop → iPad"
echo "    3. Einstellungen → Allgemein → VPN & Geräteverwaltung → CA installieren"
echo "    4. Einstellungen → Allgemein → Info → Zertifikatvertrauenseinstellungen → aktivieren"
echo "    5. Safari: URL öffnen → Teilen → Zum Home-Bildschirm"
echo "────────────────────────────────────────────────────────────"
