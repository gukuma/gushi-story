#!/usr/bin/env bash
# Market Desk helper. Run from anywhere:  bash market-desk/desk.sh <command>
#   configure   patch config.yaml (scheduler, host bash, library mount) [after `make setup`; add --add-deepseek if no model]
#   seed        create the two custom agents + four scheduled tasks             [DeerFlow must be running]
#   dashboard   open the reading room on http://127.0.0.1:2027
#   data        check the market data providers
#   brief       print a live cross-asset snapshot in the terminal
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
  *) sed -n '2,9p' "$0" ;;
esac
