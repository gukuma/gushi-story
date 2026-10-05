"use client";

// 📈 股市故事 首页 ("/"): header stats, ask bar, dark market card + four pastel tiles,
// my-stocks cards (add / remove / note the watchlist), scheduled agents (run / pause / resume)
// and the recent timeline.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BellRing,
  Bitcoin,
  Bot,
  CalendarClock,
  Check,
  CircleDollarSign,
  Coins,
  Droplets,
  FileText,
  Flame,
  Gauge,
  Landmark,
  LineChart,
  ListFilter,
  MessageSquare,
  NotebookPen,
  Pause,
  PencilLine,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  StarOff,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/core/auth/AuthProvider";
import { usePauseScheduledTask, useResumeScheduledTask, useScheduledTasks, useTriggerScheduledTask } from "@/core/scheduled-tasks/hooks";
import {
  APP_NAME,
  describeCron,
  deskGet,
  deskPost,
  displayCode,
  fmtNum,
  fmtPct,
  fmtYi,
  invalidateDesk,
  moveClass,
  nameOr,
  NEW_CHAT_HREF,
  prefillNewChat,
  relTime,
  type CallsData,
  type HomeData,
  type Quote,
  type StripRow,
  type TickerGroup,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import {
  ACCENT,
  Avatar,
  BigNumber,
  CANVAS,
  Chip,
  Empty,
  INK,
  inputCls,
  Metric,
  MINT,
  Panel,
  PanelTitle,
  PEACH,
  PillButton,
  RoundButton,
  SKY,
  Stat,
  STONE,
  textareaCls,
  Tile,
  toneOf,
} from "./ui";

const EXAMPLES: Array<[LucideIcon, string]> = [
  [Activity, "今天A股怎么样？"],
  [Gauge, "分析一下 600519 贵州茅台的估值"],
  [Target, "比较腾讯和阿里巴巴"],
  [Landmark, "最近央行有什么新政策？"],
  [Zap, "测算中国储能市场规模"],
];

const STRIP_ICON: Record<string, LucideIcon> = {
  fx_susdcnh: CircleDollarSign,
  globalbd_gcny10: Landmark,
  hf_GC: Coins,
  hf_OIL: Droplets,
  bitcoin: Bitcoin,
};

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 13) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length < 2) return <div className={cn("h-12", className)} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const w = 160;
  const h = 48;
  const xy = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / (max - min || 1)) * (h - 6)] as const);
  const line = xy.map(([x, y]) => `${x},${y}`).join(" ");
  const up = data[data.length - 1]! >= data[0]!;
  const stroke = up ? "#dc2626" : "#059669";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={cn("h-12 w-full", className)} aria-hidden>
      <polygon points={`0,${h} ${line} ${w},${h}`} fill={stroke} opacity="0.08" />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ stock card */
