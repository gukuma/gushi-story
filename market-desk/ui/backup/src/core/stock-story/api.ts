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

export async function deskGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DESK}${path}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`投研数据服务不可用（${res.status}）`);
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
  if (pct > 0) return "text-red-600 dark:text-red-400";
  if (pct < 0) return "text-emerald-600 dark:text-emerald-400";
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
  lang: "zh" | "en";
  words: number;
  codes: string[];
  names: string[];
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
};

export type CallsData = {
  rows: CallRow[];
  score: {
    resolved: number;
    brier?: number;
    hit_rate?: number;
    buckets?: Array<{ bucket: string; n: number; stated: number; realized: number }>;
  };
};

export const REPORT_TYPES: Record<string, string> = {
  "daily-brief": "每日简报",
  announcements: "公告速览",
  "weekly-review": "周报",
  "equity-research": "个股研报",
  "market-sizing": "行业研究",
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
