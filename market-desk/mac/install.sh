#!/usr/bin/env bash
# Install Market Desk conveniences on macOS. Run once from Terminal:
#
#   bash market-desk/mac/install.sh            # everything below
#   bash market-desk/mac/install.sh --no-autostart --no-desktop --no-alias
#   bash market-desk/mac/install.sh --uninstall
#
# Creates:
#   ~/Applications/Market Desk.app            double-click: start if needed, open DeerFlow + dashboard
#   ~/Applications/Market Desk Tools.app      menu: edit skills, new skill, watchlist, config, restart, logs…
#   ~/Applications/Market Desk Autostart.app  login item: starts everything in the background at login
#   Desktop copies of the first two, a login item for the third, and a `desk` command in ~/.zshrc.

set -euo pipefail
[ "$(uname)" = "Darwin" ] || { echo "This installer is for macOS."; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CTL="$HERE/deskctl.sh"
APPS="$HOME/Applications"
BUILD="$HERE/build"
NAMES=("Market Desk" "Market Desk Tools" "Market Desk Autostart")
SRCS=("MarketDesk" "MarketDeskTools" "MarketDeskAutostart")
MARK="# >>> market-desk >>>"

AUTOSTART=1; DESKTOP=1; ALIAS=1; UNINSTALL=0
for a in "$@"; do
  case "$a" in
    --no-autostart) AUTOSTART=0 ;; --no-desktop) DESKTOP=0 ;; --no-alias) ALIAS=0 ;; --uninstall) UNINSTALL=1 ;;
    *) sed -n '2,14p' "$0"; exit 1 ;;
  esac
done

remove_login_item() {
  osascript -e 'tell application "System Events" to delete (every login item whose name is "Market Desk Autostart")' >/dev/null 2>&1 || true
}

if [ "$UNINSTALL" = 1 ]; then
  remove_login_item
  for n in "${NAMES[@]}"; do rm -rf "$APPS/$n.app" "$HOME/Desktop/$n.app"; done
  if grep -q "$MARK" "$HOME/.zshrc" 2>/dev/null; then
    sed -i '' "/$MARK/,/# <<< market-desk <<</d" "$HOME/.zshrc"
  fi
  echo "Removed apps, login item and the desk alias. DeerFlow itself and your library are untouched."
  exit 0
fi

chmod +x "$CTL"

# 1. Settings: capture this shell's PATH so apps/login items can find uv, pnpm, node, nginx.
if [ ! -f "$HERE/settings.env" ]; then
  cat >"$HERE/settings.env" <<EOF
# Market Desk settings (read by deskctl.sh). Edit freely.
MODE=prod                 # prod = lighter, no hot reload (recommended for always-on); dev = hot reload
OPEN_DASHBOARD=1          # also open the dashboard when you click Market Desk.app
EDITOR_APP=""             # e.g. "Visual Studio Code", "Cursor", "TextEdit"; empty = auto-detect
SAVED_PATH="$PATH"
EOF
  echo "✓ wrote market-desk/mac/settings.env"
else
  # refresh PATH only, keep the user's other settings
  /usr/bin/sed -i '' "s|^SAVED_PATH=.*|SAVED_PATH=\"$PATH\"|" "$HERE/settings.env"
  echo "✓ refreshed PATH in market-desk/mac/settings.env"
fi
for tool in uv pnpm node nginx python3; do
  command -v "$tool" >/dev/null 2>&1 || echo "  ! '$tool' not found on PATH — DeerFlow needs it (run 'make check')."
done

# 2. Build the three small AppleScript apps.
rm -rf "$BUILD"; mkdir -p "$BUILD" "$APPS"
for i in 0 1 2; do
  src="$BUILD/${SRCS[$i]}.applescript"
  /usr/bin/sed "s|__DESKCTL__|$CTL|g" "$HERE/${SRCS[$i]}.applescript" >"$src"
  osacompile -o "$BUILD/${NAMES[$i]}.app" "$src"
  # hide the autostart helper from the Dock while it runs
  if [ "$i" = 2 ]; then
    /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" "$BUILD/${NAMES[$i]}.app/Contents/Info.plist" 2>/dev/null || true
  fi
  rm -rf "$APPS/${NAMES[$i]}.app"; cp -R "$BUILD/${NAMES[$i]}.app" "$APPS/"
done
echo "✓ apps in ~/Applications: Market Desk, Market Desk Tools, Market Desk Autostart"

# 3. Desktop shortcuts (Finder aliases, so there is one real copy of each app).
if [ "$DESKTOP" = 1 ]; then
  for n in "Market Desk" "Market Desk Tools"; do
    rm -rf "$HOME/Desktop/$n" "$HOME/Desktop/$n.app"
    osascript -e "tell application \"Finder\" to make alias file to (POSIX file \"$APPS/$n.app\") at (path to desktop folder)" \
              -e "tell application \"Finder\" to set name of result to \"$n\"" >/dev/null 2>&1 \
      || cp -R "$APPS/$n.app" "$HOME/Desktop/"
  done
  echo "✓ desktop shortcuts: Market Desk, Market Desk Tools"
fi

# 4. Start at login.
if [ "$AUTOSTART" = 1 ]; then
  remove_login_item
  osascript -e "tell application \"System Events\" to make login item at end with properties {path:\"$APPS/Market Desk Autostart.app\", hidden:true, name:\"Market Desk Autostart\"}" >/dev/null
  echo "✓ login item: Market Desk Autostart (System Settings → General → Login Items to remove)"
fi

# 5. `desk` command for Terminal.
if [ "$ALIAS" = 1 ] && ! grep -q "$MARK" "$HOME/.zshrc" 2>/dev/null; then
  printf '\n%s\nalias desk='"'"'bash "%s"'"'"'\n# <<< market-desk <<<\n' "$MARK" "$CTL" >>"$HOME/.zshrc"
  echo "✓ added 'desk' command to ~/.zshrc (open a new Terminal tab, then: desk help)"
fi

case "$ROOT" in
  "$HOME/Desktop"*|"$HOME/Documents"*|"$HOME/Downloads"*)
    cat <<EOF

Heads-up: DeerFlow lives in a protected folder ($ROOT).
The first time each app runs, macOS asks whether it may access that folder. Click "Allow".
If autostart ever fails silently, open System Settings → Privacy & Security → Files and Folders
and make sure "Market Desk Autostart" is allowed. Moving the repo to ~/deer-flow avoids this
(then re-run this installer).
EOF
    ;;
esac

cat <<EOF

Done. Try it now: double-click "Market Desk" on your Desktop.
Tip: scheduled briefs only run while the Mac is awake. To wake it before the 08:40 brief:
  sudo pmset repeat wakeorpoweron MTWRF 08:25:00
EOF
