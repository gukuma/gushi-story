#!/usr/bin/env python3
"""API keys and search provider for the Market Desk.

  keys.py set              prompt for each key (hidden input, Enter = keep current) and write .env
  keys.py show             which keys are set (values masked)
  keys.py test             check the DeepSeek key works (free call), report which others are present
  keys.py search NAME      switch the active web_search tool: tavily | tencent | infoquest | ddg | brave | serper
"""

from __future__ import annotations

import getpass
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ENV = ROOT / ".env"
CONFIG = ROOT / "config.yaml"

KEYS = [
    # (env var, what it's for, where to get it, required?)
    ("DEEPSEEK_API_KEY", "LLM (DeepSeek) — required if DeepSeek is your model", "https://platform.deepseek.com/api_keys", True),
    ("TAVILY_API_KEY", "Search: Tavily (1,000 free searches/month, English-strong)", "https://app.tavily.com", False),
    ("TENCENTCLOUD_WSA_APIKEY", "Search: Tencent Cloud WSA (best for Chinese web)", "https://console.cloud.tencent.com/wsapi/index", False),
    ("INFOQUEST_API_KEY", "Search + crawl: BytePlus InfoQuest", "https://docs.byteplus.com/en/docs/InfoQuest/What_is_Info_Quest", False),
    ("JINA_API_KEY", "Page reader (web_fetch): optional, raises Jina's rate limit", "https://jina.ai/reader", False),
    ("VOLCENGINE_API_KEY", "LLM alternative: Volcengine Ark (Doubao/DeepSeek/Kimi/GLM)", "https://console.volcengine.com/ark", False),
    ("LANGSMITH_API_KEY", "Tracing: LangSmith (optional; also set LANGSMITH_TRACING=true)", "https://smith.langchain.com", False),
]

SEARCH = {
    "tavily": ("deerflow.community.tavily.tools:web_search_tool", "TAVILY_API_KEY"),
    "tencent": ("deerflow.community.tencent_wsa.tools:web_search_tool", "TENCENTCLOUD_WSA_APIKEY"),
    "infoquest": ("deerflow.community.infoquest.tools:web_search_tool", "INFOQUEST_API_KEY"),
    "ddg": ("deerflow.community.ddg_search.tools:web_search_tool", None),
    "brave": ("deerflow.community.brave.tools:web_search_tool", "BRAVE_SEARCH_API_KEY"),
    "serper": ("deerflow.community.serper.tools:web_search_tool", "SERPER_API_KEY"),
}


def read_env() -> tuple[list[str], dict[str, str]]:
    if not ENV.exists():
        example = ROOT / ".env.example"
        if example.exists():
            shutil.copy(example, ENV)
        else:
            ENV.write_text("", encoding="utf-8")
    lines = ENV.read_text(encoding="utf-8").splitlines()
    vals = {}
    for ln in lines:
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*)$", ln)
        if m:
            vals[m.group(1)] = m.group(2).strip().strip("'\"")
    return lines, vals


def is_real(v: str | None) -> bool:
    return bool(v) and not v.startswith("your-") and v not in ("changeme", "xxx")


def write_env(lines: list[str], updates: dict[str, str]) -> None:
    done = set()
    out = []
    for ln in lines:
        m = re.match(r"^\s*#?\s*([A-Z0-9_]+)\s*=", ln)
        if m and m.group(1) in updates and m.group(1) not in done:
            out.append(f"{m.group(1)}={updates[m.group(1)]}")
            done.add(m.group(1))
        else:
            out.append(ln)
    for k, v in updates.items():
        if k not in done:
            out.append(f"{k}={v}")
    ENV.write_text("\n".join(out) + "\n", encoding="utf-8")
    ENV.chmod(0o600)


def mask(v: str) -> str:
    return v[:4] + "…" + v[-4:] if len(v) > 10 else "set"


