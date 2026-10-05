"""Reader state and projects for 📈 股市故事 — plain JSON files in market-desk/library/.

  .state.json      per-report reader state: read / starred / archived / note
  projects.json    projects (themes) holding reports + conversations, and dismissed suggestions

Information levels: 今日 (brief) → 研报 (inbox, primary) → 项目 (themes holding reports + chats)
→ 对话 (recent) → 股票 (search / stock page, never a sidebar tree).
"""

from __future__ import annotations

import datetime as dt
import json
import re
import threading
import uuid
from pathlib import Path

_LOCK = threading.Lock()


def _load(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _save(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


# ------------------------------------------------------------------ reader state
def report_state(library: Path) -> dict:
    return _load(library / ".state.json", {}).get("reports", {})


def set_report_state(library: Path, ids: list[str], **fields) -> dict:
    """fields: read / starred / archived (bool), note (str). Several ids at once (e.g. 'mark all read')."""
    allowed = {"read", "starred", "archived", "note"}
    with _LOCK:
        data = _load(library / ".state.json", {})
        reps = data.setdefault("reports", {})
        for rid in ids:
            cur = reps.setdefault(rid, {})
            for k, v in fields.items():
                if k not in allowed or v is None:
                    continue
                if k == "read":
                    cur["read"] = dt.datetime.now().isoformat(timespec="seconds") if v else ""
                elif k == "note":
                    cur["note"] = str(v)[:20000]
                else:
                    cur[k] = bool(v)
            reps[rid] = {k: v for k, v in cur.items() if v}
            if not reps[rid]:
                reps.pop(rid)
        _save(library / ".state.json", data)
    return {"ok": True}


# ------------------------------------------------------------------ projects
def _projects(library: Path) -> dict:
    d = _load(library / "projects.json", {})
    d.setdefault("projects", [])
    d.setdefault("dismissed", [])
    return d


def projects_by_member(library: Path) -> dict:
    out: dict = {"reports": {}, "threads": {}}
    for p in _projects(library)["projects"]:
        ref = {"id": p["id"], "name": p["name"]}
        for r in p.get("reports", []):
            out["reports"].setdefault(r, []).append(ref)
        for t in p.get("threads", []):
            out["threads"].setdefault(t, []).append(ref)
    return out


def projects_list(library: Path) -> list[dict]:
    return _projects(library)["projects"]


def project_create(library: Path, name: str, reports=(), threads=(), codes=(), key: str = "", icon: str = "") -> dict:
    name = (name or "").strip()
    if not name:
        raise ValueError("请给项目起个名字")
    with _LOCK:
        d = _projects(library)
        p = {"id": uuid.uuid4().hex[:10], "name": name[:60], "icon": icon, "created": dt.date.today().isoformat(),
             "reports": list(dict.fromkeys(reports)), "threads": list(dict.fromkeys(threads)), "codes": list(dict.fromkeys(codes)),
             "from_suggestion": key}
        d["projects"].insert(0, p)
        if key and key not in d["dismissed"]:
            d["dismissed"].append(key)  # accepted suggestions don't come back
        _save(library / "projects.json", d)
    return {"ok": True, "project": p}


def project_update(library: Path, pid: str, name: str | None = None, add: dict | None = None, remove: dict | None = None) -> dict:
    with _LOCK:
        d = _projects(library)
        p = next((x for x in d["projects"] if x["id"] == pid), None)
        if not p:
            raise ValueError("找不到这个项目")
        if name is not None and name.strip():
            p["name"] = name.strip()[:60]
        for kind in ("reports", "threads", "codes"):
            for v in (add or {}).get(kind, []) or []:
                if v not in p.setdefault(kind, []):
                    p[kind].append(v)
            for v in (remove or {}).get(kind, []) or []:
                if v in p.get(kind, []):
                    p[kind].remove(v)
        _save(library / "projects.json", d)
    return {"ok": True, "project": p}


def project_delete(library: Path, pid: str) -> dict:
    """Deletes only the folder; its reports and conversations stay where they are."""
    with _LOCK:
        d = _projects(library)
        before = len(d["projects"])
        d["projects"] = [x for x in d["projects"] if x["id"] != pid]
        if len(d["projects"]) == before:
            raise ValueError("找不到这个项目")
        _save(library / "projects.json", d)
    return {"ok": True}


def dismiss_suggestion(library: Path, key: str) -> dict:
    with _LOCK:
        d = _projects(library)
        if key not in d["dismissed"]:
            d["dismissed"].append(key)
        _save(library / "projects.json", d)
    return {"ok": True}


MARKET_WIDE = {"daily-brief", "announcements", "weekly-review"}


def suggestions(library: Path, reports: list[dict], threads: list[dict], names: dict) -> list[dict]:
    """Auto-suggested projects (the user confirms or dismisses):
       1. a research conversation that produced 2+ reports  → 「<conversation title>」
       2. a stock with 3+ reports not yet in any project    → 「<name> 跟踪」
       3. several reports of one type (market-sizing)       → 「行业研究」"""
    d = _projects(library)
    taken_r = {r for p in d["projects"] for r in p.get("reports", [])}
    taken_t = {t for p in d["projects"] for t in p.get("threads", [])}
    dismissed = set(d["dismissed"])
    titles = {t["id"]: t["title"] for t in threads}
    out = []
    by_thread: dict[str, list[dict]] = {}
    for r in reports:
        if r.get("thread_id") and r.get("type") not in MARKET_WIDE:
            by_thread.setdefault(r["thread_id"], []).append(r)
    for tid, rs in by_thread.items():
        key = f"t:{tid}"
        free = [r for r in rs if r["id"] not in taken_r]
        if len(rs) >= 2 and free and key not in dismissed and tid not in taken_t:
            codes = sorted({c for r in rs for c in r.get("codes", [])})
            title = titles.get(tid) or rs[0]["title"]
            out.append({"key": key, "name": title[:40], "why": f"同一次研究写出了 {len(rs)} 份研报",
                        "reports": [r["id"] for r in rs], "threads": [tid], "codes": codes[:30]})
    by_code: dict[str, list[dict]] = {}
    for r in reports:
        if r.get("type") in MARKET_WIDE:
            continue
        for c in r.get("codes", []):
            by_code.setdefault(c, []).append(r)
    for c, rs in sorted(by_code.items(), key=lambda kv: -len(kv[1])):
        key = f"c:{c}"
        free = [r for r in rs if r["id"] not in taken_r]
        if len(rs) >= 3 and len(free) >= 2 and key not in dismissed:
            nm = names.get(c) or c
            out.append({"key": key, "name": f"{nm} 跟踪", "why": f"{len(rs)} 份研报都写到了{nm}",
                        "reports": [r["id"] for r in rs], "threads": sorted({r["thread_id"] for r in rs if r.get("thread_id")}),
                        "codes": [c]})
    sizing = [r for r in reports if r.get("type") == "market-sizing" and r["id"] not in taken_r]
    if len(sizing) >= 2 and "type:market-sizing" not in dismissed:
        out.append({"key": "type:market-sizing", "name": "行业研究", "why": f"{len(sizing)} 份行业/市场规模研究",
                    "reports": [r["id"] for r in sizing], "threads": [], "codes": []})
    return out[:8]


# ------------------------------------------------------------------ helpers
def week_bucket(date: str, today: dt.date | None = None) -> str:
    today = today or dt.date.today()
    try:
        d = dt.date.fromisoformat(date[:10])
    except ValueError:
        return "更早"
    delta = (today - d).days
    if delta <= 0:
        return "今天"
    if delta == 1:
        return "昨天"
    if delta < 7:
        return "本周"
    if delta < 31:
        return "本月"
    return "更早"


def clean_title(text: str, fallback: str = "对话笔记") -> str:
    m = re.search(r"(?m)^#{1,3}\s+(.+)$", text or "")
    if m:
        return m.group(1).strip()[:60]
    first = re.sub(r"\s+", " ", (text or "").strip())[:40]
    return first or fallback


# ------------------------------------------------------------------ chat ↔ report links ("追问" a report)
def link_thread(library: Path, thread: str, report: str) -> dict:
    if not thread or not report:
        raise ValueError("缺少对话或研报")
    with _LOCK:
        d = _load(library / ".links.json", {})
        lst = d.setdefault(thread, [])
        if report not in lst:
            lst.append(report)
        _save(library / ".links.json", d)
    return {"ok": True}


def thread_links(library: Path) -> dict:
    return _load(library / ".links.json", {})
