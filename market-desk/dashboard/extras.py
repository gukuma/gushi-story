"""Background helpers for 📈 股市故事: settings, macOS notifications (new reports, big price moves),
weekly library backups, system health checks. Standard library only; imported by server.py."""

from __future__ import annotations

import datetime as dt
import json
import os
import platform
import shutil
import subprocess
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

DEFAULTS = {
    "alert_pct": 5.0,          # watchlist move that counts as "大幅波动"
    "notify_reports": True,    # macOS notification when a new report appears
    "notify_prices": True,     # macOS notification on a big watchlist move (trading hours)
    "backup_days": 7,          # automatic library backup interval
    "backup_keep": 8,          # how many backup zips to keep
}


def settings_load(path: Path) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    return {**DEFAULTS, **d}


def settings_save(path: Path, changes: dict) -> dict:
    try:
        d = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    for k, v in changes.items():
        if k not in DEFAULTS:
            continue
        default = DEFAULTS[k]
        if isinstance(default, bool):
            d[k] = bool(v)
        elif isinstance(default, float):
            d[k] = max(1.0, min(20.0, float(v)))
        elif isinstance(default, int):
            d[k] = max(1, min(60, int(v)))
    path.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    return {**DEFAULTS, **d}


# ------------------------------------------------------------------ notifications
def notify(title: str, text: str, url: str = "") -> bool:
    """macOS notification (no-op elsewhere). Clicking it can't open a URL with plain osascript,
    so the text says where to look."""
    if sys.platform != "darwin":
        return False
    def esc(s: str) -> str:
        return s.replace("\\", "\\\\").replace('"', '\\"')[:180]
    try:
        subprocess.run(["osascript", "-e", f'display notification "{esc(text)}" with title "📈 股市故事" subtitle "{esc(title)}"'],
                       timeout=5, capture_output=True)
        return True
    except Exception:
        return False


