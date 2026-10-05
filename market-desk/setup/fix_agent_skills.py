#!/usr/bin/env python3
"""Remove per-agent skill whitelists so agents work with the local sandbox.

DeerFlow refuses to run an agent that has a `skills:` whitelist when the sandbox is the
LocalSandboxProvider with host bash enabled ("cannot enforce per-Agent skill filesystem
isolation"). Our skills need host bash (they run market_data.py), so agents must load all
enabled skills instead; each agent's SOUL already says which skills it should use.

Safe to run any time; only edits backend/.deer-flow/**/agents/*/config.yaml. Prints what it fixed.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def strip_skills(text: str) -> str | None:
    lines = text.splitlines(keepends=True)
    out, i, changed = [], 0, False
    while i < len(lines):
        if re.match(r"^skills\s*:", lines[i]):
            changed = True
            i += 1
            while i < len(lines) and (re.match(r"^\s+-|^-\s", lines[i]) or (lines[i].strip() == "" and i + 1 < len(lines) and re.match(r"^\s*-", lines[i + 1]))):
                i += 1
            continue
        out.append(lines[i])
        i += 1
    return "".join(out) if changed else None


def main() -> int:
    base = ROOT / "backend" / ".deer-flow"
    fixed = []
    if base.exists():
        for cfg in base.rglob("agents/*/config.yaml"):
            try:
                new = strip_skills(cfg.read_text(encoding="utf-8"))
                if new is not None:
                    cfg.write_text(new, encoding="utf-8")
                    fixed.append(cfg.parent.name)
            except OSError as e:
                print(f"! {cfg}: {e}", file=sys.stderr)
    if fixed:
        print("✓ 已为这些助手开放全部技能（修复“cannot enforce per-Agent skill filesystem isolation”）：" + "、".join(sorted(set(fixed))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
