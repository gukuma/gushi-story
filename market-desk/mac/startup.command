#!/bin/bash
# 📈 股市故事 — 开机启动脚本（登录后自动在“终端”里打开，也可以双击运行）。
#   1. 套用 股市故事 界面          2. 启动投研数据服务（端口 2027）
#   3. 启动 DeerFlow（端口 2026）  4. 预热所有页面，然后 Safari 打开 http://localhost:2026/
#
# 两种模式（market-desk/mac/settings.env 里的 MODE，或运行 desk mode prod|dev）：
#   prod（默认，快）：用编译好的网页，打开每个页面都很快。界面代码有变化时自动重新编译一次（3–5 分钟）。
#   dev （改代码时用）：make dev，改代码自动刷新，但每个页面第一次打开要编译，比较慢。
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
CTL="$HERE/deskctl.sh"
UI="http://localhost:2026"
MODE="prod"; BROWSER_APP="Safari"; SAVED_PATH=""
[ -f "$HERE/settings.env" ] && . "$HERE/settings.env"
export PATH="${SAVED_PATH:+$SAVED_PATH:}/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin"
cd "$ROOT" || exit 1
printf '\033]0;📈 股市故事\007'
echo "📈 股市故事 正在启动（模式：$MODE）  $ROOT"

code_of() { curl -s -o /dev/null -m 60 -w '%{http_code}' "$1" 2>/dev/null || echo 000; }
ready() { local c; c=$(code_of "$UI/login"); [ "$c" != "000" ] && [ "${c:0:1}" != "5" ]; }
open_ui() { if open -Ra "$BROWSER_APP" 2>/dev/null; then open -a "$BROWSER_APP" "$UI/"; else open "$UI/"; fi; }
warm() {  # load every page once so the first click is instant (in dev mode this triggers the compile)
  echo "→ 预热页面…"
  for p in /login / /workspace/reports /workspace/themes "/workspace/stocks?code=sh600519" /workspace/chats \
           /workspace/scheduled-tasks /workspace/keys /workspace/agents/market-analyst-zh/chats/new; do
    printf '   %-45s' "$p"; code_of "$UI$p"; echo
  done
}
wait_ready() {
  printf '→ 等待网页就绪'
  for _ in $(seq 1 300); do ready && { echo " ✓"; return 0; }; printf '.'; sleep 2; done
  echo; echo "! 10 分钟还没就绪，看 logs/desk.log 和 logs/frontend.log"; return 1
}

echo "→ 1/3 套用界面"
python3 market-desk/ui/apply_ui.py >/dev/null 2>&1 || echo "  ! 界面补丁未完全套用（desk ui --check 查看）"
echo "→ 2/3 启动投研数据服务"
bash "$CTL" data --quiet || echo "  ! 数据服务没起来，看 logs/dashboard.log"

if ready; then
  echo "✓ DeerFlow 已经在运行"
  open_ui
  echo "（这个窗口可以关掉）"
  exit 0
fi

if [ "$MODE" = "dev" ]; then
  echo "→ 3/3 make dev（开发模式：每个页面第一次打开需要编译）"
  bash "$CTL" free --quiet   # a background (prod) DeerFlow would block the dev ports
  ( wait_ready && warm && open_ui && echo "✓ 已在浏览器打开。关闭这个窗口会停止 DeerFlow。" ) &
  exec make dev
fi

echo "→ 3/3 启动 DeerFlow（快速模式）。界面有更新时会先编译，大约 3–5 分钟，进度如下："
touch logs/desk.log
tail -n 0 -f logs/desk.log &
TAIL=$!
bash "$CTL" start
rc=$?
kill $TAIL 2>/dev/null
[ $rc -ne 0 ] && { echo "! 启动失败，看 logs/desk.log"; exit 1; }
wait_ready && warm && open_ui
echo "✓ 股市故事 已在后台运行，这个窗口可以关掉。停止：desk stop"
