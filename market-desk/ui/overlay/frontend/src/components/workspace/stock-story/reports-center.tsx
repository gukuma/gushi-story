"use client";

// 研报 — the primary level. A time-ordered inbox (今天 / 昨天 / 本周 / 本月 / 更早) of every report,
// summary-first reader, reader state (已读 · 收藏 · 归档 · 笔记), 追问 (chat that starts from the
// report), 归入项目, 导出. Secondary tabs: 预测记录 (ledger) and 回收站.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  CalendarRange,
  Columns2,
  Combine,
  BarChart3,
  Check,
  CheckCircle2,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  Gauge,
  Highlighter,
  Hourglass,
  Inbox,
  ListChecks,
  Mail,
  MailOpen,
  MessageSquare,
  MessageSquarePlus,
  NotebookPen,
  PencilLine,
  Plus,
  Printer,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Star,
  Target,
  Trash2,
  Undo2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import {
  askAboutReport,
  CONF,
  deskGet,
  deskPost,
  displayCode,
  invalidateDesk,
  localPath,
  mergeReportsPrompt,
  nameOr,
  refreshReportPrompt,
  reviewReportPrompt,
  relTime,
  stockHref,
  type CallRow,
  type CallsData,
  type ReportItem,
  type TrashItem,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { ProjectChips, ProjectPicker, ReportCard, StanceChip, StockChips, TypeChip, useStartResearch } from "./blocks";
import { BigNumber, CANVAS, Chip, Empty, IconWell, inputCls, Panel, PanelTitle, PillButton, RoundButton, SafeBoundary, Skeleton, SKY, textareaCls, tone, toneOf } from "./ui";

function useDeskAction() {
  const qc = useQueryClient();
  return async (path: string, body: object, ok?: string) => {
    try {
      const r = await deskPost<Record<string, unknown>>(path, body);
      if (ok) toast.success(ok);
      invalidateDesk(qc);
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };
}

/* ------------------------------------------------------------------ editor (create + update) */
type Draft = { title: string; summary: string; tickers: string; body: string };

function ReportEditor({ initial, onCancel, onSave, saving, isNew }: {
  initial: Draft; onCancel: () => void; onSave: (d: Draft) => void; saving: boolean; isNew?: boolean;
}) {
  const [d, setD] = useState(initial);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSave(d); }}>
      <label className="text-muted-foreground text-xs">标题</label>
      <input value={d.title} onChange={set("title")} className={inputCls} placeholder="例如：茅台 三季度跟踪" autoFocus />
      {!isNew && (
        <>
          <label className="text-muted-foreground text-xs">一句话摘要</label>
          <input value={d.summary} onChange={set("summary")} className={inputCls} placeholder="列表里显示的简介" />
        </>
      )}
      <label className="text-muted-foreground text-xs">相关股票代码（用逗号或空格分开，决定它放在哪些文件夹里）</label>
      <input value={d.tickers} onChange={set("tickers")} className={inputCls} placeholder="600519, hk00700" />
      <label className="text-muted-foreground text-xs">正文（Markdown）</label>
      <textarea value={d.body} onChange={set("body")} rows={16} className={cn(textareaCls, "font-mono text-[13px] leading-relaxed")} />
      <div className="flex justify-end gap-2">
        <PillButton icon={X} onClick={onCancel}>取消</PillButton>
        <PillButton primary type="submit" icon={Save} disabled={!d.title.trim() || saving}>{saving ? "保存中…" : "保存"}</PillButton>
      </div>
    </form>
  );
}

const splitCodes = (s: string) => s.split(/[\s,，、]+/).map((x) => x.trim()).filter(Boolean);

