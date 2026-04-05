#!/bin/bash
# A2B-LIFT Expo Go starter
# Usage: bash start-expo.sh
#
# Requires: Mac WiFi connected to the SAME network as your phone
# (or phone creates a Personal Hotspot and Mac joins it).
# Then Expo Go can reach the Mac directly — no tunnel needed.

PORT=8081
PROJECT=/Users/mac/A2B-LIFT

echo ""
echo "═══════════════════════════════════════════"
echo "  A2B-LIFT Expo Starter"
echo "═══════════════════════════════════════════"
echo ""

# Kill stale Metro/Expo processes and free port
pkill -f "metro\|expo start\|cloudflared\|localtunnel" 2>/dev/null
lsof -ti :${PORT} | xargs kill -9 2>/dev/null
sleep 2

# Detect real WiFi IP (exclude loopback and Tailscale 100.x.x.x range)
WIFI_IP=$(ifconfig en0 2>/dev/null | grep "inet " | grep -v "100\." | awk '{print $2}' | head -1)

if [ -z "$WIFI_IP" ]; then
  echo "⚠️  WiFi (en0) has no non-Tailscale IP."
  echo ""
  echo "  → Turn on Mac WiFi and join the SAME network as your phone"
  echo "    OR: on your iPhone go to Settings → Personal Hotspot → Allow Others to Join"
  echo "    Then on Mac connect to the hotspot WiFi and re-run this script."
  echo ""
  # Fall back to cloudflared tunnel
  CF_BIN="/tmp/cloudflared"
  LOG="/tmp/cf.log"
  if [ ! -x "$CF_BIN" ]; then
    echo "▶ Downloading cloudflared..."
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz" -o /tmp/cf.tgz
    tar -xzf /tmp/cf.tgz -C /tmp/
    chmod +x "$CF_BIN"
  fi
  echo "▶ Starting Cloudflare tunnel (fallback)..."
  rm -f $LOG
  "$CF_BIN" tunnel --url http://localhost:${PORT} --no-autoupdate 2>&1 | tee $LOG &
  CF_PID=$!
  TUNNEL_HOST=""
  for i in $(seq 1 20); do
    TUNNEL_HOST=$(grep -o '[a-z0-9-]*\.trycloudflare\.com' $LOG 2>/dev/null | head -1)
    [ -n "$TUNNEL_HOST" ] && break
    sleep 2
  done
  if [ -z "$TUNNEL_HOST" ]; then
    echo "ERROR: No WiFi and no tunnel URL. Connect to WiFi and retry."
    exit 1
  fi
  echo ""
  echo "  Tunnel: https://${TUNNEL_HOST}"
  echo "  ⚠  Expo Go must open: exp://${TUNNEL_HOST}"
  echo "     (cloudflare URL — does NOT include port)"
  echo ""
  # Start Metro: cloudflare tunnels on 443, NOT on :8081.
  # We start a tiny node proxy on a second port so the bundle URL uses the right host.
  PROXY_PORT=8082
  node -e "
    const http = require('http');
    const net = require('net');
    const TARGET_PORT = ${PORT};
    function proxy(req, res) {
      const opts = { host: '127.0.0.1', port: TARGET_PORT, path: req.url, method: req.method, headers: { ...req.headers, host: 'localhost' } };
      const pr = http.request(opts, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      req.pipe(pr);
      pr.on('error', e => { res.writeHead(502); res.end(e.message); });
    }
    const srv = http.createServer(proxy);
    srv.on('upgrade', (req, sock, head) => {
      const s = net.connect(TARGET_PORT, '127.0.0.1', () => {
        s.write('GET ' + req.url + ' HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
        s.pipe(sock); sock.pipe(s);
      });
    });
    srv.listen(${PROXY_PORT}, () => console.log('proxy :${PROXY_PORT} -> :' + TARGET_PORT));
  " &
  PROXY_PID=$!
  sleep 1
  # Retunnel to proxy port instead
  kill $CF_PID 2>/dev/null
  rm -f $LOG
  "$CF_BIN" tunnel --url http://localhost:${PROXY_PORT} --no-autoupdate 2>&1 | tee $LOG &
  CF_PID=$!
  TUNNEL_HOST=""
  for i in $(seq 1 20); do
    TUNNEL_HOST=$(grep -o '[a-z0-9-]*\.trycloudflare\.com' $LOG 2>/dev/null | head -1)
    [ -n "$TUNNEL_HOST" ] && break
    sleep 2
  done
  export REACT_NATIVE_PACKAGER_HOSTNAME=$TUNNEL_HOST
  node $PROJECT/node_modules/expo/bin/cli start --lan --port ${PORT} $PROJECT
  kill $CF_PID $PROXY_PID 2>/dev/null
  exit 0
fi

# --- WiFi IS connected ---
echo "WiFi IP: $WIFI_IP"
echo "▶ Starting Expo (LAN mode)..."
echo ""
export REACT_NATIVE_PACKAGER_HOSTNAME=$WIFI_IP
node $PROJECT/node_modules/expo/bin/cli start --lan --port ${PORT} $PROJECT
