// 📈 股市故事 — client helpers for the Market Desk data service (proxied at /desk → 127.0.0.1:2027).

import {
  buildComposerDraftKey,
  getSessionComposerDraftStorage,
  writeComposerDraft,
} from "@/core/threads/composer-draft";

export const DESK = "/desk";
export const APP_NAME = "📈 股市故事";
export const DEFAULT_AGENT = "market-analyst-zh";
export const NEW_CHAT_HREF = `/workspace/agents/${DEFAULT_AGENT}/chats/new`;

export type ThreadRef = {
  id: string;
  title: string;
  url: string;
  updated?: string | null;
  others?: number;
  preview?: string;
  scheduled?: string | null;
  tickers?: string[];
  agent?: string;
};

export type ReportRef = {
  id: string;
  title: string;
  date: string;
  type: string;
  summary?: string;
  thread_url?: string | null;
};

export type TickerGroup = {
  code: string;
  name: string;
  watch: boolean;
  threads: ThreadRef[];
  reports: ReportRef[];
  last?: string;
};

export type MarketStatus = {
  state: "open" | "closed" | "pre" | "auction" | "lunch" | "after";
  label: string;
  now: string;
};

export type HomeData = {
  status: MarketStatus;
  watch: string[];
  notes: Record<string, string>;
  names: Record<string, string>;
  report_total: number;
  report_days: Array<{ date: string; n: number }>;
  groups: TickerGroup[];
  multi: ThreadRef[];
  scheduled: ThreadRef[];
  untagged: ThreadRef[];
  thread_count: number;
  recent: Array<{
    kind: "chat" | "report";
    title: string;
    url?: string;
    id?: string;
    when: string;
    tickers: string[];
    preview?: string;
    summary?: string;
    type?: string;
    scheduled?: string | null;
    thread_url?: string | null;
  }>;
};

export type SidebarTickers = {
  groups: Array<{
    code: string;
    name: string;
    watch: boolean;
    reports: number;
    threads: ThreadRef[];
  }>;
  multi: ThreadRef[];
  scheduled: ThreadRef[];
  untagged: ThreadRef[];
  hidden?: { codes: Array<{ code: string; name: string }>; threads: Array<{ id: string; title: string }> };
};

export type Quote = {
  symbol: string;
  name: string;
  price: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  high: number | null;
  low: number | null;
  time: string;
  pe_ttm?: number | null;
  pb?: number | null;
  total_mcap_cny_bn?: number | null;
  total_mcap_hkd_bn?: number | null;
  turnover_cny_mn?: number | null;
  currency?: string;
};

export type StripRow = {
  label: string;
  symbol: string;
  price: number | null;
  change_pct: number | null;
  change_bp?: number | null;
  time?: string;
  error?: string;
};

export type KeysStatus = {
  keys: Array<{
    var: string;
    what: string;
    url: string;
    required: boolean;
    set: boolean;
    masked: string;
  }>;
  search: string | null;
  search_options: string[];
  env_path: string;
};

/** Data-service API version this UI needs (server.py API_VERSION). */
export const REQUIRED_API = 8;

/** Fill defaults so reports from any data-service version render safely. */
export function normalizeReport(r: Partial<ReportItem> & { id: string }): ReportItem {
  return {
    title: "（无标题）", date: "", type: "note", summary: "", tickers: [], calls: [], origin: "library", path: "", lang: "zh", words: 0,
    codes: [], names: [], read: false, starred: false, archived: false, note: "", projects: [],
    ...r,
  } as ReportItem;
}

export async function deskGet<T>(path: string): Promise<T> {
  const data = await deskGetRaw<T>(path);
  if (path.startsWith("/api/reports") && Array.isArray(data)) {
    return (data as Array<Partial<ReportItem> & { id: string }>).map(normalizeReport) as T;
  }
  return data;
}

