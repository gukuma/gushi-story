"""Data behind the 📈 股市故事 home page and sidebar: conversations by ticker, live quotes,
market status, and API-key management. Imported by server.py. Standard library only."""

from __future__ import annotations

import datetime as dt
import io
import json
import os
import re
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import redirect_stdout
from pathlib import Path
from zoneinfo import ZoneInfo

from tickers import ALIASES, BUILTIN, INDEXES, Resolver, extract  # noqa: F401  (re-exported for server.search)

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "skills" / "custom" / "market-data" / "scripts"))
sys.path.insert(0, str(REPO / "market-desk" / "mac"))
import market_data as md  # noqa: E402

CN = ZoneInfo("Asia/Shanghai")
_cache: dict[str, tuple[float, object]] = {}
_cache_lock = threading.Lock()


def cached(key: str, ttl: float, fn):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < ttl:
            return hit[1]
    val = fn()
    with _cache_lock:
        _cache[key] = (now, val)
    return val


_refreshing: set[str] = set()


def cached_swr(key: str, ttl: float, fn):
    """Stale-while-revalidate: answer instantly from the last value and refresh it in the background,
    so pages never wait on the quote feeds once the service has warmed up."""
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
    if hit is None:
        return cached(key, ttl, fn)
    if now - hit[0] >= ttl:
        with _cache_lock:
            busy = key in _refreshing
            _refreshing.add(key)
        if not busy:
            def job():
                try:
                    val = fn()
                    with _cache_lock:
                        _cache[key] = (time.time(), val)
                except Exception:
                    pass
                finally:
                    with _cache_lock:
                        _refreshing.discard(key)
            threading.Thread(target=job, daemon=True).start()
    return hit[1]


# ------------------------------------------------------------------ conversations ↔ tickers
class Index:
    def __init__(self, df_home: Path, library: Path, query, table_exists, to_iso):
        self.df_home, self.library = df_home, library
        self.query, self.table_exists, self.to_iso = query, table_exists, to_iso
        self.resolver = Resolver(library / ".ticker-names.json")

    def _outputs(self) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for pattern in ("users/*/threads/*/user-data/outputs", "threads/*/user-data/outputs"):
            for d in self.df_home.glob(pattern):
                tid = d.parts[d.parts.index("threads") + 1]
                try:
                    out[tid] = sorted(p.name for p in d.iterdir() if p.is_file())[:200]
                except OSError:
                    pass
        return out

    def threads(self) -> list[dict]:
        return cached("threads", 20, self._threads)

    def _threads(self) -> list[dict]:
        if not self.table_exists("threads_meta"):
            return []
        meta = self.query("SELECT thread_id, display_name, assistant_id, metadata_json, status, created_at, updated_at FROM threads_meta "
                          "WHERE status IS NULL OR status != 'deleted' ORDER BY updated_at DESC LIMIT 1500")
        texts: dict[str, list[str]] = {}
        if self.table_exists("runs"):
            for r in self.query("SELECT thread_id, first_human_message, last_ai_message FROM runs ORDER BY created_at DESC LIMIT 6000"):
                buf = texts.setdefault(r["thread_id"], [])
                if sum(len(x) for x in buf) < 40000:
                    buf += [r["first_human_message"] or "", r["last_ai_message"] or ""]
        scheduled: dict[str, str] = {}
        if self.table_exists("scheduled_task_runs"):
            for r in self.query("SELECT r.thread_id, t.title FROM scheduled_task_runs r LEFT JOIN scheduled_tasks t ON t.id = r.task_id"):
                scheduled[r["thread_id"]] = r["title"] or ""
        outputs = self._outputs()
        rows = []
        for m in meta:
            tid = m["thread_id"]
            agent = m.get("assistant_id") or ""
            try:
                md_ = json.loads(m.get("metadata_json") or "{}") if isinstance(m.get("metadata_json"), str) else (m.get("metadata_json") or {})
                agent = md_.get("agent_name") or agent
            except ValueError:
                pass
            if agent in ("lead_agent", "lead-agent"):
                agent = ""
            title = m.get("display_name") or ""
            files = outputs.get(tid, [])
            text = "\n".join([title, *texts.get(tid, []), *files])
            codes = extract(text, self.resolver)
            first_q = next((t for t in texts.get(tid, [])[::2] if t), "")
            url = f"/workspace/agents/{agent}/chats/{tid}" if agent else f"/workspace/chats/{tid}"
            rows.append({
                "id": tid, "title": title or (first_q[:40] if first_q else "未命名对话"), "agent": agent, "url": url,
                "updated": self.to_iso(m.get("updated_at") or m.get("created_at")),
                "tickers": sorted(codes), "scheduled": scheduled.get(tid), "files": [f for f in files if f.endswith(".md")][:20],
                "preview": re.sub(r"\s+", " ", first_q)[:120],
            })
        self.resolver.fill_missing({c for r in rows for c in r["tickers"]})
        self.resolver.save()
        return rows

    def groups(self, reports: list[dict], watch_codes: list[str], prefs: dict | None = None) -> dict:
        prefs = prefs or {}
        hidden_codes = set(prefs.get("hidden_codes", []))
        hidden_threads = set(prefs.get("hidden_threads", []))
        unlinks = prefs.get("unlinks", {})
        threads = []
        for t in self.threads():
            if t["id"] in hidden_threads:
                continue
            drop = set(unlinks.get(t["id"], [])) | hidden_codes
            threads.append({**t, "tickers": [c for c in t["tickers"] if c not in drop]} if drop & set(t["tickers"]) else t)
        by: dict[str, dict] = {}

        def g(code: str) -> dict:
            if code not in by:
                by[code] = {"code": code, "name": self.resolver.names.get(code, ""), "threads": [], "reports": [],
                            "watch": code in watch_codes, "last": ""}
            return by[code]

        multi, scheduled, untagged = [], [], []
        for t in threads:
            if t["scheduled"]:
                scheduled.append(t)
                continue
            if not t["tickers"]:
                untagged.append(t)
                continue
            if len(t["tickers"]) >= 4:
                multi.append(t)
            for c in t["tickers"]:
                grp = g(c)
                grp["threads"].append({**t, "others": len(t["tickers"]) - 1})
                grp["last"] = max(grp["last"], t["updated"] or "")
        for r in reports:
            if r.get("type") in ("daily-brief", "announcements", "weekly-review", "market-sizing", "calendar", "review"):
                continue  # market-wide notes mention many tickers; they live in their own folders
            for c in r.get("codes", []):
                if c in hidden_codes:
                    continue
                grp = g(c)
                grp["reports"].append({k: r.get(k) for k in ("id", "title", "date", "type", "summary", "thread_url", "lang")})
                grp["last"] = max(grp["last"], r.get("date") or "")
        for c in watch_codes:
            if c not in INDEXES and c not in hidden_codes:
                g(c)
        groups = sorted(by.values(), key=lambda x: (x["last"] or "", x["watch"]), reverse=True)
        names = self.resolver.names
        hidden = {"codes": [{"code": c, "name": names.get(c, "")} for c in prefs.get("hidden_codes", [])],
                  "threads": [{"id": t["id"], "title": t["title"]} for t in self.threads() if t["id"] in hidden_threads]}
        return {"groups": groups, "multi": multi, "scheduled": scheduled, "untagged": untagged,
                "thread_count": len(threads), "hidden": hidden}

    def forget_cache(self) -> None:
        with _cache_lock:
            _cache.pop("threads", None)