def cmd_set() -> None:
    lines, vals = read_env()
    print(f"Writing to {ENV} (hidden input; press Enter to keep the current value or skip).\n")
    updates = {}
    for var, what, url, req in KEYS:
        cur = vals.get(var)
        state = f"currently {mask(cur)}" if is_real(cur) else "not set"
        print(f"{var}{' (required)' if req else ''}\n  {what}\n  get it: {url}\n  {state}")
        v = getpass.getpass("  paste key: ").strip()
        if v:
            updates[var] = v
        print()
    if updates:
        if "LANGSMITH_API_KEY" in updates:
            updates.setdefault("LANGSMITH_TRACING", "true")
        write_env(lines, updates)
        print(f"Saved {len(updates)} key(s). Restart DeerFlow to use them:  desk restart")
    else:
        print("No changes.")


def cmd_show() -> None:
    _, vals = read_env()
    for var, what, _, req in KEYS:
        v = vals.get(var)
        print(f"  {'✓' if is_real(v) else ('✗' if req else '·')} {var:26} {mask(v) if is_real(v) else 'not set':12} {what}")
    print(f"\n  active search provider: {active_search() or 'unknown (no config.yaml?)'}")


def cmd_test() -> int:
    _, vals = read_env()
    rc = 0
    k = vals.get("DEEPSEEK_API_KEY")
    if is_real(k):
        req = urllib.request.Request("https://api.deepseek.com/models", headers={"Authorization": f"Bearer {k}"})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                models = [m["id"] for m in json.load(r).get("data", [])]
            print(f"  ✓ DeepSeek key works. Models: {', '.join(models)}")
        except Exception as e:
            print(f"  ✗ DeepSeek key rejected or unreachable: {e}")
            rc = 1
    else:
        print("  · DeepSeek key not set")
    prov = active_search()
    if prov:
        need = next((env for name, (use, env) in SEARCH.items() if use.split(":")[0].split(".")[2] == prov), None)
        if need and not is_real(vals.get(need)):
            print(f"  ✗ search provider is '{prov}' but {need} is not set in .env")
            rc = 1
        else:
            print(f"  ✓ search provider '{prov}'" + (f" with {need}" if need else " (no key needed)"))
    return rc


def active_search() -> str | None:
    if not CONFIG.exists():
        return None
    m = re.search(r"(?m)^[ \t]*- name:[ \t]*web_search[ \t]*\n(?:[ \t]*#.*\n|[ \t]+[A-Za-z_]\w*:.*\n)*?[ \t]+use:[ \t]*(\S+)", CONFIG.read_text(encoding="utf-8"))
    return m.group(1).split(":")[0].split(".")[2] if m and m.group(1).count(".") >= 2 else None


def cmd_search(name: str) -> int:
    if name not in SEARCH:
        print(f"Unknown provider {name!r}. Choose: {', '.join(SEARCH)}")
        return 1
    if not CONFIG.exists():
        print("No config.yaml yet; run make setup first.")
        return 1
    text = CONFIG.read_text(encoding="utf-8")
    pat = re.compile(r"(?m)^([ \t]*- name:[ \t]*web_search[ \t]*\n(?:[ \t]*#.*\n|[ \t]+[A-Za-z_]\w*:.*\n)*?[ \t]+use:[ \t]*)(\S+)")
    m = pat.search(text)
    if not m:
        print("Couldn't find an active web_search tool in config.yaml; edit it by hand (desk config).")
        return 1
    use, env = SEARCH[name]
    shutil.copy(CONFIG, CONFIG.with_name("config.yaml.bak-search"))
    CONFIG.write_text(text[: m.start(2)] + use + text[m.end(2):], encoding="utf-8")
    print(f"web_search now uses {name} ({use}). Backup: config.yaml.bak-search")
    if env:
        _, vals = read_env()
        if not is_real(vals.get(env)):
            print(f"Remember to set {env}:  desk keys")
    print("Restart DeerFlow to apply:  desk restart")
    return 0


def main() -> int:
    a = sys.argv[1:]
    if not a or a[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    if a[0] == "set":
        cmd_set()
    elif a[0] == "show":
        cmd_show()
    elif a[0] == "test":
        return cmd_test()
    elif a[0] == "search" and len(a) > 1:
        return cmd_search(a[1])
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
