#!/usr/bin/env python3
"""Market Desk — a local reading room and health board for DeerFlow research.

Reads DeerFlow's data; the only writes are API keys (.env) and the search provider (config.yaml),
from the 股市故事 settings page, guarded by a same-origin header.
Sources:
  - market-desk/library/          reports (*.md with front matter), calls.csv, watchlist.yaml
  - backend/.deer-flow/           thread outputs (*.md) and deerflow.db (runs, scheduled tasks, tokens)
  - config.yaml                   which Market Desk switches are on

  python3 market-desk/dashboard/server.py            # http://127.0.0.1:2027
  python3 market-desk/dashboard/server.py --port 8090 --open

Env overrides: DEER_FLOW_HOME, MARKET_LIBRARY, DEERFLOW_UI (default http://127.0.0.1:2026),
DEERFLOW_GATEWAY (default http://127.0.0.1:8001).
Standard library only.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import sqlite3
import sys
import threading
import time
import traceback
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
DF_HOME = Path(os.environ.get("DEER_FLOW_HOME", REPO / "backend" / ".deer-flow"))
LIBRARY = Path(os.environ.get("MARKET_LIBRARY", REPO / "market-desk" / "library"))
CONFIG = REPO / "config.yaml"
SETTINGS = REPO / "market-desk" / "settings.json"
UI = os.environ.get("DEERFLOW_UI", "http://localhost:2026").rstrip("/")
GATEWAY = os.environ.get("DEERFLOW_GATEWAY", "http://127.0.0.1:8001").rstrip("/")
MAX_MD_BYTES = 2_000_000
sys.path.insert(0, str(HERE))


# ------------------------------------------------------------------ helpers
def db_path() -> Path | None:
    for p in (DF_HOME / "data" / "deerflow.db", REPO / "backend" / ".deer-flow" / "data" / "deerflow.db", REPO / ".deer-flow" / "data" / "deerflow.db"):
        if p.exists():
            return p
    return None


def query(sql: str, params: tuple = ()) -> list[dict]:
    p = db_path()
    if not p:
        return []
    con = sqlite3.connect(f"file:{p}?mode=ro", uri=True, timeout=3)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, params)]
    except sqlite3.Error:
        return []
    finally:
        con.close()


def table_exists(name: str) -> bool:
    return bool(query("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (name,)))


def parse_front_matter(text: str) -> tuple[dict, str]:
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    meta: dict = {}
    for line in text[3:end].splitlines():
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*?)\s*(#.*)?$", line)
        if not m:
            continue
        k, v = m.group(1), m.group(2)
        if v.startswith("[") and v.endswith("]"):
            meta[k] = [x.strip().strip("'\"") for x in v[1:-1].split(",") if x.strip()]
        else:
            meta[k] = v.strip("'\"")
    body = text[end + 4:].lstrip("\n")
    return meta, body


def desk_language() -> str:
    try:
        lang = json.loads(SETTINGS.read_text(encoding="utf-8")).get("language", "en")
        return lang if lang in ("en", "zh", "both") else "en"
    except (OSError, ValueError):
        return "en"


_CJK = re.compile(r"[\u4e00-\u9fff]")


def detect_lang(meta: dict, title: str, body: str) -> str:
    if meta.get("lang") in ("zh", "en"):
        return meta["lang"]
    sample = (title or "") + body[:1500]
    cjk = len(_CJK.findall(sample))
    return "zh" if cjk > max(20, len(sample) * 0.15) or (title and len(_CJK.findall(title)) > len(title) * 0.3) else "en"


def first_heading(body: str) -> str | None:
    m = re.search(r"(?m)^#\s+(.+)$", body)
    return m.group(1).strip() if m else None


def to_iso(v) -> str | None:
    if v is None:
        return None
    s = str(v).replace(" ", "T")
    if re.search(r"(Z|[+-]\d\d:?\d\d)$", s) is None:
        s += "Z"  # SQLAlchemy stores naive UTC
    return s


# ------------------------------------------------------------------ report index
_INDEX: dict[str, Path] = {}
_STARTED = dt.datetime.now().isoformat(timespec="seconds")
_LOCK = threading.Lock()


def thread_titles() -> dict[str, str]:
    if not table_exists("threads_meta"):
        return {}
    return {r["thread_id"]: r["display_name"] or "" for r in query("SELECT thread_id, display_name FROM threads_meta")}


def _rel(path: Path) -> str:
    return str(path.relative_to(REPO)) if path.is_relative_to(REPO) else str(path)


def report_id(path: Path) -> str:
    """Stable id from the file's location, so editing a report keeps its id (and read/star state)."""
    return hashlib.sha1(_rel(path).encode()).hexdigest()[:16]


def _thread_md_files() -> list[tuple[Path, str]]:
    out = []
    for pattern in ("users/*/threads/*/user-data/outputs/**/*.md", "threads/*/user-data/outputs/**/*.md"):
        for p in DF_HOME.glob(pattern):
            parts = p.parts
            out.append((p, parts[parts.index("threads") + 1]))
    return out