def report_codes(index: Index, r: dict) -> list[str]:
    codes = set()
    for t in r.get("tickers") or []:
        try:
            c = md.normalize_symbol(str(t))
            if c not in INDEXES:
                codes.add(c)
        except ValueError:
            pass
    codes |= extract(" ".join([r.get("title") or "", Path(r.get("path") or "").name, r.get("summary") or ""]), index.resolver)
    return sorted(codes)


def watch_codes(watchlist: dict) -> list[str]:
    out = []
    for s in watchlist.get("sections", []):
        if s.get("name") in ("indices", "macro", "fx", "crypto", "commodities", "rates"):
            continue
        for it in s.get("items", []):
            try:
                c = md.normalize_symbol(it["code"])
            except (ValueError, KeyError):
                continue
            # stocks only: macro rows (CN10Y, DXY, Gold…) and indices are not stock cards
            if re.fullmatch(r"(sh|sz|bj)\d{6}|hk\d{5}|us[A-Z][A-Z.]{0,5}", c) and c not in INDEXES:
                out.append(c)
    return out


# ------------------------------------------------------------------ live market data
STRIP = [  # home page market strip
    ("上证指数", "tx", "sh000001"), ("深证成指", "tx", "sz399001"), ("创业板指", "tx", "sz399006"),
    ("沪深300", "tx", "sh000300"), ("科创50", "tx", "sh000688"), ("恒生指数", "tx", "hkHSI"),
    ("恒生科技", "tx", "hkHSTECH"), ("美元/离岸人民币", "sina_fx", "fx_susdcnh"),
    ("中国10年国债", "sina_bond", "globalbd_gcny10"), ("COMEX黄金", "sina_fut", "hf_GC"),
    ("布伦特原油", "sina_fut", "hf_OIL"), ("比特币", "cg", "bitcoin"),
]


