#!/usr/bin/env bash
# 📈 股市故事 — 一键安装 / 启动。在 deer-flow 文件夹里运行：
#     bash market-desk/start-here.sh
# 每一步都会先检查，已经做过的会自动跳过，所以随时可以重新运行。
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
G='\033[32m'; Y='\033[33m'; R='\033[31m'; B='\033[1m'; N='\033[0m'
step() { printf "\n${B}▶ %s${N}\n" "$*"; }
ok()   { printf "  ${G}✓${N} %s\n" "$*"; }
warn() { printf "  ${Y}!${N} %s\n" "$*"; }
die()  { printf "  ${R}✗ %s${N}\n" "$*"; exit 1; }
[ "$(uname)" = "Darwin" ] || warn "这个脚本为 macOS 设计；其他系统请按 market-desk/README.md 手动操作。"
command -v deactivate >/dev/null 2>&1 && deactivate 2>/dev/null || true

step "1/9 检查必需工具（node、pnpm、uv、nginx）"
need_brew=()
command -v node  >/dev/null || need_brew+=(node)
command -v uv    >/dev/null || need_brew+=(uv)
command -v nginx >/dev/null || need_brew+=(nginx)
if [ ${#need_brew[@]} -gt 0 ]; then
  command -v brew >/dev/null || die "缺少 ${need_brew[*]}，并且没有 Homebrew。先安装 Homebrew：https://brew.sh"
  warn "安装缺少的工具：${need_brew[*]}"
  brew install "${need_brew[@]}" || die "brew 安装失败"
fi
command -v pnpm >/dev/null || { corepack enable 2>/dev/null || npm i -g pnpm; }
ok "node $(node -v) · pnpm $(pnpm -v 2>/dev/null) · $(uv --version) · nginx 已安装"

step "2/9 安装 DeerFlow 依赖"
[ -d .git ] || { git init -q && git add -A >/dev/null 2>&1 && git commit -qm "DeerFlow + 股市故事" >/dev/null 2>&1; ok "已初始化 git（DeerFlow 的安装步骤需要）"; }
if [ -x backend/.venv/bin/python ] && [ -d frontend/node_modules ]; then ok "依赖已安装"
else make install || die "make install 失败，请把上面的错误发给我"; fi

step "3/9 基本配置（config.yaml）"
if [ -f config.yaml ]; then ok "config.yaml 已存在"
else
  warn "接下来是 DeerFlow 的设置向导：模型选 DeepSeek；“Enable bash command execution?” 选 yes"
  make setup || die "make setup 未完成"
fi

step "4/9 打开投研台所需的开关，语言设为中文"
bash market-desk/desk.sh configure --lang zh | grep -E "^(->|ok|!!)" || true

step "5/9 API 密钥"
if grep -qE '^DEEPSEEK_API_KEY=sk-' .env 2>/dev/null || ! grep -q 'deepseek' config.yaml; then ok "模型密钥已设置（以后可在网页“API 密钥”页修改）"
else
  warn "还没有 DeepSeek 密钥。申请：https://platform.deepseek.com （其余密钥可直接回车跳过）"
  python3 market-desk/mac/keys.py set
fi

step "6/9 把界面改成 📈 股市故事（中文首页、研报中心、按股票分组的对话、教程模式）"
python3 market-desk/ui/apply_ui.py | grep -E "^(->|!!)|Done" || true

step "7/9 安装桌面图标、开机自启动（Safari）和 desk 命令"
if [ "$(uname)" = "Darwin" ]; then bash market-desk/mac/install.sh | grep -E "✓|!|Heads-up" || true; fi

step "8/9 启动（第一次需要构建前端，约 3–5 分钟）"
bash market-desk/mac/deskctl.sh start || die "启动失败，查看日志：bash market-desk/mac/deskctl.sh logs"

step "9/9 账号、智能体和定时任务"
python3 market-desk/setup/seed.py || warn "智能体/定时任务没有创建成功，可以稍后运行：bash market-desk/desk.sh seed"

printf "\n${G}${B}全部完成！${N} 正在用 Safari 打开 📈 股市故事 …\n"
printf "以后：开机会自动启动并打开 Safari；也可以双击桌面上的“📈 股市故事”。\n"
printf "看不懂某个按钮？在网页左下角打开“教程模式”。\n"
open -a Safari "http://localhost:2026/" 2>/dev/null || open "http://localhost:2026/" 2>/dev/null || true
