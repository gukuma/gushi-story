"use client";

// 今日 ("/") — the one-page morning brief: market moves · new reports since yesterday · my ~10
// watchlist stocks · things that need me (predictions to confirm, paused/failed schedules,
// project suggestions). Everything links down one level: report → reader, stock → stock page.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Bitcoin,
  BellRing,
  Check,
  CheckCheck,
  CircleAlert,
  CircleDollarSign,
  Coins,
  Droplets,
  FileText,
  FolderPlus,
  Landmark,
  LineChart,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Sunrise,
  Target,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useResumeScheduledTask, useTriggerScheduledTask } from "@/core/scheduled-tasks/hooks";
import {
  APP_NAME,
  deskGet,
  deskPost,
  displayCode,
  fmtNum,
  fmtPct,
  invalidateDesk,
  moveClass,
  nameOr,
  relTime,
  reportHref,
  stockHref,
  TEMPLATES,
  type Brief,
  type Suggestion,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { NewResearchDialog, ReportCard, StanceChip, useStartResearch } from "./blocks";
import { CANVAS, Empty, INK, inputCls, MINT, Panel, PanelTitle, PEACH, PillButton, RoundButton, Skeleton, SKY, STONE, textareaCls } from "./ui";

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

function useBrief() {
  return useQuery({ queryKey: ["stock-story", "brief"], queryFn: () => deskGet<Brief>("/api/brief"), refetchInterval: 60_000 });
}

/* ------------------------------------------------------------------ add stock */
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
          <DialogDescription>自选是你重点跟踪的 10 只左右的股票：每天的简报都会写到它们。A股输入 6 位代码，港股如 hk00700。</DialogDescription>
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

/* ------------------------------------------------------------------ needs me */
function NeedsMe({ b, suggestions }: { b: Brief; suggestions: Suggestion[] }) {
  const qc = useQueryClient();
  const resume = useResumeScheduledTask();
  const act = async (path: string, body: object, ok: string) => {
    try {
      await deskPost(path, body);
      toast.success(ok);
      invalidateDesk(qc);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const paused = b.schedules.filter((s) => s.status === "paused");
  const failed = b.schedules.filter((s) => s.last_error && s.status !== "paused");
  const items: React.ReactNode[] = [];
  for (const c of b.calls.proposed) {
    items.push(
      <li key={`p${c.id}`} className="rounded-2xl bg-[#f4f4f0] p-3 text-sm dark:bg-white/5">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">助手判断这条预测{c.outcome === "1" ? "成立" : c.outcome === "0" ? "不成立" : "作废"}</div>
            <div className="text-muted-foreground mt-0.5 text-xs">{c.asset} · {c.call}（把握 {Math.round(Number(c.prob) * 100)}%）</div>
            {c.note && <div className="mt-1 text-xs">依据：{c.note}</div>}
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <PillButton className="h-8 bg-white" icon={X} onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "open", note: "" }, "已退回，等待重新判断")}>不同意</PillButton>
          <PillButton primary className="h-8" icon={Check} onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: c.outcome, note: c.note }, "已确认")}>确认</PillButton>
        </div>
      </li>,
    );
  }
  if (b.calls.due.length) {
    items.push(
      <li key="due"><Link href="/workspace/reports?view=calls" className="flex items-center gap-2 rounded-2xl bg-[#f4f4f0] p-3 text-sm hover:bg-[#ebeae4] dark:bg-white/5">
        <Target className="size-4" /><span className="flex-1">{b.calls.due.length} 条预测已到验证日，等待助手判断</span><ArrowRight className="size-4" />
      </Link></li>,
    );
  }
  if (paused.length) {
    items.push(
      <li key="paused" className={cn("flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm", PEACH.tile)}>
        <Pause className="size-4" /><span className="flex-1">{paused.length} 个自动任务暂停中：{paused.map((s) => s.title).join("、")}</span>
        <PillButton primary className="h-8" icon={Play} onClick={() => paused.forEach((s) => resume.mutate(s.id))}>全部启用</PillButton>
      </li>,
    );
  }
  for (const s of failed) {
    items.push(
      <li key={`f${s.id}`}><Link href={s.last_thread_id ? `/workspace/chats/${s.last_thread_id}` : "/workspace/scheduled-tasks"}
        className="flex items-center gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">
        <CircleAlert className="size-4" /><span className="flex-1">「{s.title}」上次运行失败</span><ArrowRight className="size-4" />
      </Link></li>,
    );
  }
  for (const sg of suggestions.slice(0, 2)) {
    items.push(
      <li key={sg.key} className={cn("flex flex-wrap items-center gap-2 rounded-2xl p-3 text-sm", SKY.tile)}>
        <FolderPlus className="size-4" />
        <span className="flex-1">建议建立项目「{sg.name}」<span className="text-muted-foreground"> · {sg.why}</span></span>
        <PillButton className="h-8 bg-white" onClick={() => void act("/api/projects/dismiss", { key: sg.key }, "不再提示")}>忽略</PillButton>
        <PillButton primary className="h-8" icon={Check} onClick={() => void act("/api/projects/create", { name: sg.name, reports: sg.reports, threads: sg.threads, codes: sg.codes, key: sg.key }, "项目已建立")}>建立</PillButton>
      </li>,
    );
  }
  return (
    <Panel data-tip-title="需要你处理" data-tip="只有需要你点一下的事情才会出现在这里：确认预测结果、启用暂停的任务、确认建议的项目。">
      <PanelTitle icon={BellRing} sub={items.length ? `${items.length} 件事` : "都处理好了"}>需要你处理</PanelTitle>
      {items.length ? <ul className="space-y-2">{items}</ul> : <Empty icon={CheckCheck}>没有需要处理的事。</Empty>}
    </Panel>
  );
}

