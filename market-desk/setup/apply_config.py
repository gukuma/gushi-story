#!/usr/bin/env python3
"""Patch DeerFlow's config.yaml for the Market Desk. Run AFTER `make setup` created config.yaml.

What it changes (each step is skipped if already done; a timestamped backup is written first):
  1. scheduler.enabled: true            -> scheduled briefs actually fire
  2. agents_api.enabled: true           -> seed.py can create the custom agents
  3. sandbox.allow_host_bash: true      -> skills can run their Python scripts (local sandbox only;
                                           fine for a single-user machine, see README)
  4. sandbox.mounts += library          -> /mnt/library = market-desk/library (shared across threads)
  5. tools += bash (if missing)          -> `make setup` drops the bash tool unless you opted in
  6. --add-deepseek                     -> inserts a DeepSeek model as the FIRST (default) model

Works on both a commented config copied from config.example.yaml and the compact file that
`make setup` writes. If PyYAML is importable the result is parsed back and verified.

Usage:
  python3 market-desk/setup/apply_config.py [--config config.yaml] [--add-deepseek] [--dry-run]
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
LIBRARY = REPO / "market-desk" / "library"

DEEPSEEK_BLOCK = """# Added by market-desk/setup/apply_config.py — default model for the Market Desk
- name: deepseek-v4
  display_name: DeepSeek V4 (Thinking)
  use: deerflow.models.patched_deepseek:PatchedChatDeepSeek
  model: deepseek-v4-pro
  api_key: $DEEPSEEK_API_KEY
  timeout: 600.0
  max_retries: 2
  max_tokens: 8192
  supports_thinking: true
  supports_vision: false
  when_thinking_enabled:
    extra_body:
      thinking:
        type: enabled
  when_thinking_disabled:
    extra_body:
      thinking:
        type: disabled