function StockCard({ group, quote, spark, onOpen }: { group: TickerGroup; quote?: Quote; spark?: number[]; onOpen: () => void }) {
  const pct = quote?.change_pct ?? null;
  const name = nameOr(group.name, group.code);
  const t = toneOf(group.code);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-3 rounded-[24px] border border-black/5 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(30,28,52,0.08)] dark:border-white/10 dark:bg-white/5"
      data-tip-title={`${name} 股票卡片`}
      data-tip="大数字是今天的涨跌幅（红涨绿跌），下面是现价、市盈率，和你关于它的研报、对话数量。点一下查看详情、加入或移出自选。"
    >
      <div className="flex items-center gap-2">
        <Avatar text={name} keyFor={group.code} className="size-9" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="text-muted-foreground font-mono text-[11px]">{displayCode(group.code)}</div>
        </div>
        {group.watch && (
          <span className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", t.chip)}>
            <Star className="size-3 fill-current" /> 自选
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <BigNumber className={cn("text-4xl", moveClass(pct))}>{fmtPct(pct)}</BigNumber>
        <Sparkline data={spark ?? []} className="h-10 w-24" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={Wallet} label="现价" value={fmtNum(quote?.price)} className={t.tile} />
        <Metric
          icon={Gauge}
          label={quote?.pe_ttm ? "市盈率" : "市值"}
          value={quote?.pe_ttm ? fmtNum(quote.pe_ttm, 1) : fmtYi(quote?.total_mcap_cny_bn ?? quote?.total_mcap_hkd_bn)}
          className={t.tile}
        />
        <Metric icon={FileText} label="研报·对话" value={`${group.reports.length} · ${group.threads.length}`} className={t.tile} />
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ add stock dialog */
function AddStockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await deskPost<{ name: string; code: string }>("/api/watchlist/add", { code, note });
      toast.success(`已把 ${r.name}（${displayCode(r.code)}）加入自选`);
      setCode("");
      setNote("");
      onOpenChange(false);
      invalidateDesk(qc);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Star className="size-5" /> 添加自选股</DialogTitle>
          <DialogDescription>输入股票代码。A股 6 位数字（如 600519），港股加 hk（如 hk00700）。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="股票代码，如 600519" className={inputCls} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="为什么关注它？（可选，助手写简报时会参考）" rows={2} className={textareaCls} />
          <PillButton primary type="submit" icon={Plus} disabled={!code.trim() || busy}>{busy ? "正在查找…" : "加入自选"}</PillButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ stock detail sheet */
function StockSheet({ group, quote, spark, note, onClose, onAsk }: {
  group: TickerGroup | null; quote?: Quote; spark?: number[]; note: string; onClose: () => void; onAsk: (text: string) => void;
}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(note);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    setDraft(note);
    setEditing(false);
  }, [note, group?.code]);
  const label = group ? `${nameOr(group.name, group.code)}（${displayCode(group.code)}）` : "";
  const call = async (path: string, body: object, ok: string) => {
    try {
      await deskPost(path, body);
      toast.success(ok);
      invalidateDesk(qc);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };
  return (
    <Sheet open={!!group} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {group && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-3 text-xl font-medium">
                <Avatar text={nameOr(group.name, group.code)} keyFor={group.code} className="size-10" />
                {label}
              </SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <div className={cn("rounded-[24px] p-5", toneOf(group.code).tile)}>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <div className="text-muted-foreground text-xs">现价 · {quote?.time ?? ""}</div>
                    <BigNumber className="text-5xl">{fmtNum(quote?.price)}</BigNumber>
                    <div className={cn("mt-1 font-mono text-sm", moveClass(quote?.change_pct))}>
                      {quote?.change != null ? `${quote.change > 0 ? "+" : ""}${fmtNum(quote.change)}  ` : ""}{fmtPct(quote?.change_pct)}
                    </div>
                  </div>
                  <Sparkline data={spark ?? []} className="h-16 w-40" />
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                  <Metric icon={TrendingUp} label="最高" value={fmtNum(quote?.high)} />
                  <Metric icon={TrendingDown} label="最低" value={fmtNum(quote?.low)} />
                  <Metric icon={Gauge} label="市盈率" value={fmtNum(quote?.pe_ttm, 1)} />
                  <Metric icon={Landmark} label="市值" value={fmtYi(quote?.total_mcap_cny_bn ?? quote?.total_mcap_hkd_bn)} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <PillButton icon={Sparkles} onClick={() => onAsk(`继续研究 ${label}：最近有什么新变化？`)}
                  data-tip-title="继续研究" data-tip="开一个新对话，自动写好问题，问这只股票最近的变化。">继续研究</PillButton>
                <PillButton primary icon={FileText} onClick={() => onAsk(`请用 ashare-equity-research-zh 技能为 ${label} 写一份完整的研究笔记。`)}
                  data-tip-title="写研报" data-tip="让助手写一份完整的研究报告，写好后出现在研报中心。">写研报</PillButton>
                {group.watch ? (
                  <PillButton icon={StarOff} onClick={() => void call("/api/watchlist/remove", { code: group.code }, "已移出自选")}
                    data-tip-title="移出自选" data-tip="不再每天跟踪它。聊过的记录不会删除。">移出自选</PillButton>
                ) : (
                  <PillButton icon={Star} onClick={() => void call("/api/watchlist/add", { code: group.code, name: group.name }, "已加入自选")}
                    data-tip-title="加入自选" data-tip="加入后，每天的盘前简报和收盘复盘都会关注它。">加入自选</PillButton>
                )}
              </div>

              {group.watch && (
                <div className="rounded-[20px] border border-black/5 p-4 dark:border-white/10" data-tip-title="关注理由" data-tip="写下你为什么关注它，助手写简报时会参考这句话。">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <NotebookPen className="size-4" /> 关注理由
                    {!editing && <RoundButton icon={PencilLine} label="编辑" className="ml-auto size-8" onClick={() => setEditing(true)} />}
                  </div>
                  {editing ? (
                    <div className="flex flex-col gap-2">
                      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className={textareaCls} />
                      <div className="flex justify-end gap-2">
                        <PillButton onClick={() => { setDraft(note); setEditing(false); }}>取消</PillButton>
                        <PillButton primary icon={Check} onClick={() => void call("/api/watchlist/note", { code: group.code, note: draft }, "已保存").then((ok) => ok && setEditing(false))}>保存</PillButton>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">{note || "还没写。点右边的笔写一句。"}</p>
                  )}
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <FileText className="size-4" />
                  <h3 className="mr-auto font-medium">研报（{group.reports.length}）</h3>
                  <Link href={`/workspace/reports?ticker=${group.code}`} className="text-muted-foreground text-sm hover:underline">在研报中心查看 →</Link>
                </div>
                <ul className="space-y-2">
                  {group.reports.slice(0, 8).map((r) => (
                    <li key={r.id}>
                      <Link href={`/workspace/reports?ticker=${group.code}&report=${r.id}`} className="block rounded-2xl bg-[#f4f4f0] px-4 py-3 hover:bg-[#ebeae4] dark:bg-white/5">
                        <div className="flex items-center gap-2 text-sm font-medium"><span className="truncate">{r.title}</span><span className="text-muted-foreground ml-auto shrink-0 text-xs">{r.date}</span></div>
                        {r.summary && <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{r.summary}</p>}
                      </Link>
                    </li>
                  ))}
                  {!group.reports.length && <li className="text-muted-foreground text-sm">还没有研报。</li>}
                </ul>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2"><MessageSquare className="size-4" /><h3 className="font-medium">对话（{group.threads.length}）</h3></div>
                <ul className="space-y-1">
                  {group.threads.slice(0, 20).map((t) => (
                    <li key={t.id}>
                      <Link href={t.url} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[#f4f4f0] dark:hover:bg-white/5">
                        <span className="truncate">{t.title}</span>
                        {t.others ? <span className="text-muted-foreground text-xs">+{t.others} 只</span> : null}
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs">{relTime(t.updated)}</span>
                      </Link>
                    </li>
                  ))}
                  {!group.threads.length && <li className="text-muted-foreground text-sm">还没聊过这只股票。</li>}
                </ul>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ scheduled agents */
function SchedulePanel() {
  const { data: tasks, error } = useScheduledTasks();
  const pause = usePauseScheduledTask();
  const resume = useResumeScheduledTask();
  const trigger = useTriggerScheduledTask();
  const list = (tasks ?? []).slice().sort((a, b) => (a.next_run_at ?? "z").localeCompare(b.next_run_at ?? "z"));
  return (
    <Panel data-tip-title="定时任务" data-tip="到点自动干活的助手。▶ 马上跑一次；⏸ 暂停；再点一次恢复。要修改时间或内容，点右上角箭头。">
      <PanelTitle icon={CalendarClock} sub={`${list.filter((t) => t.status === "enabled" || t.status === "running").length} 个运行中 · 共 ${list.length} 个`}
        action={<Link href="/workspace/scheduled-tasks" className="grid size-9 place-items-center rounded-full bg-[#f1f0eb] hover:bg-[#e6e4dc] dark:bg-white/10" title="管理全部定时任务"><ArrowRight className="size-4" /></Link>}>
        定时任务
      </PanelTitle>
      {error ? <Empty icon={CalendarClock}>读取失败：{error.message}</Empty> : !list.length ? (
        <Empty icon={Bot}>还没有定时任务。运行 <code>desk seed</code> 创建默认任务。</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => {
            const on = t.status === "enabled" || t.status === "running";
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-[#f4f4f0] px-3 py-2.5 dark:bg-white/5">
                <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", on ? MINT.dot : STONE.dot)}>
                  {t.status === "running" ? <RefreshCw className="size-4 animate-spin" /> : <BellRing className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="text-muted-foreground truncate text-xs">
                    {describeCron(t.schedule_spec, t.schedule_type)}
                    {on && t.next_run_at ? ` · 下次 ${new Date(t.next_run_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
                    {!on ? " · 已暂停" : ""}
                    {t.last_error ? " · 上次失败" : ""}
                  </div>
                </div>
                {t.last_thread_id && (
                  <Link href={`/workspace/chats/${t.last_thread_id}`} title="查看上次结果" className="grid size-8 place-items-center rounded-full bg-white hover:bg-[#e6e4dc] dark:bg-white/10">
                    <MessageSquare className="size-3.5" />
                  </Link>
                )}
                <RoundButton icon={Play} label="立即运行一次" className="size-8 bg-white" disabled={trigger.isPending}
                  onClick={() => trigger.mutate(t.id, { onSuccess: () => toast.success(`「${t.title}」已开始运行`) })} />
                <RoundButton icon={on ? Pause : Play} label={on ? "暂停" : "恢复"} active={!on} className={cn("size-8", on && "bg-white")}
                  onClick={() => (on ? pause.mutate(t.id) : resume.mutate(t.id))} />
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ page */
type Filter = "all" | "watch" | "researched" | "up" | "down";
const FILTERS: Array<[Filter, string, LucideIcon]> = [
  ["all", "全部", ListFilter],
  ["watch", "自选", Star],
  ["researched", "研究过", NotebookPen],
  ["up", "上涨", TrendingUp],
  ["down", "下跌", TrendingDown],
];

export function StockHome() {
  const router = useRouter();
  const { user } = useAuth();
  const [ask, setAsk] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    document.title = APP_NAME;
  }, []);

  const home = useQuery({ queryKey: ["stock-story", "home"], queryFn: () => deskGet<HomeData>("/api/home"), refetchInterval: 60_000 });
  const live = home.data?.status.state === "open" || home.data?.status.state === "auction";
  const strip = useQuery({ queryKey: ["stock-story", "strip"], queryFn: () => deskGet<{ rows: StripRow[] }>("/api/strip"), refetchInterval: live ? 15_000 : 60_000 });
  const calls = useQuery({ queryKey: ["stock-story", "calls"], queryFn: () => deskGet<CallsData>("/api/calls"), refetchInterval: 300_000 });
  const codes = useMemo(() => (home.data?.groups ?? []).map((g) => g.code).slice(0, 80), [home.data]);
  const quotes = useQuery({
    queryKey: ["stock-story", "quotes", codes.join(",")],
    queryFn: () => deskGet<Quote[]>(`/api/quotes?codes=${codes.join(",")}`),
    enabled: codes.length > 0,
    refetchInterval: live ? 15_000 : 120_000,
  });
  const sparks = useQuery({
    queryKey: ["stock-story", "spark", codes.join(",")],
    queryFn: () => deskGet<Record<string, number[]>>(`/api/spark?codes=${codes.join(",")}`),
    enabled: codes.length > 0,
    refetchInterval: 600_000,
  });
  const quoteBy = useMemo(() => Object.fromEntries((quotes.data ?? []).map((x) => [x.symbol, x])), [quotes.data]);

  const groups = useMemo(() => {
    let g = home.data?.groups ?? [];
    if (filter === "watch") g = g.filter((x) => x.watch);
    if (filter === "researched") g = g.filter((x) => x.threads.length > 0 || x.reports.length > 0);
    if (filter === "up") g = g.filter((x) => (quoteBy[x.code]?.change_pct ?? 0) > 0);
    if (filter === "down") g = g.filter((x) => (quoteBy[x.code]?.change_pct ?? 0) < 0);
    const s = q.trim().toLowerCase();
    if (s) g = g.filter((x) => x.name.toLowerCase().includes(s) || x.code.includes(s));
    return g;
  }, [home.data, filter, q, quoteBy]);

  const ups = (quotes.data ?? []).filter((x) => (x.change_pct ?? 0) > 0).length;
  const downs = (quotes.data ?? []).filter((x) => (x.change_pct ?? 0) < 0).length;
  const flats = Math.max(0, (quotes.data ?? []).length - ups - downs);
  const sse = strip.data?.rows.find((r) => r.symbol === "sh000001");
  const days = home.data?.report_days ?? [];
  const weekN = days.reduce((a, d) => a + d.n, 0);
  const maxDay = Math.max(1, ...days.map((d) => d.n));
  const score = calls.data?.score;
  const openCalls = (calls.data?.rows ?? []).filter((r) => r.status === "open").length;
  const watchN = (home.data?.groups ?? []).filter((g) => g.watch).length;
  const sched = useScheduledTasks();
  const activeTasks = (sched.data ?? []).filter((t) => t.status === "enabled" || t.status === "running");
  const nextTask = activeTasks.filter((t) => t.next_run_at).sort((a, b) => a.next_run_at!.localeCompare(b.next_run_at!))[0];

  const askNow = (text: string) => {
    const t = text.trim();
    if (!t) return;
    prefillNewChat(user?.id, t);
    router.push(NEW_CHAT_HREF);
  };
  const openGroup = home.data?.groups.find((g) => g.code === open) ?? null;

  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 md:px-8">
        {/* ---------- header: title + inline stats ---------- */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,2fr)] lg:items-end">
          <div>
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 dark:bg-white/10"
                data-tip-title="A股交易状态" data-tip="A股现在是否在交易。交易中价格每 15 秒自动刷新；休市时显示最近一个交易日的收盘价。">
                <span className={cn("size-2 rounded-full", live ? "animate-pulse bg-red-500" : "bg-[#b7b2a4]")} />
                {home.data?.status.label ?? "…"}
              </span>
              <span>{home.data?.status.now ?? ""}</span>
              <RoundButton icon={RefreshCw} label="刷新" className="ml-1 size-7 bg-white" spin={home.isFetching || quotes.isFetching}
                onClick={() => { void home.refetch(); void strip.refetch(); void quotes.refetch(); }} />
            </div>
            <h1 className="text-4xl leading-tight font-light tracking-tight">{greeting()}，</h1>
            <h1 className="text-4xl leading-tight font-semibold tracking-tight">今天的市场故事</h1>
          </div>
          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Stat label="上证指数" icon={LineChart} foot={<span className={moveClass(sse?.change_pct)}>{fmtPct(sse?.change_pct)}</span>}
              data-tip-title="上证指数" data-tip="A股最重要的大盘指数，代表整体市场今天的涨跌。">{fmtNum(sse?.price)}</Stat>
            <Stat label="跟踪股票" icon={Star} unit="只" foot={<span className="text-muted-foreground">自选 {watchN} 只</span>}
              data-tip-title="跟踪股票" data-tip="自选股加上你聊过、写过研报的股票。">{codes.length}</Stat>
            <Stat label="研报" icon={FileText} unit="份" foot={<span className="text-muted-foreground">本周 +{weekN}</span>}
              data-tip-title="研报" data-tip="助手写过的全部报告，包括每日简报。">{home.data?.report_total ?? "—"}</Stat>
            <Stat label="预测命中" icon={Target} unit={score?.hit_rate != null ? "%" : undefined}
              foot={<span className="text-muted-foreground">{score?.resolved ? `已验证 ${score.resolved} 条` : `待验证 ${openCalls} 条`}</span>}
              data-tip-title="预测命中率" data-tip="助手在报告里做的预测，到期后自动打分。越高越好。">
              {score?.hit_rate != null ? Math.round(score.hit_rate * 100) : "—"}
            </Stat>
          </div>
        </div>

        {/* ---------- ask ---------- */}
        <div className="flex flex-col gap-2">
          <form onSubmit={(e) => { e.preventDefault(); askNow(ask); }}
            className="flex items-center gap-2 rounded-full bg-white p-2 pl-5 shadow-[0_1px_2px_rgba(30,28,52,0.06)] dark:bg-white/5"
            data-tip-title="提问框" data-tip="用中文写下你想研究的问题，按回车或点“开始研究”。会打开新对话，市场分析师帮你查资料、取行情、写答案。">
            <Search className="text-muted-foreground size-5 shrink-0" />
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="问点什么……比如：分析一下 600519 的估值"
              className="placeholder:text-muted-foreground h-10 min-w-0 flex-1 bg-transparent text-base outline-none" />
            <PillButton primary type="submit" className="h-10 px-5">开始研究 <ArrowRight className="size-4" /></PillButton>
          </form>
          <div className="flex flex-wrap gap-2" data-tip-title="示例问题" data-tip="不知道问什么？点一个例子直接开始。">
            {EXAMPLES.map(([Icon, e]) => (
              <Chip key={e} onClick={() => askNow(e)} className="px-3 py-1 text-xs"><Icon className="size-3.5" />{e}</Chip>
            ))}
          </div>
        </div>

        {/* ---------- market (ink) + pastel tiles ---------- */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <section className={cn("rounded-[28px] p-5", INK)} data-tip-title="大盘与跨资产" data-tip="主要指数、汇率、利率、黄金、原油和比特币的最新价格，自动刷新。">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full border border-white/25"><Activity className="size-4" /></span>
              <div className="mr-auto">
                <h2 className="text-lg font-medium">市场全景</h2>
                <div className="text-xs text-white/60">指数 · 汇率 · 利率 · 商品 · 加密</div>
              </div>
              <span className="flex items-center gap-1.5 text-xs text-white/70"><span className={cn("size-2 rounded-full", ACCENT)} /> 自动刷新</span>
            </div>
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {(strip.data?.rows ?? []).map((r) => {
                const Icon = STRIP_ICON[r.symbol] ?? LineChart;
                const v = r.change_bp ?? r.change_pct;
                return (
                  <li key={r.symbol} className="flex items-center gap-3 border-b border-white/10 py-2.5 text-sm">
                    <Icon className="size-4 shrink-0 text-white/50" />
                    <span className="mr-auto truncate text-white/85">{r.label}</span>
                    <span className="font-mono tabular-nums">{fmtNum(r.price)}</span>
                    <span className={cn("w-[68px] rounded-full px-2 py-0.5 text-right font-mono text-xs tabular-nums",
                      v == null ? "text-white/50" : v > 0 ? "bg-red-500/20 text-red-300" : v < 0 ? "bg-emerald-500/20 text-emerald-300" : "text-white/60")}>
                      {r.change_bp != null ? `${r.change_bp > 0 ? "+" : ""}${r.change_bp}bp` : fmtPct(r.change_pct)}
                    </span>
                  </li>
                );
              })}
              {strip.error && <li className="py-3 text-sm text-white/60">行情暂时取不到，稍后自动重试。</li>}
            </ul>
          </section>

          <div className="grid grid-cols-2 gap-4">
            <Tile t={MINT} title="我的股票今天" icon={Flame} data-tip-title="今日涨跌" data-tip="你跟踪的股票里，今天上涨（红）、下跌（绿）、平盘的数量。">
              <BigNumber className="text-4xl"><span className="text-red-600">{ups}</span><span className="text-muted-foreground mx-1 text-2xl">/</span><span className="text-emerald-600">{downs}</span></BigNumber>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/70">
                <div className="bg-red-400" style={{ width: `${(ups / Math.max(1, ups + downs + flats)) * 100}%` }} />
                <div className="bg-[#b7b2a4]" style={{ width: `${(flats / Math.max(1, ups + downs + flats)) * 100}%` }} />
                <div className="bg-emerald-400" style={{ width: `${(downs / Math.max(1, ups + downs + flats)) * 100}%` }} />
              </div>
              <div className="text-muted-foreground mt-1 text-xs">涨 {ups} · 平 {flats} · 跌 {downs}</div>
            </Tile>
            <Tile t={PEACH} title="近 7 天研报" icon={FileText} href="/workspace/reports" data-tip-title="研报" data-tip="最近 7 天每天写了几份报告。点箭头进入研报中心。">
              <div className="flex h-16 items-end gap-1.5">
                {days.map((d) => (
                  <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}：${d.n} 份`}>
                    <div className={cn("w-full rounded-md", d.n ? PEACH.bar : "bg-white/70")} style={{ height: `${Math.max(6, (d.n / maxDay) * 52)}px` }} />
                    <span className="text-muted-foreground text-[10px]">{d.date.slice(8)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-1 text-sm">本周 <b className="font-medium">{weekN}</b> 份</div>
            </Tile>
            <Tile t={SKY} title="自动研究" icon={Bot} href="/workspace/scheduled-tasks" data-tip-title="自动研究" data-tip="定时任务会按时写简报和研报，不用你动手。">
              <BigNumber className="text-4xl" unit="个">{activeTasks.length}</BigNumber>
              <div className="text-muted-foreground truncate text-xs">
                {nextTask?.next_run_at ? `下一个：${nextTask.title} · ${new Date(nextTask.next_run_at).toLocaleString("zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "运行中的定时任务"}
              </div>
            </Tile>
            <Tile t={STONE} title="预测记录" icon={Target} href="/workspace/reports?view=calls" data-tip-title="预测记录" data-tip="助手做过的可验证预测。可以在研报中心手动添加或标记结果。">
              <BigNumber className="text-4xl" unit="条">{openCalls}</BigNumber>
              <div className="text-muted-foreground text-xs">等待验证{score?.brier != null ? ` · Brier ${score.brier.toFixed(3)}` : ""}</div>
            </Tile>
          </div>
        </div>

        {/* ---------- my stocks ---------- */}
        <Panel>
          <PanelTitle icon={Wallet} sub="点卡片看详情 · 红涨绿跌"
            action={
              <div className="flex items-center gap-2">
                <div className="relative hidden w-44 sm:block">
                  <Search className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-3.5" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="找股票" className={cn(inputCls, "pl-8")}
                    data-tip-title="找股票" data-tip="输入名字或代码，只显示匹配的股票卡片。" />
                </div>
                <PillButton primary icon={Plus} onClick={() => setAdding(true)} data-tip-title="添加自选" data-tip="输入股票代码，把它加入自选列表。每天的简报会自动跟踪它。">添加自选</PillButton>
              </div>
            }>
            我的股票
          </PanelTitle>
          <div className="mb-4 flex flex-wrap gap-2" data-tip-title="筛选" data-tip="自选 = 你手动加的股票；研究过 = 聊过或写过研报的；上涨/下跌 = 按今天涨跌筛选。">
            {FILTERS.map(([k, l, Icon]) => (
              <Chip key={k} active={filter === k} onClick={() => setFilter(k)}><Icon className="size-3.5" />{l}</Chip>
            ))}
          </div>
          {home.error ? (
            <Empty icon={Activity}>投研数据服务没有运行。运行 <code>desk start</code>，或重启电脑后它会自动启动。</Empty>
          ) : home.data && !groups.length ? (
            <Empty icon={Search}>没有匹配的股票。点“添加自选”，或问一个关于股票的问题。</Empty>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {groups.map((g) => (
                <StockCard key={g.code} group={g} quote={quoteBy[g.code]} spark={sparks.data?.[g.code]} onOpen={() => setOpen(g.code)} />
              ))}
            </div>
          )}
          <p className="text-muted-foreground mt-4 text-xs">行情来自腾讯财经 / 新浪财经，可能有延迟。仅供研究，不构成投资建议。</p>
        </Panel>

        {/* ---------- schedules + timeline ---------- */}
        <div className="grid gap-5 lg:grid-cols-2">
          <SchedulePanel />
          <Panel data-tip-title="最近动态" data-tip="最近的对话和研报，按时间排列，点击打开。">
            <PanelTitle icon={Activity} sub="对话与研报"
              action={<Link href="/workspace/reports" className="grid size-9 place-items-center rounded-full bg-[#f1f0eb] hover:bg-[#e6e4dc] dark:bg-white/10" title="研报中心"><ArrowRight className="size-4" /></Link>}>
              最近动态
            </PanelTitle>
            <ol className="space-y-1">
              {(home.data?.recent ?? []).slice(0, 10).map((r, i) => (
                <li key={i}>
                  <Link href={r.kind === "chat" ? (r.url ?? "#") : `/workspace/reports?report=${r.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-[#f4f4f0] dark:hover:bg-white/5">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", r.kind === "report" ? PEACH.dot : SKY.dot)}>
                      {r.kind === "chat" ? (r.scheduled ? <Bot className="size-4" /> : <MessageSquare className="size-4" />) : <FileText className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.scheduled ? `【${r.scheduled}】` : ""}{r.title}</div>
                      <div className="text-muted-foreground flex items-center gap-1 text-xs">
                        <span>{relTime(r.when)}</span>
                        {r.tickers.slice(0, 3).map((c) => (
                          <span key={c} className={cn("rounded-full px-1.5", toneOf(c).chip)}>{home.data?.names[c] ?? displayCode(c)}</span>
                        ))}
                        {r.tickers.length > 3 && <span>+{r.tickers.length - 3}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
              {home.data && !home.data.recent.length && <Empty icon={MessageSquare}>还没有记录，先问一个问题吧。</Empty>}
            </ol>
          </Panel>
        </div>

        <div className={cn("flex flex-wrap items-center gap-x-6 gap-y-2 rounded-[28px] px-5 py-4 text-sm", STONE.tile)} data-tip-title="使用说明" data-tip="第一次用？看这里的三步。">
          <span className="font-medium">三步上手</span>
          <span className="flex items-center gap-2"><Search className="size-4" /> 在上面提问</span>
          <span className="flex items-center gap-2"><Star className="size-4" /> 把关心的股票加入自选</span>
          <span className="flex items-center gap-2"><CalendarClock className="size-4" /> 每天 08:45 / 15:45 自动出简报</span>
          <span className="text-muted-foreground ml-auto text-xs">看不懂某个按钮？点左下角“教程模式”。</span>
        </div>
      </div>
      <AddStockDialog open={adding} onOpenChange={setAdding} />
      <StockSheet group={openGroup} quote={open ? quoteBy[open] : undefined} spark={open ? sparks.data?.[open] : undefined}
        note={open ? (home.data?.notes?.[open] ?? "") : ""} onClose={() => setOpen(null)} onAsk={askNow} />
    </ScrollArea>
  );
}
