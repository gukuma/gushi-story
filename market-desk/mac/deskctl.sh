#!/usr/bin/env bash
# deskctl — run and maintain the Market Desk (DeerFlow + dashboard) on macOS.
#
#   desk start            start DeerFlow (background) + dashboard, no browser
#   desk open             start if needed, then open DeerFlow and the dashboard
#   desk stop | restart   stop / restart everything (restart after editing config.yaml or .env)
#   desk status           what's running, model, scheduler, next scheduled run
#   desk logs [follow]    show recent logs (follow = live tail)
#
#   desk skills           list skills (custom + built-in)
#   desk edit [skill]     open a skill in your editor (no name = the custom skills folder)
#   desk new <name> ["description"]   create a new custom skill from the template and open it
#   desk check            validate every custom skill (front matter, names, script syntax)
#   desk watchlist        edit market-desk/library/watchlist.yaml
#   desk config           edit config.yaml (then: desk restart)
#   desk keys             enter API keys interactively (hidden), saved to .env
#   desk keys show|test   which keys are set / check the DeepSeek key and search setup
#   desk search <name>    switch web search: tavily | tencent | infoquest | ddg | brave | serper
#   desk env              edit .env by hand (then: desk restart)
#   desk library          open the research library in Finder
#   desk lang [en|zh|both]  show / switch desk language (agents, skills, schedules, dashboard)
#   desk brief            live cross-asset snapshot in the terminal
#   desk backup           zip library + custom skills + config to ~/MarketDesk-backups
#
# Settings live in market-desk/mac/settings.env (written by install.sh):
#   MODE=prod|dev   OPEN_DASHBOARD=1|0   EDITOR_APP="Visual Studio Code"   SAVED_PATH=...

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DESK="$ROOT/market-desk"
SKILLS="$ROOT/skills/custom"
LOGS="$ROOT/logs"
UI_URL="http://localhost:2026"
DASH_URL="http://127.0.0.1:2027"

MODE="prod"; OPEN_DASHBOARD="1"; EDITOR_APP=""; SAVED_PATH=""
[ -f "$HERE/settings.env" ] && . "$HERE/settings.env"
# Login items and app bundles start with a bare PATH; restore the one captured at install time.
export PATH="${SAVED_PATH:+$SAVED_PATH:}/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p "$LOGS"

QUIET=0
for a in "$@"; do [ "$a" = "--quiet" ] && QUIET=1; done