async function deskGetRaw<T>(path: string): Promise<T> {
  const res = await fetch(`${DESK}${path}`, { cache: "no-store" });
  if (!res.ok) {
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: string }).error ?? "";
    } catch {
      detail = "";
    }
    throw new Error(detail ? `数据服务出错：${detail}` : `投研数据服务不可用（${res.status}）`);
  }
  return (await res.json()) as T;
}

export async function deskPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${DESK}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Desk": "1" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `请求失败（${res.status}）`);
  }
  return data;
}

/** Red up / green down (A-share convention). */
export function moveClass(pct: number | null | undefined) {
  if (pct === null || pct === undefined || Number.isNaN(pct)) {
    return "text-muted-foreground";
  }
  if (pct > 0) return "text-[var(--ss-up)]";
  if (pct < 0) return "text-[var(--ss-down)]";
  return "text-muted-foreground";
}

export function fmtNum(v: number | null | undefined, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const abs = Math.abs(v);
  const d = abs >= 10000 ? 0 : abs < 20 ? Math.max(digits, 3) : digits;
  return v.toLocaleString("zh-CN", {
    minimumFractionDigits: Math.min(d, 2),
    maximumFractionDigits: d,
  });
}

export function fmtPct(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtYi(bn: number | null | undefined) {
  // market cap arrives in billions; show 亿 / 万亿
  if (bn === null || bn === undefined) return "—";
  const yi = bn * 10;
  return yi >= 10000 ? `${(yi / 10000).toFixed(2)} 万亿` : `${yi.toFixed(0)} 亿`;
}

export function displayCode(code: string) {
  if (code.startsWith("hk")) return `${code.slice(2)}.HK`;
  return code.slice(2);
}

export function relTime(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.round(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.round(s / 3600)} 小时前`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} 天前`;
  return d.toLocaleDateString("zh-CN");
}

/** Put text into the new-chat composer for the default agent, so the chat page opens prefilled. */
export function prefillNewChat(userId: string | undefined, text: string) {
  writeComposerDraft(
    getSessionComposerDraftStorage(),
    buildComposerDraftKey({
      userId: userId ?? "anonymous",
      agentName: DEFAULT_AGENT,
      threadId: "new",
    }),
    { text, skillName: null },
  );
}

export type ReportItem = {
  id: string;
  title: string;
  date: string;
  type: string;
  mode?: string | null;
  summary: string;
  confidence?: string | null;
  stance?: string | null;
  tickers: string[];
  calls: string[];
  origin: "library" | "thread";
  path: string;
  thread_id?: string | null;
  thread_url?: string | null;
  thread_title?: string;
  lang: "zh" | "en";
  words: number;
  codes: string[];
  names: string[];
  read: boolean;
  starred: boolean;
  archived: boolean;
  note: string;
  projects: ProjectRef[];
  agent_path?: string | null;
};

export type ProjectRef = { id: string; name: string };

/** The lighter report shape used by 今日 / 项目 / 股票 / 对话 views. */
export type ReportLite = Pick<ReportItem, "id" | "title" | "date" | "type" | "summary" | "codes" | "names" | "read" | "starred" | "archived" | "projects" | "lang"> & {
  mode?: string | null;
  stance?: string | null;
  confidence?: string | null;
  thread_id?: string | null;
  agent_path?: string | null;
};

export type CallRow = {
  id: string;
  created: string;
  asset: string;
  call: string;
  prob: string;
  resolve_by: string;
  status: string;
  outcome: string;
  note: string;
  lang?: string;
  source?: string;
};

export type CallsData = {
  rows: CallRow[];
  score: {
    resolved: number;
    brier?: number;
    hit_rate?: number;
    buckets?: Array<{ bucket: string; n: number; stated: number; realized: number }>;
  };
  history?: Array<{ date: string; n: number; hit_rate: number; brier: number }>;
};

export const REPORT_TYPES: Record<string, string> = {
  "daily-brief": "每日简报",
  announcements: "公告速览",
  "weekly-review": "周报",
  "equity-research": "个股研报",
  "market-sizing": "行业研究",
  earnings: "财报点评",
  compare: "对比研究",
  thesis: "投资逻辑",
  calendar: "催化剂日历",
  review: "审稿意见",
  note: "笔记",
  "thread-output": "对话产出",
};

export const MODES: Record<string, string> = {
  "pre-market": "盘前",
  close: "收盘",
  holiday: "休市",
};

/** Thread links from the data service are absolute (http://localhost:2026/...); keep only the path. */
export function localPath(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** Display name for a code: the learned/company name, or the code itself. */
export function nameOr(name: string | null | undefined, code: string) {
  return typeof name === "string" && name.length > 0 ? name : displayCode(code);
}

export type TrashItem = { id: string; title: string; from: string; file: string; deleted: string };

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** "45 8 * * 1-5" → "工作日 08:45"; falls back to the raw expression. */
export function describeCron(spec: Record<string, unknown> | undefined, type?: string) {
  if (type === "interval") {
    const s = Number(spec?.every_seconds ?? spec?.seconds ?? 0);
    return s >= 3600 ? `每 ${Math.round(s / 3600)} 小时` : s ? `每 ${Math.round(s / 60)} 分钟` : "间隔执行";
  }
  const cron = typeof spec?.cron === "string" ? spec.cron : "";
  const f = cron.trim().split(/\s+/);
  if (f.length !== 5) return cron || (type === "once" ? "单次" : "—");
  const [m, h, dom, mon, dow] = f as [string, string, string, string, string];
  if (!/^\d+$/.test(m) || !/^\d+$/.test(h) || dom !== "*" || mon !== "*") return cron;
  const t = `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  if (dow === "*") return `每天 ${t}`;
  if (dow === "1-5") return `工作日 ${t}`;
  if (/^[0-7](,[0-7])*$/.test(dow)) return `每周${dow.split(",").map((d) => WEEK[Number(d) % 7]).join("、")} ${t}`;
  return cron;
}

export function invalidateDesk(qc: { invalidateQueries: (o: { queryKey: unknown[] }) => unknown }) {
  void qc.invalidateQueries({ queryKey: ["stock-story"] });
}

/* ------------------------------------------------------------------ information levels */
export type Brief = {
  date: string;
  status: MarketStatus;
  market: StripRow[];
  watch: Array<{
    code: string; name: string; price: number | null; change_pct: number | null; pe_ttm?: number | null; time?: string; note: string;
    latest: { id: string; title: string; stance?: string | null; date: string } | null;
  }>;
  new_reports: ReportLite[];
  unread: number;
  latest_brief: ReportLite | null;
  calls: { due: CallRow[]; proposed: CallRow[]; open: number; score: CallsData["score"] };
  schedules: Array<{
    id: string; title: string; status: string; next_run_at: string | null; last_run_at: string | null; last_error: string | null; last_thread_id: string | null;
    last_run?: { status?: string; duration_s?: number | null; tokens?: number | null } | null;
  }>;
  alerts: Brief["watch"];
  alert_pct: number;
  calendar: CalendarRow[];
};

export type ChatRow = {
  id: string; title: string; url: string; updated?: string | null; scheduled?: string | null;
  tickers: string[]; names: string[]; n_tickers: number; projects: ProjectRef[]; preview?: string;
};

export type Project = {
  id: string; name: string; icon?: string; created: string; reports: string[]; threads: string[]; codes: string[];
  n_reports: number; n_threads: number; unread: number; latest: string; names: string[];
};
export type Suggestion = { key: string; name: string; why: string; reports: string[]; threads: string[]; codes: string[] };

export type SearchResult = {
  stocks: Array<{ code: string; name: string }>;
  reports: ReportLite[];
  chats: Array<{ id: string; title: string; url: string; updated?: string | null }>;
  projects: ProjectRef[];
};

export type StockView = {
  code: string; name: string; quote: Partial<Quote>; watch: boolean; note: string;
  view: ReportLite | null; reports: ReportLite[]; thesis?: Thesis;
  chats: Array<{ id: string; title: string; url: string; updated?: string | null; others: number }>;
  projects: ProjectRef[];
};

export type ThreadView = {
  id: string; title: string; scheduled?: string | null;
  stocks: Array<{ code: string; name: string }>; n_stocks: number;
  reports: ReportLite[]; linked: ReportLite[]; projects: ProjectRef[]; all_projects: ProjectRef[];
};

export const STANCE: Record<string, string> = { constructive: "看好", neutral: "中性", cautious: "谨慎", positive: "看好", negative: "谨慎" };
export const CONF: Record<string, string> = { high: "高", medium: "中", low: "低", "n/a": "—" };

export const stockHref = (code: string) => `/workspace/stocks?code=${code}`;
export const reportHref = (id: string) => `/workspace/reports?report=${id}`;
export const projectHref = (id: string) => `/workspace/themes?id=${id}`;

/** Research templates (home ask box, 新研究 dialog, new-chat composer). {x} = what the person typed. */
export const TEMPLATES: Array<{ key: string; label: string; hint: string; prompt: string }> = [
  { key: "deep", label: "个股深度", hint: "股票名或代码", prompt: "请用 ashare-equity-research-zh 技能，按完整流程（数据底稿、四个视角、多空对辩、情景、自检）为 {x} 写一份个股深度，存入研报库，并更新投资逻辑文件。" },
  { key: "earnings", label: "财报点评 / 前瞻", hint: "股票名或代码", prompt: "请用 earnings-review-zh 技能为 {x} 写最新一期财报点评（如果还没发布，就写财报前瞻），存入研报库。" },
  { key: "compare", label: "对比几只股票", hint: "如：工商银行 建设银行 招商银行", prompt: "请用 peer-compare-zh 技能对比 {x}，给出排序和理由，存入研报库。" },
  { key: "sector", label: "行业研究", hint: "如：中国储能", prompt: "请用 market-sizing-zh 技能研究 {x}：市场规模两种测算、产业链与上市公司、竞争格局，存入研报库。" },
  { key: "thesis", label: "投资逻辑检查", hint: "股票名或代码", prompt: "请用 thesis-tracker-zh 技能检查 {x} 的投资逻辑：读取或创建投资逻辑文件，根据最新信息更新每根支柱的状态。" },
  { key: "calendar", label: "未来有什么事件", hint: "股票、行业，或留空看全市场", prompt: "请用 catalyst-calendar-zh 技能列出 {x} 未来两周的关键事件（财报、解禁、分红、政策会议、宏观数据），并更新日历。" },
  { key: "news", label: "最近发生了什么", hint: "股票、行业或宏观主题", prompt: "请梳理 {x} 最近两周的重要公告、新闻和市场反应（公告优先用 announcement-watch-zh 的分级方法），说明对后续的影响。" },
  { key: "macro", label: "宏观 / 政策", hint: "如：降准、人民币汇率", prompt: "请分析 {x} 的最新情况，对 A股 和港股 的影响，以及接下来要关注的数据和日期。" },
];

export const fillTemplate = (prompt: string, x: string) => prompt.replace("{x}", x.trim() || "（请填写）");

/** Prompt for a follow-up chat that starts from one report. */
export function askAboutReport(r: Pick<ReportItem, "title" | "date"> & { agent_path?: string | null }, question = "") {
  const where = r.agent_path ? `研报文件：${r.agent_path}（请先读取全文）` : "";
  return `关于研报《${r.title}》（${r.date}）${where ? `\n${where}` : ""}\n\n${question || "我想追问："}`;
}

/* handoff between pages: "start a chat that belongs to project X / follows up report Y" */
const PENDING = "stock-story:pending-chat";
export type PendingChat = { project?: string; report?: string; at: number };
export function setPendingChat(p: Omit<PendingChat, "at">) {
  try {
    sessionStorage.setItem(PENDING, JSON.stringify({ ...p, at: Date.now() }));
  } catch {
    /* private mode */
  }
}
export function takePendingChat(): PendingChat | null {
  try {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING);
    const p = JSON.parse(raw) as PendingChat;
    return Date.now() - p.at < 30 * 60_000 ? p : null;
  } catch {
    return null;
  }
}

export type HealthCheck = { group: string; name: string; ok: boolean; ms: number; detail: string; fix: string };
export type Health = {
  checks: HealthCheck[];
  ok: boolean;
  system: { mode: string; python: string; platform: string; library: string; library_mb: number; reports: number; repo: string;
    backup: { last: string | null; dir: string; count: number; latest_file: string | null; latest_mb: number | null } };
};
export type DeskSettings = { alert_pct: number; notify_reports: boolean; notify_prices: boolean; backup_days: number; backup_keep: number };
export type Usage = {
  days: Array<{ day: string; runs: number; tokens: number; failed: number }>;
  models: Array<{ model: string; runs: number; tokens: number; input_tokens: number; output_tokens: number }>;
  totals: { tokens: number; runs: number; failed: number };
  recent_failures: Array<{ run_id: string; thread_id: string; status: string; error: string | null; created_at: string; thread_url: string }>;
};
export type Candle = { date: string; open: number; close: number; high: number; low: number; volume: number };

export function fmtTokens(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

/** Prompt that asks the agent to redo a report with today's data. */
export function refreshReportPrompt(r: { title: string; agent_path?: string | null }) {
  return `请用今天的最新数据重写研报《${r.title}》${r.agent_path ? `（原文：${r.agent_path}，请先读取）` : ""}：更新行情、估值和最新公告，标出与原结论不同的地方，写成一份新研报存入研报库。`;
}

/** Prompt that merges several reports into one summary. */
export function mergeReportsPrompt(rs: Array<{ title: string; date: string; agent_path?: string | null }>, goal = "") {
  const list = rs.map((r, i) => `${i + 1}. 《${r.title}》（${r.date}）${r.agent_path ? ` ${r.agent_path}` : ""}`).join("\n");
  return `请先读取下面 ${rs.length} 份研报，${goal || "合并成一份总结研报：共同结论、互相矛盾的地方、最重要的数字、接下来要跟踪什么"}，存入研报库。\n\n${list}`;
}

/** Fill every field the page relies on, so an older (not yet restarted) data service can't crash
 *  the page: missing parts just show as empty. */
export function normalizeBrief(raw: Partial<Brief> | null | undefined): Brief {
  const r = raw ?? {};
  const calls: Partial<Brief["calls"]> = r.calls ?? {};
  return {
    date: r.date ?? "",
    status: r.status ?? { state: "closed", label: "—", now: "" },
    market: r.market ?? [],
    watch: r.watch ?? [],
    new_reports: r.new_reports ?? [],
    unread: r.unread ?? 0,
    latest_brief: r.latest_brief ?? null,
    calls: { due: calls.due ?? [], proposed: calls.proposed ?? [], open: calls.open ?? 0, score: calls.score ?? { resolved: 0 } },
    schedules: r.schedules ?? [],
    alerts: r.alerts ?? [],
    alert_pct: r.alert_pct ?? 5,
    calendar: r.calendar ?? [],
  };
}

/** Prompt asking the red-team reviewer workflow to audit a report. */
export function reviewReportPrompt(r: { title: string; agent_path?: string | null }) {
  return `请用 report-review-zh 技能审这份研报《${r.title}》${r.agent_path ? `（${r.agent_path}，请先读取全文）` : ""}：抽查关键数字、检查前后一致、假设、情景与反方观点，给出评分和必须修改的问题，审稿意见存入研报库。`;
}

export type CalendarRow = { date: string; time: string; event: string; related: string; importance: string; source: string };
export type Thesis = { status: string; stance?: string | null; confidence?: string | null; updated?: string | null; summary: string; pillars: string[]; path: string } | null;