/* ------------------------------------------------------------------ schedule strip */
function ScheduleStrip({ b }: { b: Brief }) {
  const trigger = useTriggerScheduledTask();
  const on = b.schedules.filter((s) => s.status === "enabled" || s.status === "running");
  const next = on.filter((s) => s.next_run_at).sort((a, c) => a.next_run_at!.localeCompare(c.next_run_at!))[0];
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] px-4 py-3 text-sm", STONE.tile)}
      data-tip-title="自动研究" data-tip="定时任务的运行状态。绿点 = 在按时运行，灰点 = 暂停，红点 = 上次失败。点 ▶ 可以马上跑一次。">
      <span className="flex items-center gap-2 font-medium"><Activity className="size-4" />自动研究</span>
      {b.schedules.map((s) => {
        const ok = s.status === "enabled" || s.status === "running";
        return (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", s.last_error ? "bg-red-500" : ok ? "bg-[#7ccf94]" : "bg-[#b7b2a4]")} />
            <span className={ok ? "" : "text-muted-foreground"}>{s.title}</span>
            <button type="button" title="立即运行一次" className="grid size-6 place-items-center rounded-full hover:bg-white dark:hover:bg-white/10"
              onClick={() => trigger.mutate(s.id, { onSuccess: () => toast.success(`「${s.title}」已开始运行`) })}><Play className="size-3" /></button>
          </span>
        );
      })}
      {!b.schedules.length && <span className="text-muted-foreground">还没有定时任务（运行 desk seed）</span>}
      <Link href="/workspace/scheduled-tasks" className="text-muted-foreground ml-auto flex items-center gap-1 text-xs hover:underline">
        {next?.next_run_at ? `下一个：${next.title} · ${new Date(next.next_run_at).toLocaleString("zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit" })}` : "管理"} <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ page */
export function StockHome() {
  const qc = useQueryClient();
  const start = useStartResearch();
  const { data: b, error, isFetching, refetch } = useBrief();
  const sugg = useQuery({ queryKey: ["stock-story", "projects"], queryFn: () => deskGet<{ suggestions: Suggestion[] }>("/api/projects"), refetchInterval: 300_000 });
  const [ask, setAsk] = useState("");
  const [research, setResearch] = useState<{ open: boolean; initial: string }>({ open: false, initial: "" });
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    document.title = `今日 - ${APP_NAME}`;
  }, []);
  const live = b?.status.state === "open" || b?.status.state === "auction";
  const markAllRead = async () => {
    if (!b) return;
    await deskPost("/api/reports/state", { ids: b.new_reports.map((r) => r.id), read: true });
    invalidateDesk(qc);
  };
  const removeWatch = async (code: string) => {
    try {
      await deskPost("/api/watchlist/remove", { code });
      toast.success("已移出自选");
      invalidateDesk(qc);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const marketBroken = b && b.market.length > 0 && b.market.every((m) => m.price == null);

  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-8">
        {/* ---------- header + ask ---------- */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="mr-auto">
            <div className="text-muted-foreground mb-2 flex items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 dark:bg-white/10">
                <span className={cn("size-2 rounded-full", live ? "animate-pulse bg-red-500" : "bg-[#b7b2a4]")} />{b?.status.label ?? "…"}
              </span>
              <span>{b?.status.now ?? ""}</span>
              <RoundButton icon={RefreshCw} label="刷新" className="size-7 bg-white" spin={isFetching} onClick={() => void refetch()} />
            </div>
            <h1 className="text-4xl leading-tight font-light tracking-tight">{greeting()}，这是<span className="font-semibold">今日简报</span></h1>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); start(ask); }}
            className="flex w-full items-center gap-2 rounded-full bg-white p-1.5 pl-4 shadow-[0_1px_2px_rgba(30,28,52,0.06)] lg:w-[520px] dark:bg-white/5"
            data-tip-title="提问" data-tip="直接提问会开一个新对话。想要完整研报，点“新研究”选模板。">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="快速提问……" className="h-9 min-w-0 flex-1 bg-transparent outline-none" />
            <PillButton primary icon={Sparkles} onClick={() => setResearch({ open: true, initial: ask })}>新研究</PillButton>
          </form>
        </div>

        {error && <div className="rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">{error.message}。运行 <code>desk restart</code>。</div>}
        {marketBroken && <div className="rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200">行情暂时取不到（价格显示为 —）。详细原因在 logs/dashboard.log；通常重启数据服务即可：<code>desk restart</code></div>}

        {b ? <ScheduleStrip b={b} /> : <Skeleton className="h-12 rounded-[22px]" />}

        {/* ---------- market + needs-me ---------- */}
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <section className={cn("rounded-[28px] p-5", INK)} data-tip-title="市场" data-tip="主要指数、汇率、利率、黄金、原油和比特币，自动刷新。红涨绿跌。">
            <div className="mb-3 flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-full border border-white/25"><LineChart className="size-4" /></span>
              <div className="mr-auto"><h2 className="text-lg font-medium">市场</h2><div className="text-xs text-white/60">指数 · 汇率 · 利率 · 商品 · 加密</div></div>
              {b?.latest_brief && (
                <Link href={reportHref(b.latest_brief.id)} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs text-[#1e1c34]">
                  <Sunrise className="size-3.5 shrink-0" /><span className="truncate">{b.latest_brief.title}</span> <ArrowRight className="size-3 shrink-0" />
                </Link>
              )}
            </div>
            {b?.latest_brief?.summary && <p className="mb-3 rounded-2xl bg-white/10 px-4 py-3 text-sm text-white/90">{b.latest_brief.summary}</p>}
            {!b && <div className="grid gap-2 sm:grid-cols-2">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-8 animate-pulse rounded-xl bg-white/10" />)}</div>}
            <ul className="grid gap-x-6 sm:grid-cols-2">
              {(b?.market ?? []).map((r) => {
                const Icon = STRIP_ICON[r.symbol] ?? LineChart;
                const v = r.change_bp ?? r.change_pct;
                return (
                  <li key={r.symbol} className="flex items-center gap-3 border-b border-white/10 py-2 text-sm">
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
            </ul>
          </section>
          {b ? <NeedsMe b={b} suggestions={sugg.data?.suggestions ?? []} /> : <Skeleton className="h-72 rounded-[28px]" />}
        </div>

        {/* ---------- new reports ---------- */}
        <Panel data-tip-title="新研报" data-tip="昨天到现在写好的研报，红点 = 未读。点卡片阅读：先看摘要，需要再看全文。">
          <PanelTitle icon={FileText} sub={b ? `未读 ${b.unread} 份` : ""}
            action={
              <div className="flex gap-2">
                <PillButton icon={CheckCheck} onClick={() => void markAllRead()} disabled={!b?.new_reports.some((r) => !r.read)}>全部标为已读</PillButton>
                <Link href="/workspace/reports" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1e1c34] px-4 text-sm text-white dark:bg-white dark:text-[#1e1c34]">全部研报 <ArrowRight className="size-4" /></Link>
              </div>
            }>
            新研报
          </PanelTitle>
          {b && !b.new_reports.length ? <Empty icon={FileText}>还没有研报。点“新研究”，或等定时任务自动生成。</Empty> : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {!b && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-36 rounded-[20px]" />)}
              {(b?.new_reports ?? []).map((r) => <ReportCard key={r.id} r={r} />)}
            </div>
          )}
        </Panel>

        {/* ---------- watchlist ---------- */}
        <Panel data-tip-title="自选股" data-tip="你重点跟踪的股票。每行：现价、今日涨跌、助手最新观点和最新研报。点股票名进入股票页。">
          <PanelTitle icon={Star} sub="点股票进入股票页 · 红涨绿跌"
            action={<PillButton primary icon={Plus} onClick={() => setAdding(true)}>添加自选</PillButton>}>
            自选股
          </PanelTitle>
          {b && !b.watch.length ? <Empty icon={Star}>还没有自选股。点“添加自选”。</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr><th className="py-2 pl-2 font-normal">股票</th><th className="py-2 text-right font-normal">现价</th><th className="py-2 text-right font-normal">涨跌</th>
                    <th className="py-2 pl-6 font-normal">最新观点</th><th className="py-2 font-normal">最新研报</th><th /></tr>
                </thead>
                <tbody>
                  {(b?.watch ?? []).map((w) => (
                    <tr key={w.code} className="group border-t border-black/5 dark:border-white/10">
                      <td className="py-2.5 pl-2">
                        <Link href={stockHref(w.code)} className="flex items-center gap-2 hover:underline">
                          <span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold", MINT.dot)}>{nameOr(w.name, w.code).slice(0, 1)}</span>
                          <span className="font-medium">{nameOr(w.name, w.code)}</span>
                          <span className="text-muted-foreground font-mono text-xs">{displayCode(w.code)}</span>
                        </Link>
                        {w.note && <div className="text-muted-foreground mt-0.5 max-w-[260px] truncate pl-9 text-xs">{w.note}</div>}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{fmtNum(w.price)}</td>
                      <td className={cn("py-2.5 text-right font-mono tabular-nums", moveClass(w.change_pct))}>{fmtPct(w.change_pct)}</td>
                      <td className="py-2.5 pl-6"><StanceChip stance={w.latest?.stance} />{!w.latest?.stance && <span className="text-muted-foreground text-xs">—</span>}</td>
                      <td className="max-w-[320px] py-2.5">
                        {w.latest ? <Link href={reportHref(w.latest.id)} className="block truncate hover:underline">{w.latest.title}<span className="text-muted-foreground ml-2 text-xs">{relTime(w.latest.date)}</span></Link>
                          : <button type="button" className="text-muted-foreground text-xs hover:underline" onClick={() => start(TEMPLATES[0]!.prompt.replace("{x}", `${nameOr(w.name, w.code)}（${displayCode(w.code)}）`))}>还没有研报 · 写一份</button>}
                      </td>
                      <td className="py-2.5 pr-2 text-right">
                        <button type="button" title="移出自选" onClick={() => void removeWatch(w.code)}
                          className="text-muted-foreground grid size-7 place-items-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-[#f1f0eb]"><X className="size-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <p className="text-muted-foreground text-xs">行情来自腾讯财经 / 新浪财经，可能有延迟。仅供研究，不构成投资建议。</p>
      </div>
      <AddStockDialog open={adding} onOpenChange={setAdding} />
      <NewResearchDialog open={research.open} initial={research.initial} onOpenChange={(o) => setResearch((r) => ({ ...r, open: o }))} />
    </ScrollArea>
  );
}