function NewNoteDialog({ open, onOpenChange, tickers, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; tickers: string; onCreated: (id?: string) => void }) {
  const act = useDeskAction();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[6px] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FilePlus2 className="size-5" /> 新建笔记</DialogTitle>
          <DialogDescription>自己写的笔记和助手的研报放在一起；填上股票代码，股票页里也能看到它。</DialogDescription>
        </DialogHeader>
        <ReportEditor isNew saving={saving} initial={{ title: "", summary: "", tickers, body: "" }} onCancel={() => onOpenChange(false)}
          onSave={async (d) => {
            setSaving(true);
            const r = await act("/api/reports/create", { title: d.title, body: d.body || `# ${d.title}\n`, tickers: splitCodes(d.tickers) }, "笔记已保存");
            setSaving(false);
            if (r) {
              onOpenChange(false);
              onCreated(typeof r.id === "string" ? r.id : undefined);
            }
          }} />
      </DialogContent>
    </Dialog>
  );
}
/* ------------------------------------------------------------------ trash */
function TrashView() {
  const act = useDeskAction();
  const { data, refetch } = useQuery({
    queryKey: ["stock-story", "trash"],
    queryFn: () => deskPost<{ items: TrashItem[] }>("/api/trash", {}),
  });
  const items = data?.items ?? [];
  return (
    <Panel>
      <PanelTitle icon={Trash2} sub="删除的研报先放在这里，可以恢复；“彻底删除”后无法找回。">回收站（{items.length}）</PanelTitle>
      {!items.length ? <Empty icon={Trash2}>回收站是空的。</Empty> : (
        <ul className="space-y-2">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 rounded-[4px] bg-[var(--ss-sunken)] px-4 py-3 text-sm">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{relTime(t.deleted)}删除</span>
              <PillButton icon={Undo2} className="bg-[var(--ss-panel)]" onClick={async () => { await act("/api/trash/restore", { id: t.id }, "已恢复"); void refetch(); }}>恢复</PillButton>
              <RoundButton icon={X} label="彻底删除" className="bg-[var(--ss-panel)] hover:text-[var(--ss-up)]" onClick={async () => { await act("/api/trash/purge", { id: t.id }, "已彻底删除"); void refetch(); }} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ calls ledger */
function AddCall({ onDone }: { onDone: () => void }) {
  const act = useDeskAction();
  const inMonth = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const [f, setF] = useState({ asset: "", call: "", prob: "60", resolve_by: inMonth });
  return (
    <form className="grid gap-2 md:grid-cols-[140px_1fr_90px_150px_auto]" onSubmit={async (e) => {
      e.preventDefault();
      const ok = await act("/api/calls/add", { ...f, prob: Number(f.prob) / 100 }, "预测已记录");
      if (ok) {
        setF({ ...f, asset: "", call: "" });
        onDone();
      }
    }}>
      <input value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })} placeholder="标的，如 沪深300" className={inputCls} />
      <input value={f.call} onChange={(e) => setF({ ...f, call: e.target.value })} placeholder="预测内容，如 月底收在 4000 点以上" className={inputCls} />
      <div className="relative">
        <input type="number" min={1} max={99} value={f.prob} onChange={(e) => setF({ ...f, prob: e.target.value })} className={cn(inputCls, "pr-7")} title="把握（%）" />
        <span className="text-muted-foreground absolute top-2.5 right-3 text-sm">%</span>
      </div>
      <input type="date" value={f.resolve_by} onChange={(e) => setF({ ...f, resolve_by: e.target.value })} className={inputCls} title="验证日期" />
      <PillButton primary type="submit" icon={Plus} className="h-10" disabled={!f.asset.trim() || !f.call.trim()}>添加</PillButton>
    </form>
  );
}

function CallItem({ c }: { c: CallRow }) {
  const act = useDeskAction();
  const resolved = c.status !== "open" && c.status !== "proposed";
  const proposed = c.status === "proposed";
  const verdict = c.outcome === "1" ? "成立" : c.outcome === "0" ? "不成立" : "作废";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[4px] bg-[var(--ss-sunken)] px-4 py-2.5 text-sm">
      <span className="text-muted-foreground w-12 shrink-0 font-mono text-xs">{c.id}</span>
      <span className={cn("shrink-0 rounded-[4px] px-2 py-0.5 text-xs", toneOf(c.asset).chip)}>{c.asset}</span>
      <span className="min-w-0 flex-1 truncate" title={c.call}>{c.call}</span>
      <span className="w-12 shrink-0 text-right font-mono tabular-nums">{Math.round(Number(c.prob) * 100)}%</span>
      {resolved ? (
        <span className={cn("inline-flex w-24 shrink-0 items-center justify-end gap-1 text-xs", c.outcome === "1" ? "text-[var(--ss-down)]" : c.outcome === "0" ? "text-[var(--ss-up)]" : "text-muted-foreground")}>
          {c.outcome === "1" ? <><CheckCircle2 className="size-3.5" />成立</> : c.outcome === "0" ? <><XCircle className="size-3.5" />不成立</> : <><Ban className="size-3.5" />作废</>}
        </span>
      ) : (
        proposed ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-[var(--ss-signal)] bg-[var(--ss-signal-soft)] px-2 py-0.5 text-xs" title={c.note}>助手判断：{verdict}</span>
        ) : (
          <span className="text-muted-foreground inline-flex w-24 shrink-0 items-center justify-end gap-1 text-xs"><Hourglass className="size-3.5" />{c.resolve_by}</span>
        )
      )}
      <div className="flex shrink-0 gap-1">
        {resolved ? (
          <RoundButton icon={RotateCcw} label="重新打开" className="size-8 bg-[var(--ss-panel)]" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "open" }, "已重新打开")} />
        ) : (
          <>
            {proposed && <PillButton primary className="h-8" icon={Check} onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: c.outcome, note: c.note }, "已确认")}>确认</PillButton>}
            <RoundButton icon={Check} label="成立" className="size-8 bg-[var(--ss-panel)] hover:text-[var(--ss-down)]" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "1" }, "标记为成立")} />
            <RoundButton icon={X} label="不成立" className="size-8 bg-[var(--ss-panel)] hover:text-[var(--ss-up)]" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "0" }, "标记为不成立")} />
            <RoundButton icon={Ban} label="作废" className="size-8 bg-[var(--ss-panel)]" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "void" }, "已作废")} />
          </>
        )}
        <RoundButton icon={Trash2} label="删除" className="size-8 bg-[var(--ss-panel)] hover:text-[var(--ss-up)]" onClick={() => void act("/api/calls/delete", { id: c.id }, "已删除")} />
      </div>
    </li>
  );
}