say()    { [ "$QUIET" = 1 ] || echo "$*"; }
notify() { osascript -e "display notification \"$1\" with title \"Market Desk\"" >/dev/null 2>&1 || true; }
code_of() { curl -s -o /dev/null -m 3 -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
is_up()  { [ "$(code_of "$1")" != "000" ]; }
deerflow_up()  { is_up "http://127.0.0.1:2026/"; }
gateway_up()   { [ "$(code_of http://127.0.0.1:8001/health)" = "200" ]; }
dashboard_up() { [ "$(code_of "$DASH_URL/api/overview")" = "200" ]; }

open_in_editor() {
  local target="$1"
  if [ -n "$EDITOR_APP" ]; then open -a "$EDITOR_APP" "$target"; return; fi
  if command -v code >/dev/null 2>&1; then code "$target"; return; fi
  if command -v cursor >/dev/null 2>&1; then cursor "$target"; return; fi
  for app in "Visual Studio Code" "Cursor" "Zed" "Sublime Text" "BBEdit"; do
    if [ -d "/Applications/$app.app" ] || [ -d "$HOME/Applications/$app.app" ]; then open -a "$app" "$target"; return; fi
  done
  if [ -d "$target" ]; then open "$target"; else open -t "$target"; fi   # Finder / TextEdit
}

start_dashboard() {
  dashboard_up && return 0
  nohup python3 "$DESK/dashboard/server.py" --port 2027 </dev/null >>"$LOGS/dashboard.log" 2>&1 &
  echo $! >"$LOGS/dashboard.pid"
  for _ in 1 2 3 4 5 6 7 8 9 10; do dashboard_up && return 0; sleep 0.5; done
  return 1
}

stop_dashboard() {
  if [ -f "$LOGS/dashboard.pid" ]; then kill "$(cat "$LOGS/dashboard.pid")" 2>/dev/null || true; rm -f "$LOGS/dashboard.pid"; fi
  pkill -f "market-desk/dashboard/server.py" 2>/dev/null || true
}

start() {
  if [ ! -f "$ROOT/config.yaml" ]; then
    say "No config.yaml yet. Run 'make setup' and 'bash market-desk/desk.sh configure' first."
    notify "Not set up yet: run make setup"; return 1
  fi
  if deerflow_up; then
    say "DeerFlow already running at $UI_URL"
  else
    local flags=(--daemon)
    if [ -x "$ROOT/backend/.venv/bin/python" ] && [ -d "$ROOT/frontend/node_modules" ]; then flags+=(--skip-install); fi
    if [ "$MODE" = "dev" ]; then flags+=(--dev)
    else flags+=(--prod); [ -d "$ROOT/frontend/.next" ] && [ -f "$ROOT/frontend/.next/BUILD_ID" ] && flags+=(--skip-frontend-build)
    fi
    say "Starting DeerFlow (${flags[*]}) — first start builds the frontend and can take a few minutes…"
    echo "=== $(date '+%F %T') start ${flags[*]}" >>"$LOGS/desk.log"
    if ! (cd "$ROOT" && bash scripts/serve.sh "${flags[@]}") </dev/null >>"$LOGS/desk.log" 2>&1; then
      say "DeerFlow failed to start. See: $LOGS/desk.log"; notify "DeerFlow failed to start — see logs"; return 1
    fi
  fi
  start_dashboard || say "Dashboard did not come up; see $LOGS/dashboard.log"
  say "Ready: DeerFlow $UI_URL · Dashboard $DASH_URL"
  [ "$QUIET" = 1 ] && notify "Running · DeerFlow :2026 · Dashboard :2027"
  return 0
}

stop() {
  say "Stopping…"
  (cd "$ROOT" && bash scripts/serve.sh --stop) </dev/null >>"$LOGS/desk.log" 2>&1 || true
  stop_dashboard
  say "Stopped."
}

status() {
  local ok="✓" no="✗"
  echo "Market Desk — $(date '+%a %d %b %H:%M')"
  echo "  $(deerflow_up && echo $ok || echo $no) DeerFlow UI      $UI_URL"
  echo "  $(gateway_up && echo $ok || echo $no) Gateway API     :8001"
  echo "  $(dashboard_up && echo $ok || echo $no) Dashboard       $DASH_URL"
  if dashboard_up; then
    python3 - "$(curl -s -m 5 "$DASH_URL/api/overview")" <<'PY' 2>/dev/null || true
import json, sys
o = json.loads(sys.argv[1])
c = o.get("config", {})
yn = lambda v: "on" if v else "OFF"
model = (c.get("models") or ["none"])[0]
print("  model: %s   scheduler: %s   host bash: %s   library mount: %s" % (model, yn(c.get("scheduler")), yn(c.get("host_bash")), yn(c.get("library_mount"))))
import datetime as dt
nxt = o.get("next_run")
if nxt:
    nxt = dt.datetime.fromisoformat(nxt.replace("Z", "+00:00")).astimezone().strftime("%a %d %b %H:%M")
print("  schedules: %s/%s active, %s with errors, next run %s" % (o["tasks_active"], o["tasks_total"], o["tasks_failing"], nxt or "-"))
print("  reports (7d): %s   tokens (7d): {:,}   failed runs (7d): %s   open calls: %s".format(o["tokens_7d"]) % (o["reports_7d"], o["failed_runs_7d"], o["calls_open"]))
PY
  fi
  echo "  mode: $MODE   logs: $LOGS"
}

logs() {
  local files=("$LOGS/desk.log" "$LOGS/gateway.log" "$LOGS/frontend.log" "$LOGS/nginx.log" "$LOGS/dashboard.log")
  if [ "${1:-}" = "follow" ]; then tail -n 30 -F "${files[@]}" 2>/dev/null; return; fi
  if [ "${1:-}" = "open" ] || [ ! -t 1 ]; then open "$LOGS"; return; fi
  for f in "${files[@]}"; do [ -f "$f" ] && { echo "── $(basename "$f")"; tail -n 15 "$f"; }; done
}

skills() {
  python3 - "$ROOT/skills" "${1:-}" <<'PY'
import re, sys
from pathlib import Path
root, mode = Path(sys.argv[1]), sys.argv[2]
rows = []
for kind in ("custom", "public"):
    for md in sorted((root / kind).glob("*/SKILL.md")):
        t = md.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"(?m)^description:\s*(.+)$", t)
        rows.append((kind, md.parent.name, (m.group(1).strip() if m else "")[:90]))
if mode == "--names":
    print("\n".join(n for k, n, _ in rows if k == "custom") + "\n" + "\n".join(n for k, n, _ in rows if k == "public"))
else:
    for k, n, d in rows:
        print(f"{'★' if k == 'custom' else ' '} {n:28} {d}")
    print("\n★ = your custom skills (skills/custom). Edit with: desk edit <name>")
PY
}

edit_skill() {
  local name="${1:-}"
  if [ -z "$name" ]; then open_in_editor "$SKILLS"; return; fi
  for kind in custom public; do
    if [ -f "$ROOT/skills/$kind/$name/SKILL.md" ]; then
      [ "$kind" = public ] && say "Note: '$name' is a built-in skill; DeerFlow updates may overwrite edits. Copy it to skills/custom/ to customise safely."
      open_in_editor "$ROOT/skills/$kind/$name"; return
    fi
  done
  say "No skill named '$name'. See: desk skills"; return 1
}