def market_strip() -> list[dict]:
    def build():
        def safe(f):
            try:
                return f()
            except Exception:
                return None
        with ThreadPoolExecutor(max_workers=3) as ex:  # the three feeds in parallel
            f_tx = ex.submit(safe, lambda: md.tx_quotes([s for _, p, s in STRIP if p == "tx"]))
            f_sn = ex.submit(safe, lambda: md.sina_raw([s for _, p, s in STRIP if p.startswith("sina")]))
            f_cg = ex.submit(safe, lambda: md.cg_markets(["bitcoin"]))
        tx = {q["symbol"]: q for q in (f_tx.result() or [])}
        sn = f_sn.result() or {}
        cg = {q["name"].lower(): q for q in (f_cg.result() or [])}
        rows = []
        for label, p, sym in STRIP:
            try:
                if p == "tx":
                    q = tx.get(sym, {})
                elif p == "cg":
                    q = cg.get(sym, {})
                else:
                    q = md.sina_parse(p, sym, sn[sym]) if sym in sn else {}
                    if q.get("change_pct") is None and p != "sina_bond":
                        q["change_pct"] = md._pct(q.get("price"), q.get("prev_close"))
                rows.append({"label": label, "symbol": sym, "price": q.get("price"), "change_pct": q.get("change_pct"),
                             "change_bp": q.get("change_bp"), "time": q.get("time")})
            except Exception as e:
                rows.append({"label": label, "symbol": sym, "error": str(e)})
        return rows
    return cached_swr("strip", 20, build)


def quotes(codes: list[str]) -> list[dict]:
    codes = [c for c in codes if c][:80]
    if not codes:
        return []
    key = "q:" + ",".join(sorted(codes))
    return cached_swr(key, 15, lambda: md.tx_quotes(codes))


def sparks(codes: list[str]) -> dict:
    out = {}

    def one(c):
        def build():
            try:
                rows = md.tx_history(c, 30)
                return [r["close"] for r in rows if r["close"] is not None]
            except Exception:
                return []
        return c, cached_swr("spark:" + c, 600, build)

    with ThreadPoolExecutor(max_workers=8) as ex:
        for c, v in ex.map(one, codes[:60]):
            out[c] = v
    return out


def market_status() -> dict:
    def build():
        now = dt.datetime.now(CN)
        info = md.trading_day()
        open_today = info.get("a_share_open_today")
        hm = now.hour * 60 + now.minute
        if open_today is False:
            state, label = "closed", "休市" if info.get("reason") != "weekend" else "周末休市"
        elif hm < 9 * 60 + 15:
            state, label = "pre", "未开盘"
        elif hm < 9 * 60 + 30:
            state, label = "auction", "集合竞价"
        elif hm < 11 * 60 + 30:
            state, label = "open", "交易中"
        elif hm < 13 * 60:
            state, label = "lunch", "午间休市"
        elif hm < 15 * 60:
            state, label = "open", "交易中"
        else:
            state, label = "after", "已收盘"
        return {"state": state, "label": label, "now": now.strftime("%Y-%m-%d %H:%M"), "detail": info}
    return cached_swr("status", 60, build)


# ------------------------------------------------------------------ API keys
def keys_status() -> dict:
    import keys as K  # market-desk/mac/keys.py
    _, vals = K.read_env()
    return {
        "keys": [{"var": v, "what": w, "url": u, "required": r, "set": K.is_real(vals.get(v)),
                  "masked": K.mask(vals[v]) if K.is_real(vals.get(v)) else ""} for v, w, u, r in K.KEYS],
        "search": K.active_search(), "search_options": list(K.SEARCH), "env_path": str(K.ENV),
    }


def keys_set(var: str, value: str) -> dict:
    import keys as K
    allowed = {k[0] for k in K.KEYS} | {"BRAVE_SEARCH_API_KEY", "SERPER_API_KEY"}
    if var not in allowed:
        raise ValueError(f"unknown key {var}")
    value = value.strip()
    if not value or "\n" in value or len(value) > 400:
        raise ValueError("invalid value")
    lines, _ = K.read_env()
    updates = {var: value}
    if var == "LANGSMITH_API_KEY":
        updates["LANGSMITH_TRACING"] = "true"
    K.write_env(lines, updates)
    return {"ok": True, "restart_needed": True}


def search_set(name: str) -> dict:
    import keys as K
    buf = io.StringIO()
    with redirect_stdout(buf):
        rc = K.cmd_search(name)
    return {"ok": rc == 0, "message": buf.getvalue().strip(), "restart_needed": rc == 0}


def restart() -> dict:
    ctl = REPO / "market-desk" / "mac" / "deskctl.sh"
    if not ctl.exists():
        return {"ok": False, "message": "deskctl.sh not found"}
    subprocess.Popen(["/bin/bash", str(ctl), "restart", "--quiet"], cwd=str(REPO), stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return {"ok": True, "message": "正在重启，约 1 分钟后刷新页面"}
