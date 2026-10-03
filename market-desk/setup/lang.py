#!/usr/bin/env python3
"""Show or switch the Market Desk language mode.

  lang.py              show the current mode
  lang.py en           English agents, skills and schedules
  lang.py zh           Mandarin (中文) agents, skills and schedules
  lang.py both         run both in parallel (twice the scheduled runs and tokens)

The mode lives in market-desk/settings.json. Switching also syncs DeerFlow's scheduled tasks
(creates/resumes the active language's tasks, pauses the others) if DeerFlow is running;
otherwise run `bash market-desk/desk.sh seed` once it is.
The dashboard follows the mode by default (UI language can still be flipped with its EN/中文 switch).
"""

from __future__ import annotations

import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from seed import LANGS, get_language, set_language  # noqa: E402

LABEL = {"en": "English", "zh": "中文 Mandarin", "both": "English + 中文 (parallel)"}


def deerflow_up() -> bool:
    url = os.environ.get("DEERFLOW_URL", "http://127.0.0.1:2026")
    try:
        urllib.request.urlopen(url, timeout=2)
        return True
    except urllib.error.HTTPError:
        return True
    except Exception:
        return False


def main() -> int:
    if len(sys.argv) < 2:
        cur = get_language()
        print(f"Desk language: {cur} — {LABEL[cur]}\nSwitch with: lang.py en | zh | both")
        return 0
    lang = sys.argv[1].lower()
    lang = {"cn": "zh", "mandarin": "zh", "chinese": "zh", "中文": "zh", "english": "en"}.get(lang, lang)
    if lang not in LANGS:
        print(__doc__)
        return 1
    set_language(lang)
    print(f"Desk language → {lang} ({LABEL[lang]})")
    if "--no-sync" in sys.argv:
        return 0
    if deerflow_up():
        print("Syncing scheduled tasks in DeerFlow (log in with your DeerFlow account)…")
        return subprocess.call([sys.executable, str(HERE / "seed.py"), "--lang", lang])
    print("DeerFlow isn't running, so schedules weren't changed yet. Start it, then run:\n  bash market-desk/desk.sh seed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
