#!/usr/bin/env bash
# Build a Debian .deb for the agent. Run on a Debian/Ubuntu host AFTER
# `node build.mjs` has produced build/ai-orchestrator-agent-linux-<arch>.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:-0.1.0}"
PKG="ai-orchestrator-agent"

ARCH_NODE="$(node -p process.arch)"
case "$ARCH_NODE" in
  x64) DEB_ARCH=amd64 ;;
  arm64) DEB_ARCH=arm64 ;;
  *) DEB_ARCH="$ARCH_NODE" ;;
esac

BIN="$AGENT_DIR/build/ai-orchestrator-agent-linux-${ARCH_NODE}"
[ -f "$BIN" ] || { echo "missing $BIN — run: node build.mjs" >&2; exit 1; }

ROOT="$AGENT_DIR/build/deb/${PKG}_${VERSION}_${DEB_ARCH}"
rm -rf "$ROOT"
install -D -m0755 "$BIN" "$ROOT/usr/lib/${PKG}/agent"
install -D -m0644 "$AGENT_DIR/packaging/templates/agent.config.json" "$ROOT/etc/${PKG}/agent.config.json"
install -D -m0644 "$AGENT_DIR/packaging/templates/systemd.service" "$ROOT/lib/systemd/system/${PKG}.service"

mkdir -p "$ROOT/DEBIAN"
cat > "$ROOT/DEBIAN/control" <<EOF
Package: ${PKG}
Version: ${VERSION}
Section: utils
Priority: optional
Architecture: ${DEB_ARCH}
Maintainer: VivaldiCode <guilhermecamachop@gmail.com>
Description: AI Orchestrator node agent (system-metrics bridge)
 Serves local CPU/memory metrics over HTTP for the AI Orchestrator dashboard.
 It only reads system stats; it never touches Ollama or your data.
EOF

# Keep the operator's config across upgrades.
echo "/etc/${PKG}/agent.config.json" > "$ROOT/DEBIAN/conffiles"

cat > "$ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
systemctl daemon-reload || true
systemctl enable ai-orchestrator-agent.service || true
systemctl restart ai-orchestrator-agent.service || true
EOF
chmod 0755 "$ROOT/DEBIAN/postinst"

cat > "$ROOT/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -e
systemctl stop ai-orchestrator-agent.service || true
systemctl disable ai-orchestrator-agent.service || true
EOF
chmod 0755 "$ROOT/DEBIAN/prerm"

OUT="$AGENT_DIR/build/${PKG}_${VERSION}_${DEB_ARCH}.deb"
dpkg-deb --root-owner-group --build "$ROOT" "$OUT"
echo "✓ built $OUT"
