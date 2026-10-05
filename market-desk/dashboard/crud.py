"""Create / update / delete for the 股市故事 dashboard: watchlist, reports, prediction ledger.

Deleted reports are moved to market-desk/library/.trash/ (restorable), never erased.
All writes are plain files under the repo, so the agents see the same data.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
sys.path.insert(0, str(REPO / "skills" / "custom" / "market-data" / "scripts"))
import ledger as L  # noqa: E402
import market_data as md  # noqa: E402


# ------------------------------------------------------------------ watchlist.yaml
SECTION_FOR = {"sh": "a_shares", "sz": "a_shares", "bj": "a_shares", "hk": "hong_kong", "us": "us"}
SECTION_TITLE = {"a_shares": "a_shares", "hong_kong": "hong_kong", "us": "us"}


def _code_of_line(line: str) -> str | None:
    m = re.match(r"^\s+-\s+(\S+)", line)
    if not m:
        return None
    try:
        return md.normalize_symbol(m.group(1))
    except ValueError:
        return m.group(1)


def watch_add(path: Path, code: str, note: str = "", name: str = "") -> dict:
    code = md.normalize_symbol(code)
    if not name:
        try:
            q = md.tx_quotes([code])
            name = q[0]["name"] if q else ""
        except Exception:
            name = ""
        if not name:
            raise ValueError(f"找不到股票 {code}，请检查代码")
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else ["# 自选列表"]
    if any(_code_of_line(ln) == code for ln in lines):
        raise ValueError(f"{name}（{code}）已经在自选里了")
    section = SECTION_FOR.get(code[:2], "a_shares")
    entry_code = code if code[:2] in ("hk", "us") else code[2:]
    entry = f"  - {entry_code} {name}" + (f" | {note.strip()}" if note.strip() else "")
    idx = next((i for i, ln in enumerate(lines) if ln.strip() == f"{section}:"), None)
    if idx is None:
        lines += ["", f"{section}:", entry]
    else:
        last, end = idx, idx + 1
        while end < len(lines) and (lines[end].startswith((" ", "\t", "#")) or not lines[end].strip()):
            if lines[end].strip() and not lines[end].lstrip().startswith("#"):
                last = end
            end += 1
        lines.insert(last + 1, entry)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return {"ok": True, "code": code, "name": name}


def watch_remove(path: Path, code: str) -> dict:
    code = md.normalize_symbol(code)
    lines = path.read_text(encoding="utf-8").splitlines()
    kept = [ln for ln in lines if _code_of_line(ln) != code]
    if len(kept) == len(lines):
        raise ValueError("不在自选列表里")
    path.write_text("\n".join(kept) + "\n", encoding="utf-8")
    return {"ok": True}


def watch_note(path: Path, code: str, note: str) -> dict:
    code = md.normalize_symbol(code)
    lines = path.read_text(encoding="utf-8").splitlines()
    for i, ln in enumerate(lines):
        if _code_of_line(ln) == code:
            head = ln.split("|", 1)[0].rstrip()
            lines[i] = head + (f" | {note.strip()}" if note.strip() else "")
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            return {"ok": True}
    raise ValueError("不在自选列表里")


# ------------------------------------------------------------------ reports
def _split_fm(text: str) -> tuple[list[str], str]:
    if text.startswith("---"):
        end = text.find("\n---", 3)
        if end != -1:
            return text[3:end].strip("\n").splitlines(), text[end + 4:].lstrip("\n")
    return [], text


def _fm_set(lines: list[str], key: str, value) -> list[str]:
    if isinstance(value, list):
        rendered = "[" + ", ".join(str(v) for v in value) + "]"
    else:
        rendered = json.dumps(str(value), ensure_ascii=False)
    out, done = [], False
    for ln in lines:
        if re.match(rf"^{re.escape(key)}:", ln):
            out.append(f"{key}: {rendered}")
            done = True
        else:
            out.append(ln)
    if not done:
        out.append(f"{key}: {rendered}")
    return out


def report_update(path: Path, fields: dict) -> dict:
    text = path.read_text(encoding="utf-8")
    fm, body = _split_fm(text)
    for k in ("title", "summary", "type", "stance", "confidence"):
        if k in fields and fields[k] is not None:
            fm = _fm_set(fm, k, fields[k])
    if "tickers" in fields and fields["tickers"] is not None:
        codes = []
        for t in fields["tickers"]:
            try:
                codes.append(md.normalize_symbol(str(t)))
            except ValueError:
                pass
        fm = _fm_set(fm, "tickers", codes)
    if "body" in fields and fields["body"] is not None:
        body = fields["body"]
    path.write_text("---\n" + "\n".join(fm) + "\n---\n\n" + body, encoding="utf-8")
    return {"ok": True}


def report_create(library: Path, title: str, body: str, tickers: list[str], rtype: str = "note", thread_id: str = "", summary: str = "") -> dict:
    today = dt.date.today()
    slug = re.sub(r"[^\w一-鿿-]+", "-", title).strip("-")[:40] or "note"
    folder = library / "reports" / f"{today:%Y}" / f"{today:%m}"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{today}-{slug}-zh.md"
    n = 2
    while path.exists():
        path = folder / f"{today}-{slug}-{n}-zh.md"
        n += 1
    codes = []
    for t in tickers:
        try:
            codes.append(md.normalize_symbol(str(t)))
        except ValueError:
            pass
    fm = [f"title: {json.dumps(title, ensure_ascii=False)}", f"date: {today}", f"type: {rtype}", "lang: zh",
          f"tickers: [{', '.join(codes)}]", f"summary: {json.dumps(summary[:200], ensure_ascii=False)}"]
    if thread_id:
        fm.append(f"thread_id: {thread_id}")
    path.write_text("---\n" + "\n".join(fm) + "\n---\n\n" + (body or f"# {title}\n"), encoding="utf-8")
    return {"ok": True, "path": str(path)}


def _trash_index(library: Path) -> tuple[Path, list[dict]]:
    p = library / ".trash" / "index.json"
    try:
        return p, json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return p, []


def report_delete(library: Path, path: Path, title: str) -> dict:
    idx_path, idx = _trash_index(library)
    idx_path.parent.mkdir(parents=True, exist_ok=True)
    tid = dt.datetime.now().strftime("%Y%m%d%H%M%S%f")
    dest = idx_path.parent / f"{tid}-{path.name}"
    shutil.move(str(path), dest)
    idx.append({"id": tid, "title": title, "from": str(path), "file": dest.name, "deleted": dt.datetime.now().isoformat(timespec="seconds")})
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True, "trash_id": tid}


def trash_list(library: Path) -> list[dict]:
    return list(reversed(_trash_index(library)[1]))


def trash_restore(library: Path, tid: str) -> dict:
    idx_path, idx = _trash_index(library)
    item = next((x for x in idx if x["id"] == tid), None)
    if not item:
        raise ValueError("回收站里找不到这一项")
    src = idx_path.parent / item["file"]
    dest = Path(item["from"])
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        dest = dest.with_name(dest.stem + "-restored" + dest.suffix)
    shutil.move(str(src), dest)
    idx = [x for x in idx if x["id"] != tid]
    idx_path.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True}


def trash_purge(library: Path, tid: str) -> dict:
    idx_path, idx = _trash_index(library)
    item = next((x for x in idx if x["id"] == tid), None)
    if not item:
        raise ValueError("回收站里找不到这一项")
    (idx_path.parent / item["file"]).unlink(missing_ok=True)
    idx_path.write_text(json.dumps([x for x in idx if x["id"] != tid], ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True}


# ------------------------------------------------------------------ prediction ledger
def calls_add(ledger: Path, asset: str, call: str, prob: float, resolve_by: str, lang: str = "zh") -> dict:
    if not asset.strip() or not call.strip():
        raise ValueError("标的和预测内容都要填写")
    if not 0.01 <= prob <= 0.99:
        raise ValueError("概率要在 1% 到 99% 之间")
    dt.date.fromisoformat(resolve_by)
    rows = L.load(ledger)
    nums = [int(r["id"][1:]) for r in rows if re.fullmatch(r"C\d+", r.get("id", ""))]
    row = {"id": f"C{(max(nums) if nums else 0) + 1:04d}", "created": dt.date.today().isoformat(), "source": "手动添加",
           "asset": asset.strip(), "call": call.strip(), "prob": f"{prob:.2f}", "resolve_by": resolve_by, "status": "open", "lang": lang}
    rows.append(row)
    L.save(ledger, rows)
    return {"ok": True, "id": row["id"]}


def calls_resolve(ledger: Path, cid: str, outcome: str, note: str = "") -> dict:
    if outcome not in ("0", "1", "void", "open"):
        raise ValueError("结果只能是 成立 / 不成立 / 作废 / 重新打开")
    rows = L.load(ledger)
    for r in rows:
        if r["id"] == cid:
            if outcome == "open":
                r.update(status="open", outcome="", resolved="", note=note or r.get("note", ""))
            else:
                r.update(status="void" if outcome == "void" else "resolved", outcome="" if outcome == "void" else outcome,
                         resolved=dt.date.today().isoformat(), note=note or r.get("note", ""))
            L.save(ledger, rows)
            return {"ok": True}
    raise ValueError(f"找不到预测 {cid}")


def calls_delete(ledger: Path, cid: str) -> dict:
    rows = L.load(ledger)
    kept = [r for r in rows if r["id"] != cid]
    if len(kept) == len(rows):
        raise ValueError(f"找不到预测 {cid}")
    L.save(ledger, kept)
    return {"ok": True}


# ------------------------------------------------------------------ sidebar / home visibility
def _prefs_path(library: Path) -> Path:
    return library / ".sidebar.json"


def prefs_load(library: Path) -> dict:
    try:
        d = json.loads(_prefs_path(library).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    return {"hidden_codes": list(d.get("hidden_codes", [])), "hidden_threads": list(d.get("hidden_threads", [])),
            "unlinks": dict(d.get("unlinks", {}))}


def _prefs_save(library: Path, d: dict) -> dict:
    library.mkdir(parents=True, exist_ok=True)
    _prefs_path(library).write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    return {"ok": True, **d}


def prefs_update(library: Path, action: str, code: str = "", thread: str = "") -> dict:
    d = prefs_load(library)
    if code:
        try:
            code = md.normalize_symbol(code)
        except ValueError:
            pass

    def toggle(lst: list, item: str, on: bool):
        if on and item not in lst:
            lst.append(item)
        if not on and item in lst:
            lst.remove(item)

    if action == "hide-code":
        toggle(d["hidden_codes"], code, True)
    elif action == "show-code":
        toggle(d["hidden_codes"], code, False)
    elif action == "hide-thread":
        toggle(d["hidden_threads"], thread, True)
    elif action == "show-thread":
        toggle(d["hidden_threads"], thread, False)
    elif action == "unlink":  # this conversation is not really about this stock
        toggle(d["unlinks"].setdefault(thread, []), code, True)
    elif action == "relink":
        toggle(d["unlinks"].setdefault(thread, []), code, False)
    elif action == "reset":
        d = {"hidden_codes": [], "hidden_threads": [], "unlinks": {}}
    else:
        raise ValueError(f"unknown action {action}")
    d["unlinks"] = {k: v for k, v in d["unlinks"].items() if v}
    return _prefs_save(library, d)