new_skill() {
  local name="${1:-}" desc="${2:-}"
  if ! [[ "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || [ ${#name} -gt 64 ]; then
    say "Skill names are lowercase-with-hyphens, max 64 chars (e.g. 'earnings-preview')."; return 1
  fi
  local dir="$SKILLS/$name"
  if [ -e "$dir" ]; then say "skills/custom/$name already exists — opening it."; open_in_editor "$dir"; return; fi
  mkdir -p "$dir"
  [ -z "$desc" ] && desc="TODO: one or two sentences on what this skill does and the phrases or situations that should trigger it."
  desc="${desc//</}"; desc="${desc//>/}"
  sed -e "s|__NAME__|$name|g" -e "s|__DESCRIPTION__|${desc//|/-}|g" "$HERE/skill-template.md" >"$dir/SKILL.md"
  say "Created skills/custom/$name/SKILL.md"
  open_in_editor "$dir/SKILL.md"
}

check() {
  python3 - "$SKILLS" <<'PY'
import re, sys
from pathlib import Path
ALLOWED = {"name", "description", "license", "allowed-tools", "argument-hint", "required-secrets", "secrets-autonomous", "metadata"}
bad = 0
for md in sorted(Path(sys.argv[1]).glob("*/SKILL.md")):
    t = md.read_text(encoding="utf-8", errors="replace")
    problems = []
    m = re.match(r"^---\n(.*?)\n---\n", t, re.S)
    if not m:
        problems.append("missing front matter (--- block at the top)")
    else:
        keys, fm = set(), {}
        for line in m.group(1).splitlines():
            km = re.match(r"^([A-Za-z][\w-]*):\s*(.*)$", line)
            if km:
                keys.add(km.group(1)); fm[km.group(1)] = km.group(2).strip().strip("'\"")
        if keys - ALLOWED: problems.append(f"unexpected keys: {', '.join(sorted(keys - ALLOWED))}")
        name, desc = fm.get("name", ""), fm.get("description", "")
        if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name): problems.append(f"bad name {name!r}")
        if name != md.parent.name: problems.append(f"name {name!r} != folder {md.parent.name!r}")
        if not desc or desc.startswith("TODO"): problems.append("description missing or still TODO")
        if "<" in desc or ">" in desc: problems.append("description contains < or >")
        if len(desc) > 1024: problems.append(f"description too long ({len(desc)} > 1024)")
    for py in md.parent.rglob("*.py"):
        try: compile(py.read_text(encoding="utf-8", errors="replace"), str(py), "exec")
        except SyntaxError as e: problems.append(f"{py.name}: syntax error line {e.lineno}: {e.msg}")
    bad += bool(problems)
    print(("✗ " if problems else "✓ ") + md.parent.name + ("" if not problems else "\n    - " + "\n    - ".join(problems)))
sys.exit(1 if bad else 0)
PY
}

backup() {
  local dest="$HOME/MarketDesk-backups"; mkdir -p "$dest"
  local f="$dest/market-desk-$(date +%Y%m%d-%H%M).zip"
  (cd "$ROOT" && zip -qr "$f" market-desk/library skills/custom config.yaml extensions_config.json 2>/dev/null \
     -x '*/__pycache__/*' '*.pyc') && say "Backed up to $f (API keys in .env are NOT included)"
}

cmd="${1:-help}"; shift || true
args=(); for a in "$@"; do [ "$a" = "--quiet" ] || args+=("$a"); done
set -- "${args[@]+"${args[@]}"}"
case "$cmd" in
  start)     start ;;
  open)      start && { open "$UI_URL/workspace"; [ "$OPEN_DASHBOARD" = 1 ] && open "$DASH_URL"; true; } ;;
  zh)        start_dashboard && open "$DASH_URL/zh" ;;
  dashboard) start_dashboard && open "$DASH_URL" ;;
  stop)      stop ;;
  restart)   stop; sleep 1; start ;;
  status)    status ;;
  logs)      logs "${1:-}" ;;
  skills)    skills "${1:-}" ;;
  edit)      edit_skill "${1:-}" ;;
  new)       new_skill "${1:-}" "${2:-}" ;;
  check)     check ;;
  watchlist) open_in_editor "$DESK/library/watchlist.yaml" ;;
  config)    open_in_editor "$ROOT/config.yaml" ;;
  env)       [ -f "$ROOT/.env" ] || cp "$ROOT/.env.example" "$ROOT/.env"; open_in_editor "$ROOT/.env" ;;
  library)   open "$DESK/library" ;;
  keys)      python3 "$HERE/keys.py" "${1:-set}" ;;
  lang)      python3 "$DESK/setup/lang.py" "$@" ;;
  search)    python3 "$HERE/keys.py" search "${1:-}" ;;
  brief)     python3 "$ROOT/skills/custom/market-data/scripts/market_data.py" snapshot "$@" ;;
  backup)    backup ;;
  *)         sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//' ;;
esac
