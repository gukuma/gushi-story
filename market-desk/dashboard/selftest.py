"""股市故事 self-test: checks the data service end to end and prints a plain-language verdict.

  python3 market-desk/dashboard/selftest.py            # against the running service on :2027
  desk selftest

Exit code 0 = everything OK, 1 = something needs attention (each failure says how to fix it).
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:2027"
UI = "http://127.0.0.1:2026"

CHECKS = [  # path, required keys (top level), what it powers
    ("/api/version", ["api", "started"], "版本检查"),
    ("/api/brief", ["market", "watch", "new_reports", "calls", "schedules", "alerts"], "今日页"),
    ("/api/reports", None, "研报"),
    ("/api/chats?limit=5", ["chats", "total"], "最近对话"),
    ("/api/projects", ["projects", "suggestions"], "项目"),
    ("/api/stock?code=sh600519", ["code", "quote", "reports"], "股票页"),
    ("/api/history?code=sh600519&days=30", None, "K 线"),
    ("/api/search?q=600519", ["stocks", "reports"], "搜索"),
    ("/api/calls", ["rows", "score"], "预测记录"),
    ("/api/strip", ["rows"], "行情条"),
    ("/api/settings", ["alert_pct"], "提醒设置"),
    ("/api/health", ["checks", "system"], "系统状态"),
    ("/api/keys", ["keys"], "API 密钥"),
]


def get(url: str, timeout: float = 20):
    t = time.time()
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "selftest"}), timeout=timeout) as r:
        body = r.read()
        return r.status, body, time.time() - t


def main() -> int:
    bad = 0
    print("股市故事 自检\n")
    try:
        get(BASE + "/api/version", 3)
    except Exception as e:
        print(f"✗ 数据服务（2027）没有运行：{e}\n  修复：bash market-desk/mac/deskctl.sh restart")
        return 1
    for path, keys, what in CHECKS:
        try:
            st, body, dt_ = get(BASE + path)
            data = json.loads(body)
            if isinstance(data, dict) and data.get("error"):
                raise ValueError(data["error"])
            missing = [k for k in (keys or []) if not (isinstance(data, dict) and k in data)]
            if missing:
                raise ValueError(f"缺少字段 {missing}（数据服务是旧版本？运行 deskctl.sh restart）")
            extra = ""
            if path == "/api/brief":
                prices = [m for m in data["market"] if m.get("price") is not None]
                extra = f" · 行情 {len(prices)}/{len(data['market'])}"
                if not prices:
                    bad += 1
                    extra += " ✗ 取不到任何行情（检查网络 / 证书）"
            if path == "/api/reports":
                extra = f" · {len(data)} 份研报"
            print(f"✓ {what:8} {path:40} {dt_ * 1000:6.0f} ms{extra}")
        except urllib.error.HTTPError as e:
            bad += 1
            print(f"✗ {what:8} {path:40} HTTP {e.code}：{e.read()[:200]!r}")
        except Exception as e:
            bad += 1
            print(f"✗ {what:8} {path:40} {type(e).__name__}: {e}")
    for page in ["/login", "/"]:
        try:
            st, _, dt_ = get(UI + page, 120)
            print(f"✓ 网页      {page:40} {dt_ * 1000:6.0f} ms")
        except urllib.error.HTTPError as e:
            ok = e.code in (302, 303, 307, 308)
            print(f"{'✓' if ok else '✗'} 网页      {page:40} HTTP {e.code}")
            bad += 0 if ok else 1
        except Exception as e:
            bad += 1
            print(f"✗ 网页      {page:40} {e}\n  修复：bash market-desk/mac/deskctl.sh restart")
    print("\n" + ("✓ 一切正常" if not bad else f"✗ {bad} 项有问题，见上面的说明"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
