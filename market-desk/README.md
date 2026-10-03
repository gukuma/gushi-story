# Market Desk for DeerFlow

A research desk on top of DeerFlow for China A-shares, macro, FX and crypto: live market data,
six house skills, two custom agents, four scheduled reports, a call ledger that scores forecasts,
and a local dashboard to read everything.

Nothing in DeerFlow's own code is modified. Everything lives in three places:

```
skills/custom/                 # loaded by DeerFlow automatically (gitignored upstream); *-zh = 中文 versions
  market-data/                 # live prices + call ledger (scripts/market_data.py, scripts/ledger.py)
  daily-market-brief/          # pre-market and close briefs, holiday-aware
  weekly-macro-review/         # weekly macro/FX/crypto + scoring of past calls
  ashare-equity-research/      # single-stock note from filings
  chinese-sources-first/       # Mandarin-first search, primary-source hierarchy
  market-sizing/               # TAM/SAM/SOM + competitors, graded confidence
market-desk/
  library/                     # the research library, mounted in the sandbox as /mnt/library
    watchlist.yaml             #   edit this
    reports/YYYY/MM/*.md       #   every report lands here (front matter for the dashboard)
    calls.csv                  #   forecast ledger
  dashboard/                   # reading room + health board (python stdlib, port 2027)
  setup/                       # apply_config.py, seed.py, desk.json (agents + schedules), agent SOULs
  desk.sh                      # helper: configure | seed | dashboard | data | brief
```

## State of the install (checked 3 Oct 2026)

DeerFlow has not been run on this machine yet: there is no `config.yaml`, `.env` or
`extensions_config.json`, `backend/.venv` has no packages, and `frontend/node_modules` is missing.
The steps below take it from zero.

Things DeerFlow already has that the plan relies on (no need to build them):
a scheduler with a **Scheduled tasks** page (`/workspace/scheduled-tasks`, off by default),
custom agents with per-agent skills and SOUL.md, per-thread outputs, and token accounting per run.

## Setup (≈15 minutes)

```bash
cd ~/Desktop/deer-flow

# 1. Install + configure DeerFlow
make check && make install
make setup
#   - Provider: DeepSeek (or Volcengine Doubao / Coding Plan for one key across Doubao/GLM/DeepSeek/Kimi)
#   - "Enable bash command execution?"  -> yes   (the market-data skill runs Python scripts)
#   - Web search: see "Search provider" below

# 2. Turn on the Market Desk switches (scheduler, agents API, host bash, /mnt/library mount)
#    and pick the desk language: en, zh (中文) or both
bash market-desk/desk.sh configure          # shows a diff; backs up config.yaml first
#   add --add-deepseek if you did NOT pick a model in make setup; then put DEEPSEEK_API_KEY in .env

# 3. Check the data feeds (no keys needed)
bash market-desk/desk.sh data

# 4. Start DeerFlow and create your account at http://localhost:2026
make dev

# 5. Create the agents and schedules (logs in with your DeerFlow email/password)
bash market-desk/desk.sh seed               # add --paused to create schedules paused

# 6. Open the reading room
bash market-desk/desk.sh dashboard          # http://127.0.0.1:2027

# 7. Desktop shortcuts, autostart at login, and the `desk` command (see below)
bash market-desk/mac/install.sh
desk keys                                   # add search keys (Tavily etc.), see API-KEYS.md
```

Then in DeerFlow: **Scheduled tasks → Pre-market brief → Trigger now** to test one end to end.
The report shows up in the dashboard within a minute.

## Mac: autostart, desktop shortcuts, everyday tools

One-time install (from Terminal, inside the repo):

```bash
bash market-desk/mac/install.sh
```

It creates:

| | What it does |
|---|---|
| **Market Desk** (Desktop + ~/Applications) | Double-click: starts DeerFlow and the dashboard if they're not running, opens both in the browser |
| **Market Desk Tools** (Desktop + ~/Applications) | Menu: status, edit a skill, new skill, check skills, watchlist, research library, config, API keys, switch search provider, restart, stop, logs, backup |
| **Market Desk Autostart** (login item) | Starts everything in the background ~20 s after you log in, no windows |
| `desk` command in Terminal | Same tools from the command line — `desk help` |

macOS will ask a few one-time permissions: Terminal controlling Finder/System Events (for the desktop
alias and login item), and each app accessing the Desktop folder (because the repo lives there).
Click **Allow**. To undo everything: `bash market-desk/mac/install.sh --uninstall`.

Common commands:

```bash
desk status                 # what's running, model, scheduler, next scheduled run
desk open                   # start if needed + open DeerFlow and the dashboard
desk restart                # after editing config.yaml or .env
desk logs follow            # live logs
desk keys                   # paste API keys (hidden); desk keys test checks them
desk search tencent         # switch web search provider
desk skills                 # list skills (★ = yours)
desk edit daily-market-brief
desk new earnings-preview "Preview a company's results before it reports."
desk check                  # validate all custom skills before restarting
desk watchlist              # edit the watchlist
desk backup                 # zip library + skills + config to ~/MarketDesk-backups
```

Settings in `market-desk/mac/settings.env`: `MODE=prod` (lighter, recommended for always-on) or `dev`
(hot reload), `OPEN_DASHBOARD`, and `EDITOR_APP` (auto-detects VS Code / Cursor, falls back to TextEdit).

Scheduled briefs only run while the Mac is awake. To wake it before the 08:40 brief on weekdays:
`sudo pmset repeat wakeorpoweron MTWRF 08:25:00` (undo: `sudo pmset repeat cancel`).

API keys: see **[API-KEYS.md](API-KEYS.md)** for links and step-by-step instructions.

## Language mode: English, 中文, or both

The desk runs in English, Mandarin, or both in parallel. One setting controls agents, skills,
scheduled briefs and the dashboard's default language:

```bash
bash market-desk/desk.sh lang          # show the current mode
bash market-desk/desk.sh lang zh       # 中文: Chinese agents + skills + schedules, dashboard in Chinese
bash market-desk/desk.sh lang en       # English
bash market-desk/desk.sh lang both     # both sets run (twice the scheduled runs and tokens)
```

`desk configure` also asks for it the first time, and **Market Desk Tools → Language / 语言…** does the
same from the Mac menu. The mode is stored in `market-desk/settings.json`. Switching syncs DeerFlow's
schedules if it's running: the chosen language's tasks are created or resumed, the other language's
are paused (nothing is deleted).

| | English | 中文 |
|---|---|---|
| Agents | `market-analyst`, `research-analyst` | `market-analyst-zh` 市场分析师, `research-analyst-zh` 行业研究员 |
| Skills | `daily-market-brief`, `weekly-macro-review`, `ashare-equity-research`, `market-sizing` | `daily-market-brief-zh`, `weekly-macro-review-zh`, `ashare-equity-research-zh`, `market-sizing-zh` |
| Shared | `market-data`, `chinese-sources-first` | same |
| Schedules | 08:40 / 15:40 weekdays, Sat 10:00, Sun 20:00 | 08:45 / 15:45 weekdays, Sat 10:30, Sun 20:30 |
| Report files | `…-close-brief.md` | `…-close-brief-zh.md` (front matter `lang: zh`) |

Both languages share one research library, watchlist and call ledger. Calls carry a `lang` column, and
`ledger.py score --lang zh` scores one language alone, so running `both` doesn't blur either track record.

**Dashboard:** http://127.0.0.1:2027/zh opens the Chinese view (or use the EN/中文 switch in the header).
It follows the desk mode by default; in `both` mode a language filter appears on the Reports tab. The
Chinese view uses Chinese market colours (red up, green down).

### 中文快速说明

- 切换为中文模式：`bash market-desk/desk.sh lang zh`（或在 Mac 菜单 Market Desk Tools → Language / 语言 中选择）。
- 中文模式下，盘前简报（工作日 08:45）、收盘复盘（15:45）、周报（周六 10:30）、自选股深度研究（周日 20:30）全部用简体中文撰写。
- 中文看板：http://127.0.0.1:2027/zh ，红涨绿跌。
- 平时对话可直接在 DeerFlow 里选择「市场分析师」或「行业研究员」智能体，例如“研究一下 300750”“测算中国宠物保险市场规模”。
- 中英双轨（`lang both`）会同时运行两套定时任务，Token 消耗约翻倍。

## What runs when (Asia/Shanghai)

| Task | When | Agent | Output |
|---|---|---|---|
| Pre-market brief | Mon–Fri 08:40 | market-analyst | overnight moves, today's calendar, watchlist; holiday note when A-shares are shut |
| Close brief | Mon–Fri 15:40 | market-analyst | what moved and why, watchlist table, 1–3 logged calls |
| Weekly macro, FX & crypto review | Sat 10:00 | market-analyst | resolves due calls, Brier score, macro/policy/FX/crypto week, next-week calendar |
| Watchlist deep dive | Sun 20:00 | market-analyst | full research note on the watchlist name with the oldest note |