function AccuracyChart({ h }: { h: NonNullable<CallsData["history"]> }) {
  const W = 700;
  const H = 140;
  const x = (i: number) => 10 + (i / Math.max(1, h.length - 1)) * (W - 20);
  const yHit = (v: number) => 10 + (1 - v) * (H - 20);
  const yBrier = (v: number) => 10 + (1 - Math.min(v, 0.5) / 0.5) * (H - 20);
  return (
    <Panel data-tip-title="准确度变化" data-tip="每验证一条预测，累计命中率（蓝线，越高越好）和 Brier 分数（橙线，越低越好，0.25 = 抛硬币）怎么变。">
      <PanelTitle icon={Target} sub={<span><span className="text-[var(--ss-data)]">━ 累计命中率</span>　<span className="text-[var(--ss-signal)]">━ Brier 分数</span>（虚线 = 抛硬币 0.25）</span>}>准确度变化</PanelTitle>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <line x1={0} x2={W} y1={yBrier(0.25)} y2={yBrier(0.25)} stroke="var(--ss-signal)" strokeOpacity={0.5} strokeDasharray="4 4" />
        <polyline fill="none" stroke="var(--ss-data)" strokeWidth={2} points={h.map((p, i) => `${x(i)},${yHit(p.hit_rate)}`).join(" ")} />
        <polyline fill="none" stroke="var(--ss-signal)" strokeWidth={2} points={h.map((p, i) => `${x(i)},${yBrier(p.brier)}`).join(" ")} />
        {h.map((p, i) => <circle key={i} cx={x(i)} cy={yHit(p.hit_rate)} r={2.5} fill="var(--ss-data)"><title>{`${p.date} · 第 ${p.n} 条 · 命中率 ${Math.round(p.hit_rate * 100)}% · Brier ${p.brier}`}</title></circle>)}
      </svg>
      <div className="text-muted-foreground flex justify-between text-[10px]"><span>{h[0]?.date}</span><span>{h[h.length - 1]?.date}</span></div>
    </Panel>
  );
}