def import_thread_reports() -> int:
    """Copy reports that agents wrote into a conversation's outputs into the library, once.
    The library becomes the single home of every report (agents can read it at /mnt/library),
    and the copy remembers which conversation wrote it (thread_id in its front matter)."""
    imported_file = LIBRARY / ".imported.json"
    try:
        imported = json.loads(imported_file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        imported = {}
    lib_hashes = None
    added = 0
    for p, tid in _thread_md_files():
        key = _rel(p)
        if key in imported:
            continue
        try:
            if p.stat().st_size > MAX_MD_BYTES:
                continue
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if lib_hashes is None:
            lib_hashes = {}
            for q in (LIBRARY / "reports").rglob("*.md") if (LIBRARY / "reports").exists() else []:
                try:
                    lib_hashes[hashlib.sha1(q.read_bytes()).hexdigest()] = q
                except OSError:
                    pass
        h = hashlib.sha1(text.encode()).hexdigest()
        if h in lib_hashes:  # already curated into the library by the agent itself
            imported[key] = _rel(lib_hashes[h])
            continue
        meta, body = parse_front_matter(text)
        date = str(meta.get("date") or dt.datetime.fromtimestamp(p.stat().st_mtime).date().isoformat())[:10]
        y, m = (date.split("-") + ["", ""])[:2]
        folder = LIBRARY / "reports" / (y or "undated") / (m or "00")
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / p.name
        n = 2
        while dest.exists():
            dest = folder / f"{p.stem}-{n}{p.suffix}"
            n += 1
        if text.startswith("---") and "\n---" in text[3:]:
            new = "---\nthread_id: " + tid + "\n" + text[3:].lstrip("\n")
        else:
            title = first_heading(body) or p.stem
            new = f"---\ntitle: {json.dumps(title, ensure_ascii=False)}\ndate: {date}\nthread_id: {tid}\n---\n\n" + text
        dest.write_text(new, encoding="utf-8")
        lib_hashes[hashlib.sha1(new.encode()).hexdigest()] = dest
        imported[key] = _rel(dest)
        added += 1
    if added or not imported_file.exists():
        LIBRARY.mkdir(parents=True, exist_ok=True)
        imported_file.write_text(json.dumps(imported, ensure_ascii=False, indent=0), encoding="utf-8")
    return added


_TYPE_HINTS = [(r"审稿|review check", "review"), (r"催化剂|日历|calendar", "calendar"), (r"投资逻辑|thesis", "thesis"),
               (r"财报点评|财报前瞻|业绩点评|季报点评|年报点评|earnings", "earnings"), (r"对比|横向|compare", "compare"),
               (r"盘前|收盘|简报|brief", "daily-brief"), (r"周报|weekly", "weekly-review"), (r"公告", "announcements"),
               (r"市场规模|行业研究|规模测算|market siz", "market-sizing"), (r"研究笔记|研报|个股|估值|equity|research note", "equity-research")]


def guess_type(title: str) -> str | None:
    for pat, t in _TYPE_HINTS:
        if re.search(pat, title or "", re.I):
            return t
    return None


_SCAN_CACHE: dict = {"sig": None, "items": None}


def _scan_signature() -> tuple:
    """Cheap fingerprint of everything scan_reports depends on (file names, sizes, mtimes, state)."""
    sig = []
    roots = [LIBRARY / "reports"]
    for r in roots:
        if r.exists():
            for p in r.rglob("*.md"):
                try:
                    st = p.stat()
                    sig.append((str(p), st.st_mtime_ns, st.st_size))
                except OSError:
                    pass
    for p, _ in _thread_md_files():
        try:
            st = p.stat()
            sig.append((str(p), st.st_mtime_ns, st.st_size))
        except OSError:
            pass
    for f in (".state.json", "projects.json", ".links.json", ".ticker-names.json"):
        try:
            sig.append((f, (LIBRARY / f).stat().st_mtime_ns))
        except OSError:
            pass
    sig.append(("threads", len(stock_index().threads())))
    return tuple(sorted(sig))


def scan_reports() -> list[dict]:
    """Cached: re-scans only when a report, reader state or project changed."""
    sig = _scan_signature()
    if _SCAN_CACHE["sig"] == sig and _SCAN_CACHE["items"] is not None:
        return _SCAN_CACHE["items"]
    items = _scan_reports()
    _SCAN_CACHE["sig"] = _scan_signature()  # import may have added files
    _SCAN_CACHE["items"] = items
    return items


def _scan_reports() -> list[dict]:
    try:
        import_thread_reports()
    except Exception:
        traceback.print_exc()
    items: list[dict] = []
    seen_hashes: set[str] = set()
    titles = thread_titles()
    state = library.report_state(LIBRARY)

    def add(path: Path, origin: str, thread_id: str | None):
        try:
            st = path.stat()
            if st.st_size > MAX_MD_BYTES:
                return
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return
        h = hashlib.sha1(text.encode()).hexdigest()
        if h in seen_hashes:
            return
        seen_hashes.add(h)
        meta, body = parse_front_matter(text)
        rid = report_id(path)
        _INDEX[rid] = path
        thread_id = thread_id or meta.get("thread_id") or None
        date = meta.get("date") or dt.datetime.fromtimestamp(st.st_mtime).date().isoformat()
        tickers = meta.get("tickers") if isinstance(meta.get("tickers"), list) else []
        title = meta.get("title") or first_heading(body) or path.stem
        summary = meta.get("summary") or ""
        if not summary:  # first real paragraph, for summary-first cards
            for para in re.split(r"\n\s*\n", body):
                t = para.strip()
                if t and not t.startswith(("#", "|", "-", "*", ">", "```", "---")):
                    summary = re.sub(r"[*_`]", "", re.sub(r"\s+", " ", t))[:160]
                    break
        st_ = state.get(rid, {})
        lang = detect_lang(meta, title, body)
        items.append({
            "id": rid,
            "title": title,
            "lang": lang,
            "date": str(date)[:10],
            "type": meta.get("type") or guess_type(title) or ("thread-output" if thread_id else "note"),
            "mode": meta.get("mode"),
            "summary": summary,
            "confidence": meta.get("confidence"),
            "stance": meta.get("stance"),
            "tickers": tickers,
            "calls": meta.get("calls") if isinstance(meta.get("calls"), list) else [],
            "origin": origin,
            "path": _rel(path),
            "agent_path": ("/mnt/library/" + str(path.relative_to(LIBRARY))) if path.is_relative_to(LIBRARY) else None,
            "thread_id": thread_id,
            "thread_title": titles.get(thread_id or "", ""),
            "thread_url": f"{UI}/workspace/chats/{thread_id}" if thread_id else None,
            "mtime": dt.datetime.fromtimestamp(st.st_mtime, dt.timezone.utc).isoformat(),
            "words": len(body.split()) if lang == "en" else len(_CJK.findall(body)),
            "read": bool(st_.get("read")),
            "starred": bool(st_.get("starred")),
            "archived": bool(st_.get("archived")),
            "note": st_.get("note", ""),
        })

    if (LIBRARY / "reports").exists():
        for p in sorted((LIBRARY / "reports").rglob("*.md")):
            add(p, "library", None)
    try:
        imported = set(json.loads((LIBRARY / ".imported.json").read_text(encoding="utf-8")))
    except (OSError, ValueError):
        imported = set()
    for p, tid in _thread_md_files():
        if _rel(p) not in imported:
            add(p, "thread", tid)
    items.sort(key=lambda r: (r["date"], r["mtime"]), reverse=True)
    idx = stock_index()
    urls = {t["id"]: t["url"] for t in idx.threads()}
    for r in items:
        if r.get("thread_id") in urls:
            r["thread_url"] = UI + urls[r["thread_id"]]
        r["codes"] = stockapi.report_codes(idx, r)
        r["names"] = [idx.resolver.names.get(c, "") for c in r["codes"]]
    proj = library.projects_by_member(LIBRARY)
    for r in items:
        r["projects"] = proj["reports"].get(r["id"], [])
    return items


# ------------------------------------------------------------------ status
def config_flags() -> dict:
    if not CONFIG.exists():
        return {"exists": False}
    t = CONFIG.read_text(encoding="utf-8", errors="replace")

    def block_flag(block, key):
        m = re.search(rf"(?m)^{block}:\s*\n((?:[ \t]+.*\n|[ \t]*\n|#.*\n)*)", t)
        if not m:
            return None
        km = re.search(rf"(?m)^  {key}:\s*(\S+)", m.group(1))
        return km.group(1) == "true" if km else None

    mb = re.search(r"(?m)^models:.*\n((?:[ \t]+.*\n|-.*\n|[ \t]*\n|#.*\n)*)", t)
    models = re.findall(r"(?m)^[ \t]*- name:\s*(\S+)", mb.group(1)) if mb else []
    search = re.search(r"(?m)^  - name: web_search\s*\n(?:\s+#.*\n)*\s+group: web\s*\n\s+use:\s*(\S+)", t)
    return {
        "exists": True,
        "scheduler": block_flag("scheduler", "enabled"),
        "agents_api": block_flag("agents_api", "enabled"),
        "host_bash": block_flag("sandbox", "allow_host_bash"),
        "library_mount": "container_path: /mnt/library" in t,
        "models": models[:6],
        "search_provider": search.group(1).split(".")[2] if search and search.group(1).count(".") >= 2 else (search.group(1) if search else None),
    }


def gateway_up() -> bool:
    try:
        with urllib.request.urlopen(GATEWAY + "/health", timeout=1.5) as r:
            return r.status == 200
    except Exception:
        return False


def overview() -> dict:
    cfg = config_flags()
    reports = scan_reports()
    tasks = schedules()["tasks"]
    usage = usage_summary(7)
    calls = calls_data()
    week_ago = (dt.date.today() - dt.timedelta(days=7)).isoformat()
    return {
        "now": dt.datetime.now(dt.timezone.utc).isoformat(),
        "gateway_up": gateway_up(),
        "ui_url": UI,
        "desk_language": desk_language(),
        "db": str(db_path()) if db_path() else None,
        "library": str(LIBRARY),
        "library_exists": LIBRARY.exists(),
        "config": cfg,
        "reports_total": len(reports),
        "reports_7d": sum(1 for r in reports if r["date"] >= week_ago),
        "tasks_active": sum(1 for t in tasks if t["status"] in ("enabled", "active", "running")),
        "tasks_total": len(tasks),
        "tasks_failing": sum(1 for t in tasks if t.get("last_error")),
        "next_run": min((t["next_run_at"] for t in tasks if t["next_run_at"] and t["status"] in ("enabled", "active", "running")), default=None),
        "tokens_7d": usage["totals"]["tokens"],
        "runs_7d": usage["totals"]["runs"],
        "failed_runs_7d": usage["totals"]["failed"],
        "brier": calls["score"].get("brier"),
        "calls_open": sum(1 for c in calls["rows"] if c.get("status") == "open"),
    }


def schedules() -> dict:
    if not table_exists("scheduled_tasks"):
        return {"tasks": [], "runs": []}
    tasks = query("SELECT id, title, assistant_id, prompt, schedule_type, schedule_spec, timezone, status, next_run_at, last_run_at, "
                  "last_thread_id, last_error, run_count FROM scheduled_tasks ORDER BY title")
    for t in tasks:
        try:
            spec = json.loads(t["schedule_spec"]) if isinstance(t["schedule_spec"], str) else t["schedule_spec"]
        except (TypeError, json.JSONDecodeError):
            spec = {}
        t["schedule"] = spec.get("cron") or (f"every {spec.get('every_seconds')}s" if spec.get("every_seconds") else spec.get("run_at", ""))
        t["next_run_at"] = to_iso(t["next_run_at"])
        t["last_run_at"] = to_iso(t["last_run_at"])
        t["last_thread_url"] = f"{UI}/workspace/chats/{t['last_thread_id']}" if t.get("last_thread_id") else None
        t.pop("schedule_spec", None)
    has_runs = table_exists("runs")
    runs = query(
        "SELECT r.id, r.task_id, t.title, r.thread_id, r.run_id, r.scheduled_for, r.trigger, r.status, r.error, r.started_at, r.finished_at"
        + (", x.total_tokens, x.model_name" if has_runs else "")
        + " FROM scheduled_task_runs r LEFT JOIN scheduled_tasks t ON t.id = r.task_id"
        + (" LEFT JOIN runs x ON x.run_id = r.run_id" if has_runs else "")
        + " ORDER BY r.scheduled_for DESC LIMIT 60"
    ) if table_exists("scheduled_task_runs") else []
    for r in runs:
        for k in ("scheduled_for", "started_at", "finished_at"):
            r[k] = to_iso(r[k])
        r["thread_url"] = f"{UI}/workspace/chats/{r['thread_id']}" if r.get("thread_id") else None
    return {"tasks": tasks, "runs": runs}


def usage_summary(days: int = 30) -> dict:
    empty = {"days": [], "models": [], "totals": {"tokens": 0, "runs": 0, "failed": 0}, "recent_failures": []}
    if not table_exists("runs"):
        return empty
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%d")
    rows = query("SELECT substr(created_at,1,10) AS day, COUNT(*) AS runs, COALESCE(SUM(total_tokens),0) AS tokens, "
                 "SUM(CASE WHEN status IN ('error','timeout') THEN 1 ELSE 0 END) AS failed "
                 "FROM runs WHERE created_at >= ? GROUP BY day ORDER BY day", (since,))
    models = query("SELECT COALESCE(model_name,'(default)') AS model, COUNT(*) AS runs, COALESCE(SUM(total_tokens),0) AS tokens, "
                   "COALESCE(SUM(total_input_tokens),0) AS input_tokens, COALESCE(SUM(total_output_tokens),0) AS output_tokens "
                   "FROM runs WHERE created_at >= ? GROUP BY model ORDER BY tokens DESC", (since,))
    fails = query("SELECT run_id, thread_id, status, error, created_at, assistant_id FROM runs WHERE status IN ('error','timeout') "
                  "AND created_at >= ? ORDER BY created_at DESC LIMIT 15", (since,))
    for f in fails:
        f["created_at"] = to_iso(f["created_at"])
        f["thread_url"] = f"{UI}/workspace/chats/{f['thread_id']}"
    # fill missing days so the bar chart has an honest time axis
    by_day = {r["day"]: r for r in rows}
    start = dt.date.today() - dt.timedelta(days=days - 1)
    filled = []
    for i in range(days):
        d = (start + dt.timedelta(days=i)).isoformat()
        filled.append(by_day.get(d, {"day": d, "runs": 0, "tokens": 0, "failed": 0}))
    return {
        "days": filled,
        "models": models,
        "totals": {"tokens": sum(r["tokens"] for r in rows), "runs": sum(r["runs"] for r in rows), "failed": sum(r["failed"] or 0 for r in rows)},
        "recent_failures": fails,
    }


def import_thread_calls() -> int:
    """Agents sometimes write calls.csv into a conversation's outputs instead of /mnt/library.
    Merge those rows into the library ledger once (matched on asset + call text)."""
    import ledger as L  # noqa: E402  (skills/custom/market-data/scripts, on sys.path via stockapi)
    found = []
    for pattern in ("users/*/threads/*/user-data/outputs/**/calls.csv", "threads/*/user-data/outputs/**/calls.csv"):
        found += list(DF_HOME.glob(pattern))
    if not found:
        return 0
    lib = LIBRARY / "calls.csv"
    rows = L.load(lib) if lib.exists() else []
    seen = {(r.get("asset", "").strip(), r.get("call", "").strip()) for r in rows}
    nums = [int(r["id"][1:]) for r in rows if r.get("id", "")[1:].isdigit()]
    n = max(nums) if nums else 0
    added = 0
    for f in found:
        try:
            with f.open(newline="", encoding="utf-8") as fh:
                for r in csv.DictReader(fh):
                    key = ((r.get("asset") or "").strip(), (r.get("call") or "").strip())
                    if not key[1] or key in seen:
                        continue
                    n += 1
                    seen.add(key)
                    rows.append({**{k: (v or "") for k, v in r.items() if k}, "id": f"C{n:04d}"})
                    added += 1
        except (OSError, csv.Error):
            continue
    if added:
        LIBRARY.mkdir(parents=True, exist_ok=True)
        L.save(lib, rows)
    return added


def calls_data() -> dict:
    try:
        import_thread_calls()
    except Exception:
        traceback.print_exc()
    p = LIBRARY / "calls.csv"
    rows = []
    if p.exists():
        with p.open(newline="", encoding="utf-8") as fh:
            rows = list(csv.DictReader(fh))
        for r in rows:  # ledgers created before the `lang` column existed
            extra = r.pop(None, None)
            if extra and not r.get("lang"):
                r["lang"] = extra[0]
    done = [(float(r["prob"]), int(r["outcome"])) for r in rows if r.get("status") == "resolved" and r.get("outcome") in ("0", "1")]
    score: dict = {"resolved": len(done)}
    if done:
        score["brier"] = round(sum((p_ - o) ** 2 for p_, o in done) / len(done), 4)
        score["hit_rate"] = round(sum(1 for p_, o in done if (p_ >= 0.5) == (o == 1)) / len(done), 3)
        grouped: dict[int, list] = {}
        for p_, o in done:
            conf = max(p_, 1 - p_)
            grouped.setdefault(min(int(conf * 10), 9) * 10, []).append((conf, int((p_ >= 0.5) == (o == 1))))
        score["buckets"] = [{"bucket": f"{lo}–{lo + 10}%", "n": len(v), "stated": sum(c for c, _ in v) / len(v),
                             "realized": sum(r for _, r in v) / len(v)} for lo, v in sorted(grouped.items())]
    hist, hits, sq = [], 0, 0.0
    done_rows = sorted([r for r in rows if r.get("status") == "resolved" and r.get("outcome") in ("0", "1")],
                       key=lambda r: r.get("resolved") or r.get("resolve_by") or "")
    for i, r in enumerate(done_rows, 1):
        p_, o = float(r["prob"]), int(r["outcome"])
        hits += int((p_ >= 0.5) == (o == 1))
        sq += (p_ - o) ** 2
        hist.append({"date": r.get("resolved") or r.get("resolve_by"), "n": i, "hit_rate": round(hits / i, 3), "brier": round(sq / i, 4)})
    return {"rows": list(reversed(rows)), "score": score, "history": hist}


def watchlist() -> dict:
    p = LIBRARY / "watchlist.yaml"
    if not p.exists():
        return {"sections": [], "path": str(p), "exists": False}
    sections, cur = [], None
    for line in p.read_text(encoding="utf-8").splitlines():
        if re.match(r"^[A-Za-z_][\w-]*:\s*$", line):
            cur = {"name": line.strip()[:-1], "items": []}
            sections.append(cur)
        elif cur is not None and (m := re.match(r"^\s+-\s+(.*)$", line)):
            head, _, note = m.group(1).partition("|")
            bits = head.split(None, 1)
            cur["items"].append({"code": bits[0], "name": bits[1].strip() if len(bits) > 1 else "", "note": note.strip()})
    return {"sections": sections, "path": str(p), "exists": True}


# ------------------------------------------------------------------ 股市故事 (stock home)
import extras  # noqa: E402
import library  # noqa: E402
import stockapi  # noqa: E402

_STOCK_INDEX = None


def stock_index():
    global _STOCK_INDEX
    if _STOCK_INDEX is None:
        _STOCK_INDEX = stockapi.Index(DF_HOME, LIBRARY, query, table_exists, to_iso)
    return _STOCK_INDEX


def home() -> dict:
    with _LOCK:
        reports = scan_reports()
    wl = watchlist()
    codes = stockapi.watch_codes(wl)
    grouped = stock_index().groups(reports, codes, crud.prefs_load(LIBRARY))
    recent = sorted(
        [{"kind": "chat", "title": t["title"], "url": t["url"], "when": t["updated"] or "", "tickers": t["tickers"],
          "scheduled": t["scheduled"], "preview": t["preview"]} for t in stock_index().threads()[:60]]
        + [{"kind": "report", "title": r["title"], "id": r["id"], "when": r["date"], "tickers": r["codes"], "summary": r["summary"],
            "type": r["type"], "thread_url": r["thread_url"]} for r in reports[:60]],
        key=lambda x: x["when"] or "", reverse=True)[:60]
    names = stock_index().resolver.names
    notes = {}
    for sec in wl.get("sections", []):
        for it in sec.get("items", []):
            try:
                notes[stockapi.md.normalize_symbol(it["code"])] = it.get("note", "")
            except ValueError:
                pass
    today = dt.date.today()
    days = [(today - dt.timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    per_day = {d: 0 for d in days}
    for r in reports:
        if r["date"] in per_day:
            per_day[r["date"]] += 1
    return {"status": stockapi.market_status(), "watch": codes, "notes": notes,
            "names": {c: names.get(c, "") for g in grouped["groups"] for c in [g["code"]]},
            "report_total": len(reports), "report_days": [{"date": d, "n": per_day[d]} for d in days],
            "recent": recent, **grouped}


# ------------------------------------------------------------------ information levels: 今日 / 研报 / 项目 / 对话 / 股票
def _reports_locked() -> list[dict]:
    with _LOCK:
        return scan_reports()


def _slim_report(r: dict) -> dict:
    return {k: r.get(k) for k in ("id", "title", "date", "type", "mode", "summary", "stance", "confidence", "codes", "names",
                                  "read", "starred", "archived", "thread_id", "projects", "lang", "agent_path")}


def _quote_map(codes: list[str]) -> dict:
    try:
        return {q["symbol"]: q for q in stockapi.quotes(codes)}
    except Exception:
        traceback.print_exc()
        return {}


def brief() -> dict:
    """今日: one page — market moves, my watchlist, new reports, predictions to confirm, schedule status."""
    reports = _reports_locked()
    wl = watchlist()
    codes = stockapi.watch_codes(wl)
    notes = {}
    for sec in wl.get("sections", []):
        for it in sec.get("items", []):
            try:
                notes[stockapi.md.normalize_symbol(it["code"])] = it.get("note", "")
            except ValueError:
                pass
    qm = _quote_map(codes)
    names = stock_index().resolver.names
    latest_by_code: dict[str, dict] = {}
    for r in reports:
        if r["type"] in library.MARKET_WIDE:
            continue
        for c in r["codes"]:
            latest_by_code.setdefault(c, r)
    watch = []
    for c in codes:
        q = qm.get(c, {})
        lr = latest_by_code.get(c)
        watch.append({"code": c, "name": q.get("name") or names.get(c, ""), "price": q.get("price"), "change_pct": q.get("change_pct"),
                      "pe_ttm": q.get("pe_ttm"), "time": q.get("time"), "note": notes.get(c, ""),
                      "latest": {"id": lr["id"], "title": lr["title"], "stance": lr.get("stance"), "date": lr["date"]} if lr else None})
    try:
        strip = stockapi.market_strip()
    except Exception:
        traceback.print_exc()
        strip = []
    since = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    new = [_slim_report(r) for r in reports if r["date"] >= since and not r["archived"]]
    if len(new) < 3:
        new = [_slim_report(r) for r in reports if not r["archived"]][:6]
    cd = calls_data()
    today = dt.date.today().isoformat()
    due = [r for r in cd["rows"] if r.get("status") == "open" and (r.get("resolve_by") or "9") <= today]
    proposed = [r for r in cd["rows"] if r.get("status") == "proposed"]
    latest_brief = next((_slim_report(r) for r in reports if r["type"] == "daily-brief"), None)
    sd = schedules()
    sch = sd["tasks"]
    last_run = {}
    for r in sd["runs"]:
        if r["task_id"] in last_run:
            continue
        dur = None
        try:
            if r.get("started_at") and r.get("finished_at"):
                dur = int((dt.datetime.fromisoformat(r["finished_at"].replace("Z", "+00:00")) -
                           dt.datetime.fromisoformat(r["started_at"].replace("Z", "+00:00"))).total_seconds())
        except ValueError:
            pass
        last_run[r["task_id"]] = {"status": r.get("status"), "duration_s": dur, "tokens": r.get("total_tokens")}
    alert_pct = extras.settings_load(SETTINGS)["alert_pct"]
    alerts = [w for w in watch if w["change_pct"] is not None and abs(w["change_pct"]) >= alert_pct]
    return {
        "alerts": alerts, "alert_pct": alert_pct, "calendar": calendar_rows(10),
        "date": today, "status": stockapi.market_status(), "market": strip, "watch": watch,
        "new_reports": new, "unread": sum(1 for r in reports if not r["read"] and not r["archived"]),
        "latest_brief": latest_brief,
        "calls": {"due": due, "proposed": proposed, "open": sum(1 for r in cd["rows"] if r.get("status") == "open"), "score": cd["score"]},
        "schedules": [{"id": t["id"], "title": t["title"], "status": t["status"], "next_run_at": t["next_run_at"],
                       "last_run_at": t["last_run_at"], "last_error": t["last_error"], "last_thread_id": t["last_thread_id"],
                       "last_run": last_run.get(t["id"])} for t in sch],
    }


def chats_view(limit: int = 12) -> dict:
    idx = stock_index()
    prefs = crud.prefs_load(LIBRARY)
    proj = library.projects_by_member(LIBRARY)["threads"]
    out = []
    for t in idx.threads():
        if t["id"] in prefs["hidden_threads"]:
            continue
        out.append({"id": t["id"], "title": t["title"], "url": t["url"], "updated": t["updated"], "scheduled": t["scheduled"],
                    "tickers": t["tickers"][:6], "names": [idx.resolver.names.get(c, "") for c in t["tickers"][:6]],
                    "n_tickers": len(t["tickers"]), "projects": proj.get(t["id"], []), "preview": t["preview"]})
    return {"chats": out[:max(1, min(limit, 500))], "total": len(out)}


def projects_view() -> dict:
    reports = _reports_locked()
    by_id = {r["id"]: r for r in reports}
    threads = stock_index().threads()
    names = stock_index().resolver.names
    out = []
    for p in library.projects_list(LIBRARY):
        rs = [by_id[x] for x in p.get("reports", []) if x in by_id]
        out.append({**p, "n_reports": len(rs), "n_threads": len(p.get("threads", [])),
                    "unread": sum(1 for r in rs if not r["read"]), "latest": max((r["date"] for r in rs), default=p.get("created", "")),
                    "names": [names.get(c, "") for c in p.get("codes", [])][:8]})
    out.sort(key=lambda x: x["latest"] or "", reverse=True)
    return {"projects": out, "suggestions": library.suggestions(LIBRARY, reports, threads, names)}


def project_view(pid: str) -> dict:
    p = next((x for x in library.projects_list(LIBRARY) if x["id"] == pid), None)
    if not p:
        raise ValueError("找不到这个项目")
    reports = _reports_locked()
    by_id = {r["id"]: r for r in reports}
    tmap = {t["id"]: t for t in stock_index().threads()}
    names = stock_index().resolver.names
    return {"project": p, "reports": [_slim_report(by_id[x]) for x in p.get("reports", []) if x in by_id],
            "threads": [{k: tmap[x][k] for k in ("id", "title", "url", "updated", "tickers")} for x in p.get("threads", []) if x in tmap],
            "stocks": [{"code": c, "name": names.get(c, "")} for c in p.get("codes", [])]}


def search(q: str) -> dict:
    q = (q or "").strip()
    if not q:
        return {"stocks": [], "reports": [], "chats": [], "projects": []}
    ql = q.lower()
    idx = stock_index()
    names = idx.resolver.names
    stocks: dict[str, str] = {}
    for c, n in names.items():
        if ql in n.lower() or ql in c:
            stocks[c] = n
    for alias, c in stockapi.ALIASES.items():
        if ql in alias.lower():
            stocks[c] = names.get(c, alias)
    if re.fullmatch(r"(?i)(sh|sz|bj)?\d{6}|hk\d{4,5}|\d{4,5}\.hk", q):
        try:
            c = stockapi.md.normalize_symbol(q)
            if c not in stocks:
                qq = _quote_map([c]).get(c)
                if qq:
                    stocks[c] = qq.get("name", "")
                    idx.resolver.learn(c, qq.get("name", ""))
        except ValueError:
            pass
    reports = [r for r in _reports_locked() if ql in r["title"].lower() or ql in (r["summary"] or "").lower()
               or any(ql in (n or "").lower() for n in r["names"]) or any(ql in c for c in r["codes"])]
    chats = [t for t in idx.threads() if ql in t["title"].lower() or ql in (t["preview"] or "").lower()
             or any(ql in names.get(c, "").lower() or ql in c for c in t["tickers"])]
    projects = [p for p in library.projects_list(LIBRARY) if ql in p["name"].lower()]
    return {"stocks": [{"code": c, "name": n} for c, n in list(stocks.items())[:8]],
            "reports": [_slim_report(r) for r in reports[:10]],
            "chats": [{"id": t["id"], "title": t["title"], "url": t["url"], "updated": t["updated"]} for t in chats[:8]],
            "projects": [{"id": p["id"], "name": p["name"]} for p in projects[:6]]}


def read_thesis(code: str) -> dict | None:
    p = LIBRARY / "theses" / f"{code}.md"
    if not p.exists():
        return None
    meta, body = parse_front_matter(p.read_text(encoding="utf-8", errors="replace"))
    pillars, in_p = [], False
    for line in body.splitlines():
        if line.startswith("## "):
            in_p = line.strip().startswith("## 支柱")
            continue
        if in_p and line.startswith("|") and not re.match(r"^\|\s*[-:#]", line):
            cells = [c.strip() for c in line.strip("|").split("|")]
            if len(cells) >= 2 and cells[1] and cells[1] != "支柱":
                pillars.append(" · ".join(c for c in (cells[1], cells[-1]) if c))
    return {"status": meta.get("status", "intact"), "stance": meta.get("stance"), "confidence": meta.get("confidence"),
            "updated": meta.get("updated"), "summary": meta.get("summary", ""), "pillars": pillars[:6],
            "path": "/mnt/library/theses/" + p.name}


def calendar_rows(days: int = 14) -> list[dict]:
    """Rows from /mnt/library/calendar.md (kept by catalyst-calendar-zh) for the next N days."""
    p = LIBRARY / "calendar.md"
    if not p.exists():
        return []
    today = dt.date.today()
    out = []
    for line in p.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"^\|\s*(\d{4}-\d{2}-\d{2})\s*\|(.*)\|\s*$", line)
        if not m:
            continue
        try:
            d = dt.date.fromisoformat(m.group(1))
        except ValueError:
            continue
        if not (today <= d <= today + dt.timedelta(days=days)):
            continue
        cells = [c.strip().strip("*") for c in m.group(2).split("|")] + [""] * 5
        out.append({"date": m.group(1), "time": cells[0], "event": cells[1], "related": cells[2], "importance": cells[3], "source": cells[4]})
    return sorted(out, key=lambda r: (r["date"], r["time"]))


def stock_view(code: str) -> dict:
    code = stockapi.md.normalize_symbol(code)
    idx = stock_index()
    reports = [r for r in _reports_locked() if code in r["codes"]]
    own = [r for r in reports if r["type"] not in library.MARKET_WIDE]
    latest = next((r for r in own if r.get("stance") or r.get("summary")), own[0] if own else None)
    wl = watchlist()
    note, watch = "", False
    for sec in wl.get("sections", []):
        for it in sec.get("items", []):
            try:
                if stockapi.md.normalize_symbol(it["code"]) == code:
                    watch, note = True, it.get("note", "")
            except ValueError:
                pass
    q = _quote_map([code]).get(code, {})
    name = q.get("name") or idx.resolver.names.get(code, "")
    chats = [{"id": t["id"], "title": t["title"], "url": t["url"], "updated": t["updated"], "others": len(t["tickers"]) - 1}
             for t in idx.threads() if code in t["tickers"]]
    projects = [{"id": p["id"], "name": p["name"]} for p in library.projects_list(LIBRARY) if code in p.get("codes", [])
                or any(r["id"] in p.get("reports", []) for r in reports)]
    return {"code": code, "name": name, "quote": q, "watch": watch, "note": note, "thesis": read_thesis(code),
            "view": _slim_report(latest) if latest else None,
            "reports": [_slim_report(r) for r in reports], "chats": chats, "projects": projects}


def thread_view(tid: str) -> dict:
    idx = stock_index()
    t = next((x for x in idx.threads() if x["id"] == tid), None)
    allr = _reports_locked()
    reports = [_slim_report(r) for r in allr if r.get("thread_id") == tid]
    linked_ids = library.thread_links(LIBRARY).get(tid, [])
    linked = [_slim_report(r) for r in allr if r["id"] in linked_ids]
    proj = library.projects_by_member(LIBRARY)["threads"].get(tid, [])
    tickers = t["tickers"] if t else []
    return {"id": tid, "title": t["title"] if t else "", "scheduled": t["scheduled"] if t else None,
            "stocks": [{"code": c, "name": idx.resolver.names.get(c, "")} for c in tickers[:20]], "n_stocks": len(tickers),
            "reports": reports, "linked": linked, "projects": proj, "all_projects": [{"id": p["id"], "name": p["name"]} for p in library.projects_list(LIBRARY)]}


# ------------------------------------------------------------------ http
class Handler(BaseHTTPRequestHandler):
    server_version = "MarketDesk/1.0"

    def log_message(self, fmt, *args):  # quiet
        pass

    def _send(self, code: int, body: bytes, ctype: str):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False, default=str).encode(), "application/json; charset=utf-8")

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html", "/zh", "/zh/", "/en", "/en/"):
                return self._send(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
            if u.path == "/api/overview":
                return self._json(overview())
            if u.path == "/api/reports":
                with _LOCK:
                    return self._json(scan_reports())
            if u.path == "/api/report":
                rid = (qs.get("id") or [""])[0]
                with _LOCK:
                    if rid not in _INDEX:
                        scan_reports()
                    p = _INDEX.get(rid)
                if not p or not p.exists():
                    return self._json({"error": "not found"}, 404)
                meta, body = parse_front_matter(p.read_text(encoding="utf-8", errors="replace"))
                return self._json({"meta": meta, "body": body, "path": str(p)})
            if u.path == "/api/schedules":
                return self._json(schedules())
            if u.path == "/api/usage":
                return self._json(usage_summary(int((qs.get("days") or ["30"])[0])))
            if u.path == "/api/calls":
                return self._json(calls_data())
            if u.path == "/api/watchlist":
                return self._json(watchlist())
            if u.path == "/api/home":
                return self._json(home())
            if u.path == "/api/tickers":
                h = home()
                slim = lambda t: {k: t[k] for k in ("id", "title", "url", "updated", "others") if k in t}
                return self._json({"groups": [{"code": g["code"], "name": g["name"], "watch": g["watch"], "reports": len(g["reports"]),
                                                "threads": [slim(t) for t in g["threads"]]} for g in h["groups"] if g["threads"]],
                                   "multi": [slim(t) for t in h["multi"]], "scheduled": [slim(t) for t in h["scheduled"]],
                                   "untagged": [slim(t) for t in h["untagged"]], "hidden": h["hidden"]})
            if u.path == "/api/strip":
                return self._json({"status": stockapi.market_status(), "rows": stockapi.market_strip()})
            if u.path == "/api/quotes":
                codes = [c for c in (qs.get("codes") or [""])[0].split(",") if c]
                return self._json(stockapi.quotes(codes))
            if u.path == "/api/spark":
                codes = [c for c in (qs.get("codes") or [""])[0].split(",") if c]
                return self._json(stockapi.sparks(codes))
            if u.path == "/api/keys":
                return self._json(stockapi.keys_status())
            if u.path == "/api/calendar":
                return self._json({"rows": calendar_rows(int((qs.get("days") or ["30"])[0]))})
            if u.path == "/api/version":
                return self._json({"api": API_VERSION, "pid": os.getpid(), "started": _STARTED})
            if u.path == "/api/health":
                return self._json(extras.health(REPO, LIBRARY, GATEWAY, stockapi.keys_status, schedules, len(_reports_locked())))
            if u.path == "/api/settings":
                return self._json(extras.settings_load(SETTINGS))
            if u.path == "/api/history":
                code = stockapi.md.normalize_symbol((qs.get("code") or [""])[0])
                days = int((qs.get("days") or ["120"])[0])
                return self._json(stockapi.cached_swr(f"hist:{code}:{days}", 600, lambda: stockapi.md.tx_history(code, days)))
            if u.path == "/api/brief":
                return self._json(brief())
            if u.path == "/api/projects":
                return self._json(projects_view())
            if u.path == "/api/project":
                return self._json(project_view((qs.get("id") or [""])[0]))
            if u.path == "/api/search":
                return self._json(search((qs.get("q") or [""])[0]))
            if u.path == "/api/stock":
                return self._json(stock_view((qs.get("code") or [""])[0]))
            if u.path == "/api/thread":
                return self._json(thread_view((qs.get("id") or [""])[0]))
            if u.path == "/api/chats":
                return self._json(chats_view(int((qs.get("limit") or ["12"])[0])))
            return self._json({"error": "unknown path"}, 404)
        except BrokenPipeError:
            pass
        except ValueError as e:
            return self._json({"error": str(e)}, 400)
        except Exception as e:  # surface errors to the page instead of a blank screen (and to logs/dashboard.log)
            traceback.print_exc()
            return self._json({"error": f"{type(e).__name__}: {e}"}, 500)


# ------------------------------------------------------------------ CRUD (watchlist, reports, trash, calls)
import crud  # noqa: E402


def _report_path(rid: str) -> Path:
    with _LOCK:
        if rid not in _INDEX:
            scan_reports()
        p = _INDEX.get(rid)
    if not p or not p.exists():
        raise ValueError("找不到这份研报（可能已被删除）")
    rp = p.resolve()
    if not (rp.is_relative_to(LIBRARY.resolve()) or rp.is_relative_to(DF_HOME.resolve())):
        raise ValueError("只能修改研报库或对话产出里的文件")
    return p


def crud_post(path: str, b: dict):
    wl = LIBRARY / "watchlist.yaml"
    ledger = LIBRARY / "calls.csv"
    s = lambda k, d="": str(b.get(k) if b.get(k) is not None else d)  # noqa: E731
    if path == "/api/watchlist/add":
        LIBRARY.mkdir(parents=True, exist_ok=True)
        return crud.watch_add(wl, s("code"), s("note"), s("name"))
    if path == "/api/watchlist/remove":
        return crud.watch_remove(wl, s("code"))
    if path == "/api/watchlist/note":
        return crud.watch_note(wl, s("code"), s("note"))
    if path == "/api/reports/create":
        title = s("title").strip() or library.clean_title(s("body"))
        if not title:
            raise ValueError("请填写标题")
        tickers = list(b.get("tickers") or [])
        if not tickers and s("body"):
            tickers = sorted(stockapi.extract(s("body"), stock_index().resolver))[:12]
        r = crud.report_create(LIBRARY, title, s("body"), tickers, s("type", "note") or "note", s("thread_id"), s("summary"))
        rid = report_id(Path(r["path"]))
        if b.get("project"):
            library.project_update(LIBRARY, s("project"), add={"reports": [rid]})
        return {**r, "id": rid}
    if path == "/api/reports/state":
        ids = [str(x) for x in (b.get("ids") or ([b["id"]] if b.get("id") else []))]
        if not ids:
            raise ValueError("没有指定研报")
        return library.set_report_state(LIBRARY, ids, read=b.get("read"), starred=b.get("starred"), archived=b.get("archived"), note=b.get("note"))
    if path == "/api/projects/create":
        return library.project_create(LIBRARY, s("name"), b.get("reports") or [], b.get("threads") or [], b.get("codes") or [], s("key"), s("icon"))
    if path == "/api/projects/update":
        return library.project_update(LIBRARY, s("id"), b.get("name"), b.get("add"), b.get("remove"))
    if path == "/api/projects/delete":
        return library.project_delete(LIBRARY, s("id"))
    if path == "/api/self-restart":
        self_restart()
        return {"ok": True, "message": "数据服务正在重启，几秒后恢复"}
    if path == "/api/settings":
        return extras.settings_save(SETTINGS, b)
    if path == "/api/backup":
        return extras.backup_now(LIBRARY, keep=extras.settings_load(SETTINGS)["backup_keep"])
    if path == "/api/notify-test":
        return {"ok": extras.notify("测试通知", "通知可以正常显示 ✓")}
    if path == "/api/thread/link":
        return library.link_thread(LIBRARY, s("thread"), s("report"))
    if path == "/api/projects/dismiss":
        return library.dismiss_suggestion(LIBRARY, s("key"))
    if path == "/api/reports/update":
        return crud.report_update(_report_path(s("id")), b)
    if path == "/api/reports/delete":
        p = _report_path(s("id"))
        meta, body = parse_front_matter(p.read_text(encoding="utf-8", errors="replace"))
        r = crud.report_delete(LIBRARY, p, meta.get("title") or first_heading(body) or p.stem)
        with _LOCK:
            _INDEX.pop(s("id"), None)
        return r
    if path == "/api/trash":
        return {"items": crud.trash_list(LIBRARY)}
    if path == "/api/trash/restore":
        return crud.trash_restore(LIBRARY, s("id"))
    if path == "/api/trash/purge":
        return crud.trash_purge(LIBRARY, s("id"))
    if path == "/api/sidebar":
        r = crud.prefs_update(LIBRARY, s("action"), s("code"), s("thread"))
        return r
    if path == "/api/refresh":  # e.g. right after a conversation was deleted
        stock_index().forget_cache()
        return {"ok": True}
    if path == "/api/calls/add":
        return crud.calls_add(ledger, s("asset"), s("call"), float(b.get("prob") or 0), s("resolve_by"), s("lang", "zh"))
    if path == "/api/calls/resolve":
        return crud.calls_resolve(ledger, s("id"), s("outcome"), s("note"))
    if path == "/api/calls/delete":
        return crud.calls_delete(ledger, s("id"))
    return None


def _post(self):
    u = urllib.parse.urlparse(self.path)
    if self.headers.get("X-Desk") != "1":  # custom header => cross-site pages can't send this without CORS approval
        return self._json({"error": "forbidden"}, 403)
    try:
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_MD_BYTES:
            return self._json({"error": "内容太大"}, 413)
        body = json.loads(self.rfile.read(n) or b"{}")
        r = crud_post(u.path, body)
        if r is not None:
            return self._json(r)
        if u.path == "/api/keys":
            return self._json(stockapi.keys_set(str(body.get("var", "")), str(body.get("value", ""))))
        if u.path == "/api/search":
            return self._json(stockapi.search_set(str(body.get("name", ""))))
        if u.path == "/api/restart":
            return self._json(stockapi.restart())
        return self._json({"error": "unknown path"}, 404)
    except ValueError as e:
        return self._json({"error": str(e)}, 400)
    except Exception as e:
        traceback.print_exc()
        return self._json({"error": f"{type(e).__name__}: {e}"}, 500)


Handler.do_POST = _post


# ------------------------------------------------------------------ self-healing
API_VERSION = 8  # bump when the frontend needs new fields; the UI checks /api/version


def _code_files() -> list[Path]:
    return list(HERE.glob("*.py")) + list((REPO / "skills" / "custom" / "market-data" / "scripts").glob("*.py"))


def _code_stamp() -> float:
    return max((p.stat().st_mtime for p in _code_files() if p.exists()), default=0.0)


def self_restart(delay: float = 0.3) -> None:
    """Replace this process with a fresh copy of itself (picks up updated code, same port)."""
    def go():
        time.sleep(delay)
        sys.stdout.flush()
        sys.stderr.flush()
        os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())] + sys.argv[1:])
    threading.Thread(target=go, daemon=True).start()


