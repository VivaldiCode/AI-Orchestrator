#!/usr/bin/env bash
# Assemble a macOS .app bundle (and a .pkg if pkgbuild is available) around the
# SEA binary. Run on macOS AFTER `node build.mjs`.
#
# By default the bundle is ad-hoc signed. In CI, set CODESIGN_ID to a
# "Developer ID Application: …" identity to sign for distribution (then notarize).
set -euo pipefail

# Don't let macOS write AppleDouble (._*) sidecars while assembling the bundle —
# on exFAT/SMB volumes they end up inside the .app and break codesign.
export COPYFILE_DISABLE=1

AGENT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:-0.1.0}"
ARCH_NODE="$(node -p process.arch)"
BIN="$AGENT_DIR/build/ai-orchestrator-agent-darwin-${ARCH_NODE}"
[ -f "$BIN" ] || { echo "missing $BIN — run: node build.mjs" >&2; exit 1; }

APP="$AGENT_DIR/build/AI Orchestrator Agent.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
install -m0755 "$BIN" "$APP/Contents/MacOS/agent"
sed "s/__VERSION__/${VERSION}/g" "$AGENT_DIR/packaging/templates/Info.plist" > "$APP/Contents/Info.plist"
cp "$AGENT_DIR/packaging/templates/launchd.plist" "$APP/Contents/Resources/com.aiorchestrator.agent.plist"

# Strip any AppleDouble sidecars and stray xattrs before signing (see above).
find "$APP" -name '._*' -delete 2>/dev/null || true
xattr -cr "$APP" 2>/dev/null || true

codesign --force --deep --sign "${CODESIGN_ID:--}" "$APP"
echo "✓ built $APP (signed: ${CODESIGN_ID:-ad-hoc})"

if command -v pkgbuild >/dev/null 2>&1; then
  PKG_OUT="$AGENT_DIR/build/ai-orchestrator-agent-${VERSION}-darwin-${ARCH_NODE}.pkg"
  pkgbuild --install-location "/Applications" --component "$APP" "$PKG_OUT"
  echo "✓ built $PKG_OUT"
fi
