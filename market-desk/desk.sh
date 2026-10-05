#!/usr/bin/env bash
# Market Desk helper. Run from anywhere:  bash market-desk/desk.sh <command>
#   configure   patch config.yaml (scheduler, host bash, library mount) [after `make setup`; add --add-deepseek if no model]
#   seed        create the two custom agents + four scheduled tasks             [DeerFlow must be running]
#   dashboard   open the reading room on http://127.0.0.1:2027
#   data        check the market data providers
#   brief       print a live cross-asset snapshot in the terminal
#   account     create your DeerFlow login (first time) or check that your login works
#   reset-password   forgot the DeerFlow password? set a new one from the terminal
#   ui          apply the 📈 股市故事 web UI (ui --revert restores DeerFlow's original UI)
#   lang        show / switch desk language: lang en | zh | both  (agents, skills, schedules, dashboard)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="python3"
command -v uv >/dev/null 2>&1 && PYYAML=(uv run --quiet --no-project --with pyyaml python) || PYYAML=(python3)
DATA="$ROOT/skills/custom/market-data/scripts/market_data.py"

case "${1:-help}" in
  configure) "${PYYAML[@]}" "$ROOT/market-desk/setup/apply_config.py" "${@:2}" ;;
  seed)      $PY "$ROOT/market-desk/setup/seed.py" "${@:2}" ;;
  dashboard) $PY "$ROOT/market-desk/dashboard/server.py" --open "${@:2}" ;;
  data)      $PY "$DATA" doctor ;;
  brief)     $PY "$DATA" snapshot "${@:2}" ;;
  lang)      $PY "$ROOT/market-desk/setup/lang.py" "${@:2}" ;;
  ui)        $PY "$ROOT/market-desk/ui/apply_ui.py" "${@:2}" ;;
  account)   $PY "$ROOT/market-desk/setup/seed.py" --account-only ;;
  reset-password) (cd "$ROOT/backend" && PYTHONPATH=. uv run --no-sync python "$ROOT/market-desk/setup/reset_password.py") ;;
  *) sed -n '2,12p' "$0" ;;
esac