Edit prompts/times in `setup/desk.json` and re-run `desk.sh seed --update`, or edit them in the
Scheduled tasks page. Markets are closed 1–8 Oct 2026 for National Day; the first trading-day
briefs will run on Fri 9 Oct.

## Agents

- **Market Analyst** (`market-analyst`): briefs, weekly review, stock notes. Skills: market-data,
  daily-market-brief, weekly-macro-review, ashare-equity-research, chinese-sources-first,
  deep-research, chart-visualization, data-analysis.
- **Research Analyst** (`research-analyst`): market sizing and industry work. Skills: market-sizing,
  chinese-sources-first, deep-research, consulting-analysis, market-data, charts, data-analysis.

Use them from the DeerFlow agent picker for ad-hoc work, e.g. *"Research note on 300750"* or
*"Size the China pet-insurance market"*. Anything they save under `/mnt/library/reports/` appears in
the dashboard; anything in a thread's outputs also appears (tagged "thread outputs").

## Market data

`skills/custom/market-data/scripts/market_data.py`, standard library only, no API keys:

| Data | Source |
|---|---|
| A-share / HK / US quotes, PE, PB, market cap; daily K-lines | Tencent Finance |
| USD/CNH, USD/CNY, DXY, EUR/USD, USD/JPY; CN & US 10Y; gold, silver, copper, Brent, WTI, SHFE gold, INE crude | Sina Finance |
| BTC, ETH, SOL… | CoinGecko |
| China CPI, PPI, PMI, M2/M1, retail, industrial output, trade, GDP, LPR, RRR | Eastmoney data centre (compiled from NBS/PBOC/customs) |

Try it: `bash market-desk/desk.sh brief` or
`python3 skills/custom/market-data/scripts/market_data.py quote 600519 hk00700`.

These are free public endpoints; they can change format or rate-limit without notice. The scripts
report which provider failed instead of guessing, and the skills tell the agent to say what's missing.

## Search provider

DuckDuckGo (the default) is weak on Chinese sources. Better options already built into DeerFlow
(`tools:` → `web_search` in `config.yaml`):

- **Tencent Cloud WSA** (`deerflow.community.tencent_wsa.tools:web_search_tool`, `TENCENTCLOUD_WSA_APIKEY`): strongest on mainland Chinese pages.
- **BytePlus InfoQuest** (`deerflow.community.infoquest.tools:web_search_tool`): ByteDance's search + crawl.
- **Tavily** (`TAVILY_API_KEY`): good for English sources.

Only one `web_search` entry can be active. A fair test: run the same close brief with two providers
and compare how many tier-1 sources (cninfo, stats.gov.cn, pbc.gov.cn) each brief cites.

## The call ledger

Briefs and notes log binary, dated calls ("USD/CNH above 6.80 on 31 Oct", p = 0.6). The Saturday
review resolves the ones that are due and computes a Brier score (0.25 = coin flip, lower is better)
and calibration buckets. The **Calls** tab shows both. After 20–30 resolved calls you'll see whether
the desk is overconfident, which is the useful signal for how much to trust its briefs.

## Dashboard

`bash market-desk/desk.sh dashboard` → http://127.0.0.1:2027. Read-only; it reads the library,
thread outputs and DeerFlow's SQLite database (`backend/.deer-flow/data/deerflow.db`).

- **Reports**: everything the desk wrote, newest first, filter by type/source, full-text search over titles and summaries, rendered markdown, link back to the thread.
- **Schedules**: each task's cron, next/last run, errors; the last 60 runs with duration and tokens.
- **Calls**: ledger + calibration.
- **Usage**: tokens per day, by model, recent failed runs.
- **Watchlist**: what the briefs track.
- Header: is DeerFlow up, scheduler on, library mounted, which model; a setup checklist appears when something's off.

## Notes and trade-offs

- **Host bash.** The local sandbox runs agent commands directly on your Mac. That's what lets the
  skills run Python, and it's the setting DeerFlow labels "only for fully trusted, single-user local
  workflows". Keep DeerFlow bound to 127.0.0.1 (the default) and don't expose port 2026. The safer
  alternative is the Docker AIO sandbox (`make setup-sandbox`); then add the library mount to the
  sandbox config by hand.
- **Delivery.** Reports go to the web UI and the dashboard only. DeerFlow can also push scheduled
  results to Feishu/Lark, Telegram, Slack, Discord, DingTalk or WeCom if you configure a channel later.
- **Research, not advice.** The skills forbid buy/sell instructions and position sizing.
- **Red/green.** The dashboard uses the Western convention (green up, red down).
