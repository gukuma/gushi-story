#!/usr/bin/env python3
"""Turn the DeerFlow web UI into 📈 股市故事 (Mandarin, stock-focused). Idempotent and reversible.

  python3 market-desk/ui/apply_ui.py            # apply (safe to re-run after DeerFlow updates)
  python3 market-desk/ui/apply_ui.py --check    # show what would change, write nothing
  python3 market-desk/ui/apply_ui.py --revert   # restore the original DeerFlow files

What it does:
  - copies new files from market-desk/ui/overlay/frontend/ into frontend/ (home page, 研报中心,
    API 密钥 page, sidebar pieces, tutorial mode, 📈 icons)
  - edits a handful of DeerFlow files in place (Chinese by default, name/title, sidebar, /desk proxy)
Originals are saved once under market-desk/ui/backup/ before anything is touched.
If DeerFlow changed a file so an edit no longer matches, that edit is skipped and reported; the
rest still applies.
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
FE = REPO / "frontend"
OVERLAY = HERE / "overlay" / "frontend"
BACKUP = HERE / "backup"
NAME = "📈 股市故事"

# (path relative to frontend/, [(old, new) or (regex, new, "re")])
EDITS: list[tuple[str, list[tuple]]] = [
    ("src/core/i18n/locale.ts", [
        ('export const DEFAULT_LOCALE: Locale = "en-US";', 'export const DEFAULT_LOCALE: Locale = "zh-CN"; // 股市故事: Mandarin by default'),
        ("export function normalizeLocale(locale: string | null | undefined): Locale {",
         "export function normalizeLocale(_locale?: string | null): Locale {\n"
         "  return \"zh-CN\"; // 股市故事: always Mandarin\n}\n\n"
         "export function normalizeLocaleOriginal(locale: string | null | undefined): Locale {"),
    ]),
    ("src/app/layout.tsx", [
        ('import "@/styles/globals.css";', 'import "@/styles/globals.css";\nimport "@/styles/stock-story-theme.css";'),
        ('title: "DeerFlow",', f'title: "{NAME}",'),
        ('description: "A LangChain-based framework for building super agents.",', 'description: "A股、港股与宏观的 AI 投研台",'),
    ]),
    # "/" is now the 股市故事 dashboard, not DeerFlow's dark marketing page: stop forcing dark there.
    ("src/components/theme-provider.tsx", [
        ('forcedTheme={pathname === "/" ? "dark" : undefined}', 'forcedTheme={pathname.startsWith("/blog") ? "dark" : undefined}'),
    ]),
    ("src/components/workspace/workspace-header.tsx", [
        (r">\s*DF\s*<", ">📈<", "re"),
        (r">\s*DeerFlow\s*<", f">{NAME}<", "re"),
        ('isActive={pathname === "/workspace/chats/new"}', 'isActive={pathname.endsWith("/chats/new")}'),
        ('href="/workspace/chats/new"', 'href="/workspace/agents/market-analyst-zh/chats/new"'),
    ]),
    # 设置和更多: your website + email instead of DeerFlow's site / GitHub / issues / support mail
    ("src/components/workspace/workspace-nav-menu.tsx", [
        (r'\s*<a\s+href="https://github.com/bytedance/deer-flow"\s+target="_blank"\s+rel="noopener noreferrer"\s*>\s*<DropdownMenuItem>\s*<GithubIcon />\s*\{t\.workspace\.visitGithub\}\s*</DropdownMenuItem>\s*</a>', "", "re"),
        (r'\s*<a\s+href="https://github.com/bytedance/deer-flow/issues"\s+target="_blank"\s+rel="noopener noreferrer"\s*>\s*<DropdownMenuItem>\s*<BugIcon />\s*\{t\.workspace\.reportIssue\}\s*</DropdownMenuItem>\s*</a>', "", "re"),
        ('href="https://deerflow.tech/"', 'href="https://arteliers.work"'),
        ('{t.workspace.officialWebsite}', '访问 arteliers.work'),
        ('<a href="mailto:support@deerflow.tech">', '<a href="mailto:eric@arteliers.work">'),
        ('{t.workspace.contactUs}', '联系作者 eric@arteliers.work'),
        ('import { GithubIcon } from "./github-icon";\n', ''),
        ('  BugIcon,\n', ''),
    ]),
    ("src/components/workspace/workspace-container.tsx", [
        (r'\n\s*<div className="pr-4">\s*<Tooltip content=\{t\.workspace\.githubTooltip\}>.*?</Tooltip>\s*</div>', "", "re"),
        # drop our earlier breadcrumb lines first, so changing the list never duplicates them
        (r'\n  if \(segment === "(?:reports|themes|stocks|health|keys|scheduled-tasks|agents)"\) return "[^"]*";', "", "re"),
        ('  if (segment === "chats") return t.breadcrumb.chats;',
         '  if (segment === "chats") return t.breadcrumb.chats;\n'
         '  if (segment === "reports") return "研报";\n'
         '  if (segment === "themes") return "项目";\n'
         '  if (segment === "stocks") return "股票";\n'
         '  if (segment === "health") return "系统状态";\n'
         '  if (segment === "keys") return "API 密钥";\n'
         '  if (segment === "scheduled-tasks") return "定时任务";\n'
         '  if (segment === "agents") return "助手";'),
        ('import { GithubIcon } from "./github-icon";\n', ""),
        ('import { Tooltip } from "./tooltip";\n', ""),
    ]),
    ("src/core/i18n/locales/zh-CN.ts", [
        ('appName: "DeerFlow"', f'appName: "{NAME}"'),
        ("🦌 DeerFlow", NAME),
        ("DeerFlow", "股市故事"),
    ]),
    ("src/core/i18n/locales/en-US.ts", [
        ('appName: "DeerFlow"', f'appName: "{NAME}"'),
    ]),
    ("src/core/artifacts/viewer.ts", [
        ("- DeerFlow` : \"DeerFlow\"", f"- {NAME}` : \"{NAME}\""),
    ]),
    ("src/app/(auth)/login/page.tsx", [(r">\s*DeerFlow\s*</h1>", f">{NAME}</h1>", "re")]),
    ("src/app/(auth)/setup/page.tsx", [(r">\s*DeerFlow\s*</h1>", f">{NAME}</h1>", "re")]),
    ("next.config.js", [
        ("    return rewrites;\n  },",
         "    // 📈 股市故事: Market Desk data service (reports, quotes, conversations by ticker, keys)\n"
         "    rewrites.unshift({\n"
         "      source: \"/desk/:path*\",\n"
         "      destination: `${process.env.MARKET_DESK_URL ?? \"http://127.0.0.1:2027\"}/:path*`,\n"
         "      locale: false,\n"
         "    });\n"
         "    return rewrites;\n  },"),
    ]),
]
REPLACE_WHOLE = {"src/components/workspace/workspace-sidebar.tsx": HERE / "workspace-sidebar.tsx"}


def backup(rel: str) -> None:
    src = FE / rel
    dst = BACKUP / rel
    if src.exists() and not dst.exists():
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    elif not src.exists() and not (BACKUP / (rel + ".absent")).exists():
        (BACKUP / (rel + ".absent")).parent.mkdir(parents=True, exist_ok=True)
        (BACKUP / (rel + ".absent")).write_text("")


def apply(check: bool) -> int:
    if not FE.exists():
        print("frontend/ not found next to market-desk/ — run this inside the deer-flow folder.")
        return 1
    problems = 0
    # 1. overlay files
    for src in sorted(OVERLAY.rglob("*")):
        if src.is_dir():
            continue
        rel = str(src.relative_to(OVERLAY))
        dst = FE / rel
        same = dst.exists() and dst.read_bytes() == src.read_bytes()
        print(f"{'ok ' if same else '-> '}{rel}")
        if not same and not check:
            backup(rel)
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
    for rel, src in REPLACE_WHOLE.items():
        dst = FE / rel
        same = dst.exists() and dst.read_bytes() == src.read_bytes()
        print(f"{'ok ' if same else '-> '}{rel} (replaced)")
        if not same and not check:
            backup(rel)
            shutil.copy2(src, dst)
    # 2. in-place edits
    for rel, edits in EDITS:
        path = FE / rel
        if not path.exists():
            print(f"!! {rel}: file missing, skipped")
            problems += 1
            continue
        text = path.read_text(encoding="utf-8")
        orig = text
        for e in edits:
            old, new = e[0], e[1]
            if len(e) > 2 and e[2] == "re":
                if not re.search(old, text, re.S):
                    if new == "" or new in text:
                        continue  # already applied
                    n, text2 = 0, text
                else:
                    text2, n = re.subn(old, new, text, flags=re.S)
            else:
                if old in new:  # edit extends the old text: done if the new text is present
                    if new in text:
                        continue
                elif old not in text:
                    if new in text:
                        continue  # already applied

                n = text.count(old)
                text2 = text.replace(old, new)
            if n == 0:
                print(f"!! {rel}: pattern not found (DeerFlow may have changed): {old[:60]!r}")
                problems += 1
            text = text2
        if text != orig:
            print(f"-> {rel} (edited)")
            if not check:
                backup(rel)
                path.write_text(text, encoding="utf-8")
        else:
            print(f"ok {rel}")
    print("\n" + ("Check only — nothing written." if check else
                  "Done. Restart DeerFlow (desk restart) — the frontend rebuilds on the next start."))
    if problems:
        print(f"{problems} edit(s) skipped; the UI still works, but check the lines marked !!.")
    return 0


def revert() -> int:
    if not BACKUP.exists():
        print("Nothing to revert.")
        return 0
    for f in sorted(BACKUP.rglob("*")):
        if f.is_dir():
            continue
        rel = str(f.relative_to(BACKUP))
        if rel.endswith(".absent"):
            target = FE / rel[: -len(".absent")]
            if target.exists():
                target.unlink()
                print(f"<- removed {target.relative_to(FE)}")
        else:
            shutil.copy2(f, FE / rel)
            print(f"<- restored {rel}")
    shutil.rmtree(BACKUP)
    print("Original DeerFlow UI restored. Restart DeerFlow.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--revert", action="store_true")
    a = ap.parse_args()
    return revert() if a.revert else apply(a.check)


if __name__ == "__main__":
    sys.exit(main())