"""


def set_flag_in_block(text: str, block: str, key: str, value: str, log: list[str]) -> str:
    """Set `key: value` inside a top-level `block:` mapping (first uncommented occurrence)."""
    m = re.search(rf"(?m)^{re.escape(block)}:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)", text)
    if not m:
        log.append(f"!! no top-level '{block}:' block found — add `{block}: {{{key}: {value}}}` by hand")
        return text
    body = m.group(1)
    km = re.search(rf"(?m)^(  {re.escape(key)}:\s*)(\S+)(.*)$", body)
    if km:
        if km.group(2) == value:
            log.append(f"ok {block}.{key} already {value}")
            return text
        new_body = body[: km.start()] + km.group(1) + value + km.group(3) + body[km.end():]
        log.append(f"-> {block}.{key}: {km.group(2)} -> {value}")
    else:
        new_body = f"  {key}: {value}\n" + body
        log.append(f"-> {block}.{key}: added ({value})")
    return text[: m.start(1)] + new_body + text[m.end(1):]


def add_mount(text: str, log: list[str]) -> str:
    lib = str(LIBRARY)
    if "container_path: /mnt/library" in text:
        log.append("ok sandbox mount /mnt/library already present")
        return text
    m = re.search(r"(?m)^sandbox:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)", text)
    if not m:
        log.append("!! no sandbox block; mount not added")
        return text
    body = m.group(1)
    if "LocalSandboxProvider" not in body:
        log.append("!! sandbox is not LocalSandboxProvider; add the /mnt/library mount by hand (see README)")
        return text
    entry = (
        f"    - host_path: {lib}   # market-desk research library\n"
        f"      container_path: /mnt/library\n"
        f"      read_only: false\n"
    )
    um = re.search(r"(?m)^  mounts:\s*\n", body)
    if um:  # existing uncommented mounts list: append first in list
        new_body = body[: um.end()] + entry + body[um.end():]
    else:
        am = re.search(r"(?m)^  allow_host_bash:.*\n", body)
        at = am.end() if am else 0
        new_body = body[:at] + "  mounts:\n" + entry + body[at:]
    log.append(f"-> sandbox.mounts: {lib} -> /mnt/library")
    return text[: m.start(1)] + new_body + text[m.end(1):]


def list_indent(text: str, key: str) -> str:
    """Indent used by list items under a top-level key ('' for yaml.safe_dump style, '  ' for the example)."""
    m = re.search(rf"(?m)^{key}:[ \t]*\n(?:[ \t]*#.*\n|[ \t]*\n)*([ \t]*)- ", text)
    return m.group(1) if m else "  "


def indent_block(block: str, ind: str) -> str:
    return "".join(ind + ln if ln.strip() else ln for ln in block.splitlines(keepends=True))


def add_bash_tool(text: str, log: list[str]) -> str:
    if "deerflow.sandbox.tools:bash_tool" in text and re.search(r"(?m)^[ \t]*use:\s*deerflow\.sandbox\.tools:bash_tool", text):
        log.append("ok bash tool present")
        return text
    m = re.search(r"(?m)^tools:[ \t]*\n", text)
    if not m:
        log.append("!! no 'tools:' key; add the bash tool by hand")
        return text
    ind = list_indent(text, "tools")
    entry = indent_block("- name: bash\n  group: bash\n  use: deerflow.sandbox.tools:bash_tool\n", ind)
    log.append("-> tools: added bash tool")
    return text[: m.end()] + entry + text[m.end():]


def add_deepseek(text: str, log: list[str]) -> str:
    if re.search(r"(?m)^[ \t]*- name: deepseek-v4\s*$", text):
        log.append("ok deepseek-v4 model already present")
        return text
    m = re.search(r"(?m)^models:[ \t]*(\[\])?[ \t]*\n", text)
    if not m:
        log.append("!! no 'models:' key found; DeepSeek not added")
        return text
    replacement = "models:\n" + indent_block(DEEPSEEK_BLOCK, list_indent(text, "models"))
    log.append("-> models: inserted deepseek-v4 as first (default) model; set DEEPSEEK_API_KEY in .env")
    return text[: m.start()] + replacement + text[m.end():]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", default=str(REPO / "config.yaml"))
    ap.add_argument("--add-deepseek", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--lang", choices=["en", "zh", "both"], help="desk language: en, zh (中文) or both; asked interactively if omitted")
    a = ap.parse_args()

    # Desk language (market-desk/settings.json): which agents/skills/schedules are active.
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from seed import get_language, set_language
    lang = a.lang
    if lang is None and sys.stdin.isatty() and not a.dry_run:
        cur = get_language()
        ans = input(f"Desk language — en (English), zh (中文), both (parallel) [{cur}]: ").strip().lower()
        lang = {"cn": "zh", "中文": "zh", "": cur}.get(ans, ans)
        if lang not in ("en", "zh", "both"):
            print(f"  '{ans}' not recognised; keeping {cur}")
            lang = cur
    if lang and not a.dry_run:
        set_language(lang)
        print(f"ok desk language: {lang} (market-desk/settings.json; schedules sync when you run desk.sh seed)\n")

    cfg = Path(a.config)
    if not cfg.exists():
        print(f"{cfg} not found. Run `make setup` (or `make config`) first.", file=sys.stderr)
        return 1
    LIBRARY.mkdir(parents=True, exist_ok=True)
    (LIBRARY / "reports").mkdir(exist_ok=True)

    before = cfg.read_text(encoding="utf-8")
    text, log = before, []
    text = set_flag_in_block(text, "scheduler", "enabled", "true", log)
    text = set_flag_in_block(text, "agents_api", "enabled", "true", log)
    text = set_flag_in_block(text, "sandbox", "allow_host_bash", "true", log)
    text = add_mount(text, log)
    text = add_bash_tool(text, log)
    if a.add_deepseek:
        text = add_deepseek(text, log)

    try:
        import yaml  # type: ignore
    except ImportError:
        yaml = None
    if yaml is not None:
        try:
            c = yaml.safe_load(text)
            problems = []
            if not (c.get("scheduler") or {}).get("enabled"):
                problems.append("scheduler.enabled")
            if not (c.get("sandbox") or {}).get("allow_host_bash"):
                problems.append("sandbox.allow_host_bash")
            if not any(mm.get("container_path") == "/mnt/library" for mm in (c.get("sandbox") or {}).get("mounts") or []):
                problems.append("sandbox.mounts /mnt/library")
            if not any(t.get("name") == "bash" for t in c.get("tools") or []):
                problems.append("tools: bash")
            if a.add_deepseek and (c.get("models") or [{}])[0].get("name") != "deepseek-v4":
                problems.append("models[0] deepseek-v4")
            if problems:
                print("!! patched file parses but these did not take effect: " + ", ".join(problems), file=sys.stderr)
                return 2
            log.append("ok verified with PyYAML")
        except yaml.YAMLError as e:
            print(f"!! patch produced invalid YAML, nothing written: {e}", file=sys.stderr)
            return 2
    else:
        log.append("(PyYAML not available: skipped verification; run via `uv run --no-project --with pyyaml python ...` to verify)")

    print("\n".join(log))
    if text == before:
        print("\nNo changes needed.")
        return 0
    diff = difflib.unified_diff(before.splitlines(), text.splitlines(), "config.yaml (before)", "config.yaml (after)", lineterm="", n=1)
    print("\n" + "\n".join(diff))
    if a.dry_run:
        print("\n(dry run — nothing written)")
        return 0
    backup = cfg.with_name(f"config.yaml.bak-{dt.datetime.now():%Y%m%d-%H%M%S}")
    shutil.copy2(cfg, backup)
    cfg.write_text(text, encoding="utf-8")
    print(f"\nWrote {cfg} (backup: {backup.name}). Restart DeerFlow (make stop && make dev) to apply.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