def _auto_reload() -> None:
    """Reload automatically a few seconds after any data-service file is updated, so a UI update
    can never run against an old data service."""
    start = _code_stamp()
    while True:
        time.sleep(4)
        try:
            if _code_stamp() > start + 0.5:
                time.sleep(1.5)  # let the update finish writing every file
                print("code changed — reloading data service", flush=True)
                self_restart(0)
                return
        except Exception:
            traceback.print_exc()


def _agent_skill_guard() -> None:
    """Keep agents runnable on the local sandbox: strip per-agent skill whitelists (startup + every 20s,
    so an agent edited or created in the UI is fixed before its next chat)."""
    import importlib.util
    path = Path(__file__).resolve().parents[1] / "setup" / "fix_agent_skills.py"
    try:
        spec = importlib.util.spec_from_file_location("fix_agent_skills", path)
        mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
    except Exception as e:  # noqa: BLE001
        print(f"agent skill guard unavailable: {e}", file=sys.stderr)
        return

    def loop() -> None:
        while True:
            try:
                mod.main()
            except Exception as e:  # noqa: BLE001
                print(f"agent skill guard: {e}", file=sys.stderr)
            time.sleep(20)

    threading.Thread(target=loop, daemon=True, name="agent-skill-guard").start()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=2027)
    ap.add_argument("--open", action="store_true", help="open the browser")
    a = ap.parse_args()
    srv = None
    _agent_skill_guard()
    for attempt in range(20):  # after a self-restart the old socket may need a moment
        try:
            srv = ThreadingHTTPServer((a.host, a.port), Handler)
            break
        except OSError:
            if attempt == 19:
                raise
            time.sleep(0.5)
    assert srv is not None
    threading.Thread(target=_auto_reload, daemon=True).start()

    def warm():  # fill caches right away so the first page load is fast
        for f in (lambda: stockapi.market_strip(), lambda: brief(), lambda: chats_view()):
            try:
                f()
            except Exception:
                traceback.print_exc()
    threading.Thread(target=warm, daemon=True).start()
    extras.Watcher(LIBRARY, SETTINGS, _reports_locked,
                   lambda: stockapi.quotes(stockapi.watch_codes(watchlist())),
                   lambda: stockapi.market_status()["state"] in ("open", "auction")).start()
    url = f"http://{a.host}:{a.port}"
    print(f"Market Desk on {url}\n  library : {LIBRARY}\n  deerflow: {DF_HOME}  (db: {db_path() or 'not created yet'})\nCtrl-C to stop.")
    if a.open:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
