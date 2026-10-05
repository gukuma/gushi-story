#!/bin/bash
# 把整个 股市故事 项目上传到你的 GitHub（默认是私有仓库）。
#   bash market-desk/mac/publish-github.sh [仓库名] [--public] [--with-library]
# 第一次运行会帮你安装 gh 并登录 GitHub；以后再运行就是“提交并推送最新改动”。
# 永远不会上传：.env（API 密钥）、对话数据库、日志、编译产物。研报库默认也不上传（--with-library 才上传）。
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
NAME="gushi-story"; VIS="--private"; WITH_LIB=0
for a in "$@"; do
  case "$a" in
    --public) VIS="--public" ;;
    --with-library) WITH_LIB=1 ;;
    -*) echo "未知参数 $a"; exit 1 ;;
    *) NAME="$a" ;;
  esac
done

say() { printf '%s\n' "$*"; }
say "📈 准备上传到 GitHub：仓库名 $NAME（${VIS#--}）"

# 1. gh 命令行工具 + 登录
if ! command -v gh >/dev/null 2>&1; then
  command -v brew >/dev/null 2>&1 || { say "需要先安装 Homebrew：https://brew.sh"; exit 1; }
  say "→ 安装 GitHub 命令行工具 gh"; brew install gh
fi
if ! gh auth status >/dev/null 2>&1; then
  say "→ 登录 GitHub（会打开浏览器，按提示点授权）"
  gh auth login --hostname github.com --git-protocol https --web
fi
git config user.name >/dev/null 2>&1 || git config user.name "Eric Gu"
git config user.email >/dev/null 2>&1 || git config user.email "eric@arteliers.work"

# 2. 不该上传的东西写进 .gitignore
[ -d .git ] || git init -q
touch .gitignore
add_ignore() { grep -qxF "$1" .gitignore || echo "$1" >> .gitignore; }
add_ignore "# --- 股市故事: never commit secrets, data, logs, builds ---"
for p in ".env" ".env.*" "!.env.example" "backend/.deer-flow/" "logs/" "*.log" "market-desk/mac/settings.env" \
         "market-desk/ui/backup/" "market-desk/library/.trash/" "frontend/.next/" "node_modules/" ".venv/" \
         "__pycache__/" "config.yaml.bak*" "gushi-update.tgz" ".DS_Store" "MarketDesk-backups/"; do
  add_ignore "$p"
done
[ "$WITH_LIB" = 1 ] || add_ignore "market-desk/library/"

# 3. 再检查一遍：任何看起来像密钥的东西都不准上传
git add -A
LEAKS="$(git diff --cached --name-only -z | xargs -0 grep -lE '(sk-[A-Za-z0-9]{24,}|tvly-[A-Za-z0-9]{16,}|AKID[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{30,}|lsv2_[A-Za-z0-9_]{20,})' 2>/dev/null || true)"
if [ -n "$LEAKS" ]; then
  git reset -q
  say "✗ 这些文件里好像有 API 密钥，已停止上传（什么都没传）："
  say "$LEAKS"
  say "  把密钥移到 .env（运行 desk keys），文件里改成 \$变量名，再运行一次。"
  exit 1
fi

# 4. 提交并推送
if git diff --cached --quiet; then
  say "→ 没有新的改动需要提交"
else
  git commit -q -m "股市故事 update $(date '+%Y-%m-%d %H:%M')"
  say "→ 已提交：$(git log -1 --pretty=%s)"
fi
BR="$(git branch --show-current 2>/dev/null || echo main)"; [ -n "$BR" ] || BR=main
if git remote get-url origin >/dev/null 2>&1 && git remote get-url origin | grep -q "bytedance/deer-flow"; then
  git remote rename origin upstream && say "→ 原 DeerFlow 仓库改名为 upstream（以后可以 git pull upstream main 获取官方更新）"
fi
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin "$BR"
else
  gh repo create "$NAME" $VIS --source . --remote origin --push --description "📈 股市故事 — AI 投研助手（基于 DeerFlow）"
fi
URL="$(gh repo view --json url -q .url 2>/dev/null || git remote get-url origin)"
say "✓ 完成：$URL"
