"use client";

// 股票页 — opened from search (⌘K) or any stock chip. Latest view + numbers first, then a single
// timeline of every report and conversation that mentions the stock. Stocks are never a sidebar
// tree: there may be hundreds, most researched once.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Compass,
  FileText,
  FolderOpen,
  Gauge,
  Landmark,
  MessageSquare,
  NotebookPen,
  ScanSearch,
  Star,
  StarOff,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
  APP_NAME,
  CONF,
  deskGet,
  deskPost,
  displayCode,
  fmtNum,
  fmtPct,
  fmtYi,
  invalidateDesk,
  moveClass,
  nameOr,
  projectHref,
  relTime,
  reportHref,
  TEMPLATES,
  fillTemplate,
  type StockView,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { StanceChip, TypeChip, useStartResearch } from "./blocks";
import { CandleChart } from "./chart";
import { Avatar, BigNumber, CANVAS, Empty, Metric, Panel, PanelTitle, PillButton, textareaCls, toneOf } from "./ui";

export function StockPage() {
  const params = useSearchParams();
  const code = params.get("code") ?? "";
  const qc = useQueryClient();
  const start = useStartResearch();
  const [note, setNote] = useState("");
  const { data, error } = useQuery({
    queryKey: ["stock-story", "stock", code],
    queryFn: () => deskGet<StockView>(`/api/stock?code=${encodeURIComponent(code)}`),
    enabled: !!code,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    if (data) {
      document.title = `${nameOr(data.name, data.code)} - ${APP_NAME}`;
      setNote(data.note);
    }
  }, [data]);
  const act = async (path: string, body: object, ok: string) => {
    try {
      await deskPost(path, body);
      toast.success(ok);
      invalidateDesk(qc);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (!code) return <Empty icon={Activity}>用左上角的“搜索”找一只股票。</Empty>;
  const name = data ? nameOr(data.name, data.code) : displayCode(code);
  const label = `${name}（${displayCode(data?.code ?? code)}）`;
  const q = data?.quote ?? {};
  const timeline = [
    ...(data?.reports ?? []).map((r) => ({ kind: "report" as const, when: r.date, r })),
    ...(data?.chats ?? []).map((c) => ({ kind: "chat" as const, when: (c.updated ?? "").slice(0, 10), c })),
  ].sort((a, b) => b.when.localeCompare(a.when));

  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 md:px-8">
        {error && <Empty icon={Activity}>{error.message}</Empty>}
        {/* header: name, price, actions */}
        <div className={cn("rounded-[6px] p-6", toneOf(data?.code ?? code).tile)}>
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex items-center gap-3">
              <Avatar text={name} keyFor={data?.code ?? code} className="size-14 text-xl" />
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
                <div className="text-muted-foreground font-mono text-sm">{displayCode(data?.code ?? code)}{data?.watch ? " · 自选" : ""}</div>
              </div>
            </div>
            <div className="ml-auto text-right">
              <BigNumber className="justify-end text-5xl">{fmtNum(q.price)}</BigNumber>
              <div className={cn("font-mono text-sm", moveClass(q.change_pct))}>{fmtPct(q.change_pct)} <span className="text-muted-foreground">· {q.time ?? ""}</span></div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
            <Metric icon={TrendingUp} label="最高" value={fmtNum(q.high)} />
            <Metric icon={TrendingDown} label="最低" value={fmtNum(q.low)} />
            <Metric icon={Gauge} label="市盈率" value={fmtNum(q.pe_ttm, 1)} />
            <Metric icon={Gauge} label="市净率" value={fmtNum(q.pb, 2)} />
            <Metric icon={Landmark} label="市值" value={fmtYi(q.total_mcap_cny_bn ?? q.total_mcap_hkd_bn)} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <PillButton primary icon={FileText} onClick={() => start(fillTemplate(TEMPLATES[0]!.prompt, label))}>写一份研报</PillButton>
            <PillButton icon={ScanSearch} className="bg-[var(--ss-panel)]" onClick={() => start(fillTemplate(TEMPLATES[4]!.prompt, label))}>最近发生了什么</PillButton>
            <PillButton icon={ScanSearch} className="bg-[var(--ss-panel)]" onClick={() => start(fillTemplate(TEMPLATES[3]!.prompt, label))}>解读最新财报</PillButton>
            {data && (data.watch ? (
              <PillButton icon={StarOff} className="ml-auto bg-[var(--ss-panel)]" onClick={() => void act("/api/watchlist/remove", { code: data.code }, "已移出自选")}>移出自选</PillButton>
            ) : (
              <PillButton icon={Star} className="ml-auto bg-[var(--ss-panel)]" onClick={() => void act("/api/watchlist/add", { code: data.code, name: data.name }, "已加入自选")}>加入自选</PillButton>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <CandleChart code={data?.code ?? code} />
            {/* latest view */}
            <Panel data-tip-title="最新观点" data-tip="助手最近一份关于这只股票的研报的结论。点击阅读全文。">
              <PanelTitle icon={ScanSearch} sub={data?.view ? `${data.view.date} · ${relTime(data.view.date)}` : ""}>最新观点</PanelTitle>
              {data?.view ? (
                <Link href={reportHref(data.view.id)} className="block rounded-[6px] bg-[var(--ss-sunken)] p-4 hover:bg-[var(--ss-sunken-2)]">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TypeChip r={data.view} /><StanceChip stance={data.view.stance} />
                    {data.view.confidence && data.view.confidence !== "n/a" && <span className="text-muted-foreground text-xs">置信度 {CONF[data.view.confidence] ?? data.view.confidence}</span>}
                  </div>
                  <div className="mt-2 font-medium">{data.view.title}</div>
                  {data.view.summary && <p className="text-muted-foreground mt-1 text-sm">{data.view.summary}</p>}
                </Link>
              ) : <Empty icon={FileText}>还没有关于它的研报。点上面“写一份研报”。</Empty>}
            </Panel>
            {/* timeline */}
            <Panel data-tip-title="时间线" data-tip="所有提到这只股票的研报和对话，最新在前。">
              <PanelTitle icon={Activity} sub={`${data?.reports.length ?? 0} 份研报 · ${data?.chats.length ?? 0} 个对话`}>时间线</PanelTitle>
              <ol className="relative space-y-2 border-l border-[var(--ss-line)] pl-5">
                {timeline.map((it) => (
                  <li key={it.kind === "report" ? `r${it.r.id}` : `c${it.c.id}`} className="relative">
                    <span className={cn("absolute top-3 -left-[27px] grid size-3.5 place-items-center rounded-full ring-4 ring-white", it.kind === "report" ? "bg-[var(--ss-signal)]" : "bg-[var(--ss-data)]")} />
                    {it.kind === "report" ? (
                      <Link href={reportHref(it.r.id)} className="block rounded-[4px] px-3 py-2 hover:bg-[var(--ss-sunken)]">
                        <div className="flex items-center gap-2 text-xs"><TypeChip r={it.r} /><StanceChip stance={it.r.stance} /><span className="text-muted-foreground ml-auto">{it.r.date}</span></div>
                        <div className={cn("mt-1 text-sm", !it.r.read && "font-semibold")}>{it.r.title}</div>
                        {it.r.codes.length > 4 && <div className="text-muted-foreground text-xs">多股对比，共 {it.r.codes.length} 只</div>}
                      </Link>
                    ) : (
                      <Link href={it.c.url} className="flex items-center gap-2 rounded-[4px] px-3 py-2 text-sm hover:bg-[var(--ss-sunken)]">
                        <MessageSquare className="text-muted-foreground size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{it.c.title}</span>
                        {it.c.others > 0 && <span className="text-muted-foreground text-xs">+{it.c.others} 只</span>}
                        <span className="text-muted-foreground shrink-0 text-xs">{relTime(it.c.updated)}</span>
                      </Link>
                    )}
                  </li>
                ))}
                {data && !timeline.length && <li className="text-muted-foreground text-sm">还没有任何记录。</li>}
              </ol>
            </Panel>
          </div>
          <div className="flex flex-col gap-5">
            <Panel data-tip-title="投资逻辑" data-tip="这只股票的核心逻辑和每根支柱的状态，由个股研究员每周更新。">
              <PanelTitle icon={Compass} sub={data?.thesis?.updated ? `更新于 ${data.thesis.updated}` : "还没有"}
                action={data?.thesis ? <span className={cn("rounded-[3px] border px-2 py-0.5 text-xs",
                  data.thesis.status === "broken" ? "border-[var(--ss-up)] text-[var(--ss-up)]" : data.thesis.status === "watch" ? "border-[var(--ss-signal)] text-[var(--ss-signal)]" : "border-[var(--ss-line)]")}>
                  {data.thesis.status === "broken" ? "已失效" : data.thesis.status === "watch" ? "需观察" : "成立"}</span> : undefined}>
                投资逻辑
              </PanelTitle>
              {data?.thesis ? (
                <div className="space-y-2 text-sm">
                  <p>{data.thesis.summary}</p>
                  <ul className="space-y-1">{data.thesis.pillars.map((x, i) => <li key={i} className="flex gap-2 text-xs"><span className="font-mono text-[var(--ss-muted)]">{i + 1}</span>{x}</li>)}</ul>
                </div>
              ) : (
                <button type="button" className="text-left text-sm text-[var(--ss-muted)] hover:underline"
                  onClick={() => start(fillTemplate(TEMPLATES.find((t) => t.key === "thesis")!.prompt, label))}>还没有投资逻辑文件 · 让个股研究员建立一份</button>
              )}
            </Panel>
            {data?.watch && (
              <Panel>
                <PanelTitle icon={NotebookPen} sub="助手写简报时会参考">关注理由</PanelTitle>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className={textareaCls}
                  onBlur={() => note !== data.note && void act("/api/watchlist/note", { code: data.code, note }, "已保存")} placeholder="为什么关注它？" />
              </Panel>
            )}
            <Panel>
              <PanelTitle icon={FolderOpen}>所在项目</PanelTitle>
              {data?.projects.length ? (
                <ul className="space-y-1">{data.projects.map((p) => (
                  <li key={p.id}><Link href={projectHref(p.id)} className="flex items-center gap-2 rounded-[4px] px-2 py-2 text-sm hover:bg-[var(--ss-sunken)]"><FolderOpen className="size-4" />{p.name}</Link></li>
                ))}</ul>
              ) : <p className="text-muted-foreground text-sm">不在任何项目里。</p>}
            </Panel>
            <Link href={`/workspace/reports?stock=${data?.code ?? code}`} className="text-muted-foreground text-center text-sm hover:underline">在研报里只看这只股票 →</Link>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