class Watcher(threading.Thread):
    """Every 2 minutes: notify about new reports and big watchlist moves; run the weekly backup."""

    def __init__(self, library: Path, settings_path: Path, get_reports, get_watch_quotes, market_open):
        super().__init__(daemon=True)
        self.library, self.settings_path = library, settings_path
        self.get_reports, self.get_watch_quotes, self.market_open = get_reports, get_watch_quotes, market_open
        self.state_path = library / ".notified.json"

    def _state(self) -> dict:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def _save(self, st: dict) -> None:
        try:
            self.state_path.write_text(json.dumps(st, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    def tick(self) -> None:
        cfg = settings_load(self.settings_path)
        st = self._state()
        # 1. new reports
        reports = self.get_reports()
        seen = set(st.get("reports", []))
        ids = [r["id"] for r in reports]
        if "reports" not in st:  # first run: don't announce the whole history
            seen = set(ids)
        new = [r for r in reports if r["id"] not in seen]
        if new and cfg["notify_reports"]:
            if len(new) == 1:
                notify("新研报", new[0]["title"])
            else:
                notify(f"{len(new)} 份新研报", "、".join(r["title"] for r in new[:3]) + (" …" if len(new) > 3 else ""))
        st["reports"] = ids[:3000]
        # 2. big moves on the watchlist (once per stock per day, only while trading)
        today = dt.date.today().isoformat()
        alerted = st.get("price_alerts", {})
        alerted = {k: v for k, v in alerted.items() if v == today}
        if cfg["notify_prices"] and self.market_open():
            for q in self.get_watch_quotes():
                pct = q.get("change_pct")
                if pct is None or abs(pct) < cfg["alert_pct"] or alerted.get(q["symbol"]) == today:
                    continue
                notify("大幅波动", f"{q.get('name', q['symbol'])} {'+' if pct > 0 else ''}{pct:.2f}%，现价 {q.get('price')}")
                alerted[q["symbol"]] = today
        st["price_alerts"] = alerted
        self._save(st)
        # 3. weekly backup
        try:
            last = backup_info(self.library).get("last")
            if not last or (dt.datetime.now() - dt.datetime.fromisoformat(last)).days >= cfg["backup_days"]:
                backup_now(self.library, keep=cfg["backup_keep"])
        except Exception:
            traceback.print_exc()

    def run(self) -> None:
        time.sleep(20)
        while True:
            try:
                self.tick()
            except Exception:
                traceback.print_exc()
            time.sleep(120)


# ------------------------------------------------------------------ backups
BACKUP_DIR = Path.home() / "MarketDesk-backups"


def backup_info(library: Path) -> dict:
    try:
        d = json.loads((library / ".backup.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    files = sorted(BACKUP_DIR.glob("library-*.zip")) if BACKUP_DIR.exists() else []
    return {"last": d.get("last"), "dir": str(BACKUP_DIR), "count": len(files),
            "latest_file": files[-1].name if files else None,
            "latest_mb": round(files[-1].stat().st_size / 1e6, 2) if files else None}


def backup_now(library: Path, keep: int = 8) -> dict:
    """Zip the whole research library (reports, notes, projects, watchlist, predictions).
    API keys (.env) are never included."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M")
    dest = BACKUP_DIR / f"library-{stamp}.zip"
    n = 0
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for p in library.rglob("*"):
            if p.is_file() and "__pycache__" not in p.parts:
                z.write(p, Path("library") / p.relative_to(library))
                n += 1
    files = sorted(BACKUP_DIR.glob("library-*.zip"))
    for old in files[:-keep]:
        try:
            old.unlink()
        except OSError:
            pass
    (library / ".backup.json").write_text(json.dumps({"last": dt.datetime.now().isoformat(timespec="seconds")}), encoding="utf-8")
    return {"ok": True, "file": str(dest), "files": n}


# ------------------------------------------------------------------ health
def _probe(url: str, timeout: float = 4.0, headers: dict | None = None) -> dict:
    t = time.time()
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", **(headers or {})})
        ctx = None
        if url.startswith("https://"):
            import market_data as md  # same certificate handling as the quote feeds
            ctx = md._ssl_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            r.read(200)
            return {"ok": r.status < 500, "ms": int((time.time() - t) * 1000), "detail": f"HTTP {r.status}"}
    except Exception as e:
        return {"ok": False, "ms": int((time.time() - t) * 1000), "detail": f"{type(e).__name__}: {e}"[:200]}


def _probe_feed(url: str, referer: str | None) -> dict:
    """Probe a quote feed the same way the app fetches it (https, falling back to the http mirror)."""
    import market_data as md
    t = time.time()
    try:
        text = md._get(url, referer=referer, encoding="gbk")
        host = urllib.parse.urlparse(url).hostname or ""
        via = "（https 连不上，已自动改用备用 http 连接）" if host in md._PREFER_HTTP else ""
        ok = len(text) > 20
        return {"ok": ok, "ms": int((time.time() - t) * 1000), "detail": ("正常" if ok else "返回为空") + via}
    except Exception as e:
        return {"ok": False, "ms": int((time.time() - t) * 1000), "detail": f"{type(e).__name__}: {e}"[:200]}


def health(repo: Path, library: Path, gateway: str, keys_status, schedules, reports_count: int) -> dict:
    checks = []

    def add(group: str, name: str, res: dict, fix: str = ""):
        checks.append({"group": group, "name": name, **res, "fix": "" if res.get("ok") else fix})

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as ex:  # probe all services at once
        f_gw = ex.submit(_probe, gateway + "/health")
        f_tx = ex.submit(_probe_feed, "https://qt.gtimg.cn/q=sh000001", None)
        f_sn = ex.submit(_probe_feed, "https://hq.sinajs.cn/list=fx_susdcnh", "https://finance.sina.com.cn")
        f_cg = ex.submit(_probe, "https://api.coingecko.com/api/v3/ping")
    add("服务", "DeerFlow 后端（网关 8001）", f_gw.result(), "运行 desk restart")
    add("服务", "投研数据服务（2027）", {"ok": True, "ms": 0, "detail": "运行中"})
    add("行情", "腾讯财经（A股/港股）", f_tx.result(), "https 和备用 http 都连不上：检查网络 / VPN / 代理设置")
    add("行情", "新浪财经（汇率/债券/商品）", f_sn.result(), "https 和备用 http 都连不上：检查网络 / VPN / 代理设置")
    cg = f_cg.result()
    if not cg["ok"] and "429" in cg["detail"]:
        cg = {**cg, "ok": True, "detail": "暂时限流，几分钟后自动恢复"}
    add("行情", "CoinGecko（加密货币）", cg, "检查网络")
    try:
        ks = keys_status()
        for k in ks["keys"]:
            if k["required"] or k["set"]:
                add("密钥", k["var"], {"ok": k["set"], "ms": 0, "detail": k["masked"] if k["set"] else "未设置"}, "到“API 密钥”页面填写")
        add("密钥", "网页搜索服务", {"ok": bool(ks.get("search")), "ms": 0, "detail": ks.get("search") or "未知"}, "到“API 密钥”页面选择")
    except Exception as e:
        add("密钥", "读取 .env", {"ok": False, "ms": 0, "detail": str(e)}, "运行 desk keys")
    try:
        tasks = schedules()["tasks"]
        on = [t for t in tasks if t["status"] in ("enabled", "running")]
        bad = [t for t in tasks if t.get("last_error") and t["status"] != "paused"]
        add("自动研究", "定时任务", {"ok": bool(tasks) and not bad, "ms": 0,
                                    "detail": f"{len(on)}/{len(tasks)} 运行中" + (f"，{len(bad)} 个上次失败" if bad else "")},
            "到“定时任务”查看失败原因；没有任务时运行 desk seed")
    except Exception as e:
        add("自动研究", "定时任务", {"ok": False, "ms": 0, "detail": str(e)}, "确认 DeerFlow 在运行")
    mode = "prod"
    try:
        for line in (repo / "market-desk" / "mac" / "settings.env").read_text(encoding="utf-8").splitlines():
            if line.startswith("MODE="):
                mode = line.split("=", 1)[1].split()[0]
    except OSError:
        pass
    size = sum(p.stat().st_size for p in library.rglob("*") if p.is_file()) if library.exists() else 0
    du = shutil.disk_usage(str(repo))
    add("存储", "磁盘空间", {"ok": du.free > 5e9, "ms": 0, "detail": f"剩余 {du.free / 1e9:.1f} GB"}, "清理磁盘，至少留 5 GB")
    info = backup_info(library)
    add("存储", "研报库备份", {"ok": bool(info["last"]), "ms": 0, "detail": f"上次 {(info['last'] or '从未').replace('T', ' ')[:16]} · {info['count']} 份备份"}, "点“立即备份”")
    return {
        "checks": checks,
        "ok": all(c["ok"] for c in checks if c["group"] in ("服务", "行情")),
        "system": {"mode": mode, "python": platform.python_version(), "platform": platform.platform(terse=True),
                   "library": str(library), "library_mb": round(size / 1e6, 2), "reports": reports_count,
                   "backup": info, "repo": str(repo), "pid": os.getpid()},
    }