function CallsView() {
  const { data, refetch } = useQuery({ queryKey: ["stock-story", "calls"], queryFn: () => deskGet<CallsData>("/api/calls") });
  const s = data?.score;
  const open = (data?.rows ?? []).filter((r) => r.status === "open" || r.status === "proposed");
  const done = (data?.rows ?? []).filter((r) => r.status !== "open" && r.status !== "proposed");
  const tiles: Array<[string, string | number, string, LucideIcon]> = [
    ["已验证", s?.resolved ?? 0, "条", CheckCircle2],
    ["命中率", s?.hit_rate != null ? Math.round(s.hit_rate * 100) : "—", s?.hit_rate != null ? "%" : "", Target],
    ["Brier 分数", s?.brier != null ? s.brier.toFixed(3) : "—", "", Gauge],
    ["待验证", open.length, "条", Hourglass],
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4" data-tip-title="预测成绩" data-tip="助手在报告里做的预测，到期后每周自动打分。命中率越高越好；Brier 分数越低越好，0.25 相当于抛硬币。">
        {tiles.map(([l, v, u, Icon], i) => (
          <div key={l} className={cn("rounded-[6px] p-5", tone(i).tile)}>
            <div className="flex items-center gap-2 text-sm"><span className={cn("grid size-8 place-items-center rounded-[4px]", tone(i).dot)}><Icon className="size-4" /></span>{l}</div>
            <BigNumber className="mt-6 text-4xl" unit={u || undefined}>{v}</BigNumber>
          </div>
        ))}
      </div>
      {(data?.history?.length ?? 0) >= 2 && <AccuracyChart h={data!.history!} />}
      <Panel data-tip-title="手动添加预测" data-tip="写下你自己的判断和把握（%），到验证日后点 ✓ 或 ✗ 打分，看看自己准不准。">
        <PanelTitle icon={Plus} sub="也可以记录你自己的判断">添加预测</PanelTitle>
        <AddCall onDone={() => void refetch()} />
      </Panel>
      {s?.buckets?.length ? (
        <Panel>
          <PanelTitle icon={BarChart3} sub="蓝条 = 实际准确率，黑线 = 当时说的把握">说的把握 vs 实际准确率</PanelTitle>
          <div className="space-y-2">
            {s.buckets.map((b) => (
              <div key={b.bucket} className="flex items-center gap-3 text-sm">
                <span className="w-20 shrink-0">{b.bucket}</span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[var(--ss-sunken)]">
                  <div className={cn("absolute inset-y-0 left-0 rounded-[4px]", SKY.bar)} style={{ width: `${b.realized * 100}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-[var(--ss-ink)]" style={{ left: `${b.stated * 100}%` }} title="声明的把握" />
                </div>
                <span className="text-muted-foreground w-28 shrink-0 text-right text-xs">实际 {Math.round(b.realized * 100)}% · {b.n} 条</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      <Panel>
        <PanelTitle icon={Hourglass} sub="到期后点 ✓ 成立 / ✗ 不成立 / ⊘ 作废">待验证（{open.length}）</PanelTitle>
        <ul className="space-y-2">{open.map((c) => <CallItem key={c.id} c={c} />)}</ul>
        {!open.length && <Empty icon={Hourglass}>暂无待验证的预测。</Empty>}
        <div className="mt-6"><PanelTitle icon={CheckCircle2}>已验证（{done.length}）</PanelTitle></div>
        <ul className="space-y-2">{done.map((c) => <CallItem key={c.id} c={c} />)}</ul>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ reader (summary first) */
function AskDialog({ r, open, onOpenChange }: { r: ReportItem; open: boolean; onOpenChange: (o: boolean) => void }) {
  const start = useStartResearch();
  const [q, setQ] = useState("");
  const quick = ["这份研报最关键的三个假设是什么？哪个最可能错？", "用最新数据检查一下这份研报的结论还成立吗？", "和同行业的主要对手比，结论有什么不同？", "如果要写一份更深入的版本，还缺哪些数据？"];
  const go = (text: string) => {
    start(askAboutReport(r, text), { report: r.id, project: r.projects[0]?.id });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[6px] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><MessageSquarePlus className="size-5" /> 追问这份研报</DialogTitle>
          <DialogDescription>会开一个新对话，助手先读这份研报全文再回答。对话会和这份研报关联{r.projects[0] ? `，并归入项目「${r.projects[0].name}」` : ""}。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {quick.map((x) => (
            <button key={x} type="button" onClick={() => go(x)} className="rounded-[4px] bg-[var(--ss-sunken)] px-4 py-2.5 text-left text-sm hover:bg-[var(--ss-sunken-2)]">{x}</button>
          ))}
        </div>
        <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); go(q); }}>
          <textarea value={q} onChange={(e) => setQ(e.target.value)} rows={3} className={textareaCls} placeholder="或者写你自己的问题" />
          <PillButton primary type="submit" icon={MessageSquarePlus} disabled={!q.trim()}>开始追问</PillButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Reader({ r, onBack, onDeleted }: { r: ReportItem; onBack: () => void; onDeleted: () => void }) {
  const act = useDeskAction();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [asking, setAsking] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState(r.note);
  const [showNote, setShowNote] = useState(!!r.note);
  const [size, setSize] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("stock-story:font")) || 15;
    } catch {
      return 15;
    }
  });
  const [excerpt, setExcerpt] = useState<{ text: string; x: number; y: number } | null>(null);
  const start = useStartResearch();
  const setFont = (v: number) => {
    const n = Math.max(13, Math.min(20, v));
    setSize(n);
    try {
      localStorage.setItem("stock-story:font", String(n));
    } catch {
      /* private mode */
    }
  };
  const addExcerpt = () => {
    if (!excerpt) return;
    const next = `${note ? `${note}\n\n` : ""}> ${excerpt.text.replace(/\n+/g, " ")}\n`;
    setNote(next);
    setShowNote(true);
    setExcerpt(null);
    window.getSelection()?.removeAllRanges();
    void setState({ note: next }, "已摘录到笔记");
  };
  const marked = useRef<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["stock-story", "report", r.id],
    queryFn: () => deskGet<{ body: string; path: string; meta: Record<string, unknown> }>(`/api/report?id=${r.id}`),
  });
  useEffect(() => {
    setEditing(false);
    setNote(r.note);
    setShowNote(!!r.note);
  }, [r.id, r.note]);
  useEffect(() => {  // opening a report marks it read
    if (!r.read && marked.current !== r.id) {
      marked.current = r.id;
      void deskPost("/api/reports/state", { id: r.id, read: true }).then(() => invalidateDesk(qc));
    }
  }, [r.id, r.read, qc]);
  const setState = (fields: object, ok?: string) => act("/api/reports/state", { id: r.id, ...fields }, ok);
  const thread = localPath(r.thread_url);
  return (
    <div className="flex flex-col gap-4" data-print-root>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <RoundButton icon={ArrowLeft} label="返回列表" className="bg-[var(--ss-panel)] lg:hidden" onClick={onBack} />
        <PillButton primary icon={MessageSquarePlus} onClick={() => setAsking(true)} data-tip-title="追问" data-tip="就这份研报继续问问题。会开新对话，助手先读全文。">追问</PillButton>
        <RoundButton icon={r.read ? Mail : MailOpen} label={r.read ? "标为未读" : "标为已读"} className="bg-[var(--ss-panel)]" onClick={() => void setState({ read: !r.read })} />
        <RoundButton icon={Star} label={r.starred ? "取消收藏" : "收藏"} className={cn("bg-[var(--ss-panel)]", r.starred && "text-[var(--ss-signal)] [&_svg]:fill-[var(--ss-signal)]")} onClick={() => void setState({ starred: !r.starred }, r.starred ? "已取消收藏" : "已收藏")} />
        <RoundButton icon={r.archived ? ArchiveRestore : Archive} label={r.archived ? "移回收件箱" : "归档"} className="bg-[var(--ss-panel)]"
          onClick={() => void setState({ archived: !r.archived }, r.archived ? "已移回收件箱" : "已归档").then((ok) => { if (ok && !r.archived) onBack(); })} />
        <RoundButton icon={NotebookPen} label="我的笔记" className="bg-[var(--ss-panel)]" active={showNote} onClick={() => setShowNote((s) => !s)} />
        <RoundButton icon={FolderOpen} label="归入项目" className="bg-[var(--ss-panel)]" onClick={() => setPicking(true)} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><RoundButton icon={Download} label="导出" className="bg-[var(--ss-panel)]" /></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => data && download(`${r.title}.md`, `# ${r.title}\n\n${data.body}`)}><Download /> 下载 Markdown</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setTimeout(() => window.print(), 50)}><Printer /> 打印 / 存为 PDF</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { void navigator.clipboard.writeText(`${r.title}\n${r.summary}\n\n${data?.body ?? ""}`); toast.success("已复制全文，可以粘贴到微信"); }}><FileText /> 复制全文（发微信）</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RoundButton icon={ShieldCheck} label="请风控审稿" className="bg-[var(--ss-panel)]" onClick={() => start(reviewReportPrompt(r), { report: r.id, project: r.projects[0]?.id })}
          data-tip-title="审稿" data-tip="让助手像研究总监一样检查这份研报：数字出处、前后一致、假设和反方观点，给出评分和修改意见。" />
        <RoundButton icon={RefreshCcw} label="用今天的数据重写" className="bg-[var(--ss-panel)]" onClick={() => start(refreshReportPrompt(r), { report: r.id, project: r.projects[0]?.id })}
          data-tip-title="用最新数据重写" data-tip="让助手用今天的行情和公告重写这份研报，并标出结论哪里变了。新版本会出现在收件箱。" />
        <div className="ml-auto flex gap-2">
          <div className="flex items-center rounded-[4px] bg-[var(--ss-panel)]" data-tip-title="字号" data-tip="调大或调小正文字号，会记住你的选择。">
            <button type="button" className="grid size-9 place-items-center rounded-[4px] text-xs hover:bg-[var(--ss-sunken)]" onClick={() => setFont(size - 1)}>A-</button>
            <button type="button" className="grid size-9 place-items-center rounded-[4px] text-base hover:bg-[var(--ss-sunken)]" onClick={() => setFont(size + 1)}>A+</button>
          </div>
          <RoundButton icon={PencilLine} label="编辑" className="bg-[var(--ss-panel)]" onClick={() => setEditing(true)} />
          <RoundButton icon={Trash2} label="删除（移到回收站）" className="bg-[var(--ss-panel)] hover:text-[var(--ss-up)]" onClick={() => setConfirm(true)} />
        </div>
      </div>

      {/* TL;DR */}
      <div className={cn("rounded-[6px] p-6", toneOf(r.type).tile)}>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <TypeChip r={r} className="bg-[var(--ss-panel)]" />
          <StanceChip stance={r.stance} />
          {r.confidence && r.confidence !== "n/a" && <span className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--ss-panel)] px-2 py-0.5 text-[11px]"><Gauge className="size-3" />置信度 {CONF[r.confidence] ?? r.confidence}</span>}
          <span className="text-muted-foreground ml-auto">{r.date} · {r.lang === "zh" ? `${r.words} 字` : `${r.words} words`} · 约 {Math.max(1, Math.round(r.words / (r.lang === "zh" ? 500 : 220)))} 分钟</span>
        </div>
        <h1 className="mt-3 text-2xl leading-snug font-semibold tracking-tight">{r.title}</h1>
        {r.summary && <p className="mt-3 text-[15px] leading-relaxed">{r.summary}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StockChips codes={r.codes} names={r.names} max={10} />
          <ProjectChips projects={r.projects} />
          {r.calls.length > 0 && <Link href="/workspace/reports?view=calls" className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--ss-panel)] px-2 py-0.5 text-[11px]"><Target className="size-3" />预测 {r.calls.join("、")}</Link>}
          {thread && <Link href={thread} className="inline-flex items-center gap-1 rounded-[4px] bg-[var(--ss-panel)] px-2 py-0.5 text-[11px] print:hidden"><MessageSquare className="size-3" />来自对话{r.thread_title ? `「${r.thread_title.slice(0, 16)}」` : ""}</Link>}
        </div>
      </div>

      {showNote && (
        <div className="rounded-[6px] border border-[var(--ss-signal)] bg-[var(--ss-signal-soft)] p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><NotebookPen className="size-4" />我的笔记<span className="text-muted-foreground text-xs font-normal">（只有你看得到，离开输入框自动保存）</span></div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== r.note && void setState({ note }, "笔记已保存")}
            rows={4} className={cn(textareaCls, "bg-[var(--ss-panel)]")} placeholder="记下你的想法、要验证的点、和别的研报的矛盾……" />
        </div>
      )}

      <article className="relative rounded-[6px] bg-[var(--ss-panel)] p-6 md:p-8" style={{ fontSize: size }}
        onMouseUp={(e) => {
          const t = window.getSelection()?.toString().trim() ?? "";
          if (editing || t.length < 6) return setExcerpt(null);
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setExcerpt({ text: t.slice(0, 600), x: e.clientX - box.left, y: e.clientY - box.top });
        }}>
        {excerpt && (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addExcerpt}
            className="absolute z-10 inline-flex items-center gap-1 rounded-[4px] bg-[var(--ss-ink)] px-3 py-1.5 text-xs text-[var(--ss-ink-fg)] print:hidden"
            style={{ left: Math.max(8, excerpt.x - 50), top: excerpt.y + 12 }}>
            <Highlighter className="size-3.5" />摘录到笔记
          </button>
        )}
        {editing && data ? (
          <ReportEditor saving={saving}
            initial={{ title: r.title, summary: r.summary, tickers: r.codes.map(displayCode).join(", "), body: data.body }}
            onCancel={() => setEditing(false)}
            onSave={async (d) => {
              setSaving(true);
              const ok = await act("/api/reports/update", { id: r.id, title: d.title, summary: d.summary, tickers: splitCodes(d.tickers), body: d.body }, "已保存");
              setSaving(false);
              if (ok) {
                setEditing(false);
                void qc.invalidateQueries({ queryKey: ["stock-story", "report", r.id] });
              }
            }} />
        ) : isLoading ? <div className="space-y-3"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-4/6" /></div> : (
          <>
            <div className="text-muted-foreground mb-4 flex items-center gap-2 text-xs print:hidden"><FileText className="size-3.5" />全文</div>
            <MarkdownContent content={data?.body ?? ""} isLoading={false} />
          </>
        )}
        {!editing && <p className="text-muted-foreground mt-6 border-t pt-3 text-xs">{r.path}</p>}
      </article>

      <AskDialog r={r} open={asking} onOpenChange={setAsking} />
      <ProjectPicker open={picking} onOpenChange={setPicking} reports={[r.id]} codes={[]} current={r.projects} />
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="rounded-[6px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5" /> 删除这份研报？</DialogTitle>
            <DialogDescription>「{r.title}」会移到回收站，随时可以恢复。只是不想在收件箱看到，可以用“归档”。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setConfirm(false)}>取消</PillButton>
            <PillButton primary icon={Trash2} className="bg-[var(--ss-up)] text-white" onClick={async () => {
              const ok = await act("/api/reports/delete", { id: r.id }, "已移到回收站");
              setConfirm(false);
              if (ok) onDeleted();
            }}>删除</PillButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BulkBtn({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="inline-flex h-8 items-center gap-1 rounded-[4px] bg-white/10 px-3 text-xs hover:bg-white/20 disabled:opacity-30">
      <Icon className="size-3.5" />{label}
    </button>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-md border border-[var(--ss-line)] bg-[var(--ss-sunken)] px-1.5 font-mono text-[11px]">{children}</kbd>;
}

function CompareColumn({ r }: { r: ReportItem }) {
  const { data } = useQuery({ queryKey: ["stock-story", "report", r.id], queryFn: () => deskGet<{ body: string }>(`/api/report?id=${r.id}`) });
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className={cn("rounded-[6px] p-4", toneOf(r.type).tile)}>
        <div className="flex items-center gap-1.5 text-xs"><TypeChip r={r} className="bg-[var(--ss-panel)]" /><StanceChip stance={r.stance} /><span className="text-muted-foreground ml-auto">{r.date}</span></div>
        <div className="mt-2 font-semibold">{r.title}</div>
        {r.summary && <p className="mt-1 text-sm">{r.summary}</p>}
      </div>
      <article className="rounded-[6px] bg-[var(--ss-panel)] p-5 text-sm">
        {data ? <MarkdownContent content={data.body} isLoading={false} /> : <Skeleton className="h-40" />}
      </article>
    </div>
  );
}

function CompareView({ a, b, onClose }: { a: ReportItem; b: ReportItem; onClose: () => void }) {
  const start = useStartResearch();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Columns2 className="size-4" /><span className="font-medium">并排对比</span>
        <PillButton className="ml-auto bg-[var(--ss-panel)]" icon={Combine} onClick={() => start(mergeReportsPrompt([a, b], "对比这两份研报：结论哪里一致、哪里不同、哪份的数据更新、你更认同哪个，写成一份对比研报"))}>让助手写对比</PillButton>
        <RoundButton icon={X} label="关闭对比" className="bg-[var(--ss-panel)]" onClick={onClose} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2"><CompareColumn r={a} /><CompareColumn r={b} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */
type Box = "inbox" | "unread" | "starred" | "archived" | "all";
const BOXES: Array<[Box, string, LucideIcon]> = [
  ["inbox", "收件箱", Inbox],
  ["unread", "未读", Mail],
  ["starred", "收藏", Star],
  ["archived", "已归档", Archive],
  ["all", "全部", FileText],
];
const TYPE_FILTERS: Array<[string, string]> = [
  ["", "全部类型"], ["daily-brief", "简报"], ["equity-research", "个股"], ["earnings", "财报"], ["compare", "对比"],
  ["market-sizing", "行业"], ["weekly-review", "周报"], ["announcements", "公告"], ["calendar", "日历"],
  ["thesis", "逻辑"], ["review", "审稿"], ["note", "笔记"],
];
const BUCKETS = ["今天", "昨天", "本周", "本月", "更早"];

function bucketOf(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - d.getTime()) / 86400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return "本周";
  if (days < 31) return "本月";
  return "更早";
}

export function ReportsCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const start = useStartResearch();
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: reports, error } = useQuery({
    queryKey: ["stock-story", "reports"],
    queryFn: () => deskGet<ReportItem[]>("/api/reports"),
    refetchInterval: 60_000,
  });
  const view = params.get("view") === "calls" || params.get("view") === "trash" ? params.get("view")! : "reports";
  const box = (params.get("box") as Box | null) ?? "inbox";
  const type = params.get("type") ?? "";
  const stock = params.get("stock") ?? params.get("ticker");
  const reportId = params.get("report");
  const range = params.get("range") ?? "";
  const compare = (params.get("compare") ?? "").split(",").filter(Boolean);

  const nav = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`);
  };

  const list = useMemo(() => {
    let rs = reports ?? [];
    if (box === "inbox") rs = rs.filter((r) => !r.archived);
    if (box === "unread") rs = rs.filter((r) => !r.read && !r.archived);
    if (box === "starred") rs = rs.filter((r) => r.starred);
    if (box === "archived") rs = rs.filter((r) => r.archived);
    if (type) rs = rs.filter((r) => (type === "note" ? r.type === "note" || r.type === "thread-output" : r.type === type));
    if (stock) rs = rs.filter((r) => r.codes.includes(stock));
    if (range) {
      const since = new Date(Date.now() - Number(range) * 86400_000).toISOString().slice(0, 10);
      rs = rs.filter((r) => r.date >= since);
    }
    const s = q.trim().toLowerCase();
    if (s) rs = rs.filter((r) => r.title.toLowerCase().includes(s) || r.summary.toLowerCase().includes(s) || r.names.some((n) => n.includes(s)) || r.codes.some((c) => c.includes(s)));
    return rs;
  }, [reports, box, type, stock, q, range]);
  const groups = useMemo(() => {
    const m = new Map<string, ReportItem[]>();
    for (const r of list) {
      const k = bucketOf(r.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return BUCKETS.filter((b) => m.has(b)).map((b) => [b, m.get(b)!] as const);
  }, [list]);
  const report = reportId ? (reports ?? []).find((r) => r.id === reportId) ?? null : null;
  const unread = (reports ?? []).filter((r) => !r.read && !r.archived).length;
  const stockName = stock ? (reports ?? []).flatMap((r) => r.codes.map((c, i) => [c, r.names[i]] as const)).find(([c]) => c === stock)?.[1] : null;

  const byId = useMemo(() => new Map((reports ?? []).map((r) => [r.id, r])), [reports]);
  const selected = sel.map((id) => byId.get(id)).filter((r): r is ReportItem => !!r);
  const toggleSel = (id: string) => setSel((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const endSelect = () => {
    setSelecting(false);
    setSel([]);
  };
  const bulk = async (fields: object, ok: string) => {
    await deskPost("/api/reports/state", { ids: sel, ...fields });
    invalidateDesk(qc);
    toast.success(ok);
    endSelect();
  };
  const bulkDelete = async () => {
    for (const id of sel) await deskPost("/api/reports/delete", { id });
    invalidateDesk(qc);
    toast.success(`${sel.length} 份已移到回收站`);
    setConfirmDel(false);
    endSelect();
  };

  // keyboard: j/k move, Enter/o open, s star, e archive, u unread, / search, x select, Esc close
  useEffect(() => {
    if (view !== "reports") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) return;
      const idx = list.findIndex((r) => r.id === reportId);
      const go = (i: number) => {
        const r = list[Math.max(0, Math.min(list.length - 1, i))];
        if (r) {
          nav({ report: r.id });
          document.querySelector(`[data-report-id="${r.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
      };
      const cur = idx >= 0 ? list[idx] : null;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); go(idx + 1); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); go(idx - 1); }
      else if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "Escape") { if (selecting) endSelect(); else nav({ report: null, compare: null }); }
      else if (e.key === "x") setSelecting((v) => !v);
      else if (cur && e.key === "s") void deskPost("/api/reports/state", { id: cur.id, starred: !cur.starred }).then(() => invalidateDesk(qc));
      else if (cur && e.key === "u") void deskPost("/api/reports/state", { id: cur.id, read: !cur.read }).then(() => invalidateDesk(qc));
      else if (cur && e.key === "e") void deskPost("/api/reports/state", { id: cur.id, archived: !cur.archived }).then(() => { invalidateDesk(qc); go(idx + 1); });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const markAllRead = async () => {
    const ids = list.filter((r) => !r.read).map((r) => r.id);
    if (!ids.length) return;
    await deskPost("/api/reports/state", { ids, read: true });
    invalidateDesk(qc);
    toast.success(`${ids.length} 份标为已读`);
  };

  return (
    <div className={cn("flex size-full flex-col", CANVAS)}>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-5 pb-3 md:px-8">
        <IconWell icon={FileText} className="bg-[var(--ss-panel)]" />
        <h1 className="mr-2 text-3xl font-normal tracking-tight">研<span className="font-semibold">报</span></h1>
        <div className="flex gap-1 rounded-[4px] bg-[var(--ss-panel)] p-1">
          {([["reports", "研报", FileText], ["calls", "预测记录", Target], ["trash", "回收站", Trash2]] as const).map(([k, l, Icon]) => (
            <Chip key={k} active={view === k} onClick={() => nav({ view: k === "reports" ? null : k, report: null })} className={view === k ? undefined : "border-transparent bg-transparent"}>
              <Icon className="size-3.5" />{l}
            </Chip>
          ))}
        </div>
        <span className="text-muted-foreground ml-auto hidden text-sm md:inline">{unread} 份未读 · 共 {reports?.length ?? 0} 份</span>
        <PillButton icon={FilePlus2} onClick={() => setCreating(true)} data-tip-title="新建笔记" data-tip="自己写一篇笔记，和研报放在一起。">写笔记</PillButton>
      </div>

      {view !== "reports" ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-5xl px-4 pb-8 md:px-8">{view === "calls" ? <CallsView /> : <TrashView />}</div>
        </ScrollArea>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 px-4 pb-4 md:px-8 lg:grid-cols-[420px_1fr]">
          {/* feed */}
          <div className={cn("flex min-h-0 flex-col gap-2", (report !== null || compare.length === 2) && "hidden lg:flex")}>
            <div className="flex flex-wrap gap-1 rounded-[4px] bg-[var(--ss-panel)] p-1" data-tip-title="收件箱" data-tip="收件箱 = 没归档的研报；未读 = 红点的；收藏 = 你标了星的；已归档 = 看完收起来的。">
              {BOXES.map(([k, l, Icon]) => (
                <Chip key={k} active={box === k} onClick={() => nav({ box: k === "inbox" ? null : k })} className={cn("px-3 py-1 text-xs", box === k ? undefined : "border-transparent bg-transparent")}>
                  <Icon className="size-3" />{l}{k === "unread" && unread ? ` ${unread}` : ""}
                </Chip>
              ))}
            </div>
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-3.5" />
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题、摘要、股票（按 / 键）" className={cn(inputCls, "pl-8")} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {TYPE_FILTERS.map(([k, l]) => (
                <Chip key={k || "all"} active={type === k} onClick={() => nav({ type: k || null })} className="px-2.5 py-0.5 text-xs">{l}</Chip>
              ))}
              {stock && (
                <span className={cn("inline-flex items-center gap-1 rounded-[4px] px-2.5 py-0.5 text-xs", toneOf(stock).chip)}>
                  <Link href={stockHref(stock)} className="hover:underline">{nameOr(stockName, stock)}</Link>
                  <button type="button" onClick={() => nav({ stock: null, ticker: null })}><X className="size-3" /></button>
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5" data-tip-title="时间范围" data-tip="只看最近几天的研报。">
              <CalendarRange className="text-muted-foreground size-3.5" />
              {([["", "全部时间"], ["7", "近 7 天"], ["30", "近 30 天"], ["90", "近 3 个月"]] as const).map(([k, l]) => (
                <Chip key={k || "all"} active={range === k} onClick={() => nav({ range: k || null })} className="px-2.5 py-0.5 text-xs">{l}</Chip>
              ))}
              <span className="ml-auto flex items-center gap-3">
                <button type="button" onClick={() => (selecting ? endSelect() : setSelecting(true))} className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
                  data-tip-title="多选" data-tip="一次选几份研报：一起标为已读、归档、归入项目、合并成总结，或两份并排对比。快捷键 x。">
                  <ListChecks className="size-3" />{selecting ? "取消多选" : "多选"}
                </button>
                <button type="button" onClick={() => void markAllRead()} className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"><Check className="size-3" />全部已读</button>
              </span>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 pr-2 pb-6">
                {!reports && !error && Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-28 rounded-[6px]" />)}
                {groups.map(([b, rs]) => (
                  <section key={b}>
                    <div className="text-muted-foreground sticky top-0 z-10 bg-[var(--ss-canvas)] px-1 py-1.5 text-xs backdrop-blur dark:bg-transparent">{b} · {rs.length}</div>
                    <div className="space-y-2">
                      {rs.map((r) => <ReportCard key={r.id} r={r} active={r.id === reportId} onOpen={() => nav({ report: r.id, compare: null })}
                        selectable={selecting} selected={sel.includes(r.id)} onSelect={() => toggleSel(r.id)} />)}
                    </div>
                  </section>
                ))}
                {error && <Empty icon={FileText}>投研数据服务未运行：{error.message}</Empty>}
                {reports && !list.length && <Empty icon={Inbox}>{box === "inbox" && !q && !type && !stock ? "收件箱是空的。新研报会自动出现在这里。" : "没有符合条件的研报。"}</Empty>}
              </div>
            </ScrollArea>
            {selecting && (
              <div className="rounded-[6px] bg-[var(--ss-ink)] p-3 text-[var(--ss-ink-fg)]">
                <div className="mb-2 flex items-center text-sm">
                  <span>已选 {sel.length} 份</span>
                  <button type="button" className="ml-auto text-xs text-white/70 hover:underline" onClick={() => setSel(list.map((r) => r.id))}>全选当前列表</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <BulkBtn icon={MailOpen} label="已读" disabled={!sel.length} onClick={() => void bulk({ read: true }, "已标为已读")} />
                  <BulkBtn icon={Star} label="收藏" disabled={!sel.length} onClick={() => void bulk({ starred: true }, "已收藏")} />
                  <BulkBtn icon={Archive} label="归档" disabled={!sel.length} onClick={() => void bulk({ archived: true }, "已归档")} />
                  <BulkBtn icon={FolderOpen} label="归入项目" disabled={!sel.length} onClick={() => setPicking(true)} />
                  <BulkBtn icon={Columns2} label="并排对比" disabled={sel.length !== 2} onClick={() => { nav({ compare: sel.join(","), report: null }); endSelect(); }} />
                  <BulkBtn icon={Combine} label="合并成总结" disabled={sel.length < 2} onClick={() => { start(mergeReportsPrompt(selected)); endSelect(); }} />
                  <BulkBtn icon={Trash2} label="删除" disabled={!sel.length} onClick={() => setConfirmDel(true)} />
                </div>
              </div>
            )}
          </div>

          {/* reader */}
          <ScrollArea className={cn("min-h-0", !report && compare.length !== 2 && "hidden lg:block")}>
            <div className="pb-10">
              {compare.length === 2 && byId.get(compare[0]!) && byId.get(compare[1]!) ? (
                <CompareView a={byId.get(compare[0]!)!} b={byId.get(compare[1]!)!} onClose={() => nav({ compare: null })} />
              ) : report ? (
                <SafeBoundary key={report.id} label="阅读器"><Reader r={report} onBack={() => nav({ report: null })} onDeleted={() => nav({ report: null })} /></SafeBoundary>
              ) : (
                <div className="flex flex-col items-center gap-4">
                  <Empty icon={FileText}>从左边选一份研报。先看摘要，需要再读全文。</Empty>
                  <div className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 rounded-[4px] bg-[var(--ss-panel)] px-5 py-3 text-xs">
                    <span><Kbd>j</Kbd> / <Kbd>k</Kbd> 下一份 / 上一份</span><span><Kbd>s</Kbd> 收藏</span>
                    <span><Kbd>e</Kbd> 归档</span><span><Kbd>u</Kbd> 已读 / 未读</span>
                    <span><Kbd>/</Kbd> 搜索</span><span><Kbd>x</Kbd> 多选</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      <ProjectPicker open={picking} onOpenChange={(o) => { setPicking(o); if (!o) endSelect(); }} reports={sel} />
      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent className="rounded-[6px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5" /> 删除 {sel.length} 份研报？</DialogTitle>
            <DialogDescription>它们会移到回收站，随时可以恢复。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setConfirmDel(false)}>取消</PillButton>
            <PillButton primary icon={Trash2} className="bg-[var(--ss-up)] text-white" onClick={() => void bulkDelete()}>删除</PillButton>
          </div>
        </DialogContent>
      </Dialog>
      <NewNoteDialog open={creating} onOpenChange={setCreating} tickers={stock ? displayCode(stock) : ""}
        onCreated={(id) => nav({ view: null, report: id ?? null })} />
    </div>
  );
}
