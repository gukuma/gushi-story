"use client";

// 研报中心: reports grouped by stock (one report can sit under several stocks), plus folders for
// daily briefs, weekly reviews, sector studies and other notes; a reader with edit / delete;
// new notes; a restorable trash; and the prediction ledger (add / resolve / delete).

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Factory,
  FilePlus2,
  FileText,
  Gauge,
  Hourglass,
  Landmark,
  Layers,
  Megaphone,
  MessageSquare,
  NotebookPen,
  PencilLine,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Sunrise,
  Target,
  Trash2,
  Undo2,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MarkdownContent } from "@/components/workspace/messages/markdown-content";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  deskGet,
  deskPost,
  displayCode,
  fmtNum,
  fmtPct,
  fmtYi,
  invalidateDesk,
  localPath,
  MODES,
  moveClass,
  nameOr,
  NEW_CHAT_HREF,
  prefillNewChat,
  relTime,
  REPORT_TYPES,
  type CallRow,
  type CallsData,
  type Quote,
  type ReportItem,
  type TrashItem,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import {
  Avatar,
  BigNumber,
  CANVAS,
  Chip,
  Empty,
  IconWell,
  inputCls,
  Metric,
  Panel,
  PanelTitle,
  PillButton,
  RoundButton,
  SKY,
  textareaCls,
  tone,
  toneOf,
} from "./ui";

type Folder = {
  key: string; // "t:sh600519" or "c:daily-brief" or "c:multi"
  kind: "ticker" | "category";
  label: string;
  sub?: string;
  icon?: LucideIcon;
  reports: ReportItem[];
  latest: string;
};

const CATEGORY_FOLDERS: Array<[string, string, LucideIcon]> = [
  ["daily-brief", "每日简报", Sunrise],
  ["announcements", "公告速览", Megaphone],
  ["weekly-review", "周报", BarChart3],
  ["market-sizing", "行业研究", Factory],
  ["multi", "多标的研究", Layers],
  ["other", "其他笔记", NotebookPen],
];

const TYPE_ICON: Record<string, LucideIcon> = {
  "daily-brief": Sunrise,
  announcements: Megaphone,
  "weekly-review": BarChart3,
  "market-sizing": Factory,
  "equity-research": FileText,
  note: NotebookPen,
  "thread-output": MessageSquare,
};

const STANCE: Record<string, string> = { constructive: "看好", neutral: "中性", cautious: "谨慎" };
const CONF: Record<string, string> = { high: "高", medium: "中", low: "低", "n/a": "—" };

function buildFolders(reports: ReportItem[]): Folder[] {
  const byTicker = new Map<string, Folder>();
  const byCat = new Map<string, Folder>();
  const cat = (k: string) => {
    if (!byCat.has(k)) {
      const [, label, icon] = CATEGORY_FOLDERS.find(([x]) => x === k) ?? CATEGORY_FOLDERS[5]!;
      byCat.set(k, { key: `c:${k}`, kind: "category", label, icon, reports: [], latest: "" });
    }
    return byCat.get(k)!;
  };
  for (const r of reports) {
    const push = (f: Folder) => {
      f.reports.push(r);
      if (r.date > f.latest) f.latest = r.date;
    };
    if (["daily-brief", "announcements", "weekly-review", "market-sizing"].includes(r.type)) {
      push(cat(r.type));
      continue;
    }
    if (!r.codes.length) {
      push(cat("other"));
      continue;
    }
    if (r.codes.length >= 4) push(cat("multi"));
    r.codes.forEach((c, i) => {
      if (!byTicker.has(c)) {
        byTicker.set(c, { key: `t:${c}`, kind: "ticker", label: nameOr(r.names[i], c), sub: displayCode(c), reports: [], latest: "" });
      }
      const f = byTicker.get(c)!;
      if (!f.label || f.label === displayCode(c)) f.label = nameOr(r.names[i], c);
      push(f);
    });
  }
  const tickers = [...byTicker.values()].sort((a, b) => b.latest.localeCompare(a.latest));
  const cats = CATEGORY_FOLDERS.map(([k]) => byCat.get(k)).filter((x): x is Folder => !!x);
  return [...tickers, ...cats];
}

function monthOf(d: string) {
  const [y, m] = d.split("-");
  return y && m ? `${y} 年 ${Number(m)} 月` : "更早";
}

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

/* ------------------------------------------------------------------ list row */
function ReportRow({ r, onOpen }: { r: ReportItem; onOpen: () => void }) {
  const Icon = TYPE_ICON[r.type] ?? FileText;
  const t = toneOf(r.type);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 rounded-[20px] bg-white p-3 text-left transition hover:shadow-[0_6px_20px_rgba(30,28,52,0.07)] dark:bg-white/5">
      <div className={cn("flex w-14 shrink-0 flex-col items-center justify-center rounded-2xl py-2 leading-tight", t.tile)}>
        <span className="text-lg font-light tabular-nums">{r.date.slice(8, 10)}</span>
        <span className="text-muted-foreground text-[10px]">{r.date.slice(5, 7)} 月</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", t.chip)}>
            <Icon className="size-3" />
            {r.mode && MODES[r.mode] ? `${MODES[r.mode]}${REPORT_TYPES[r.type] ?? r.type}` : (REPORT_TYPES[r.type] ?? r.type)}
          </span>
          {r.stance && <span className="rounded-full bg-[#f1f0eb] px-2 py-0.5 text-[11px] dark:bg-white/10">{STANCE[r.stance] ?? r.stance}</span>}
          {r.lang === "en" && <span className="rounded-full bg-[#f1f0eb] px-2 py-0.5 text-[11px] dark:bg-white/10">EN</span>}
          {r.codes.length > 1 && <span className="text-muted-foreground text-[11px]">涉及 {r.codes.length} 只股票</span>}
        </div>
        <div className="mt-1 truncate font-medium">{r.title}</div>
        {r.summary && <p className="text-muted-foreground mt-0.5 line-clamp-1 text-sm">{r.summary}</p>}
      </div>
    </button>
  );
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

function NewNoteDialog({ open, onOpenChange, tickers, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; tickers: string; onCreated: () => void }) {
  const act = useDeskAction();
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FilePlus2 className="size-5" /> 新建笔记</DialogTitle>
          <DialogDescription>自己写的笔记也放进研报中心，和助手的研报按股票归在一起。</DialogDescription>
        </DialogHeader>
        <ReportEditor isNew saving={saving} initial={{ title: "", summary: "", tickers, body: "" }} onCancel={() => onOpenChange(false)}
          onSave={async (d) => {
            setSaving(true);
            const r = await act("/api/reports/create", { title: d.title, body: d.body || `# ${d.title}\n`, tickers: splitCodes(d.tickers) }, "笔记已保存");
            setSaving(false);
            if (r) {
              onOpenChange(false);
              onCreated();
            }
          }} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ reader */
function Reader({ r, onBack, onTicker, backLabel, onDeleted }: {
  r: ReportItem; onBack: () => void; onTicker: (code: string) => void; backLabel: string; onDeleted: () => void;
}) {
  const act = useDeskAction();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["stock-story", "report", r.id],
    queryFn: () => deskGet<{ body: string; path: string }>(`/api/report?id=${r.id}`),
  });
  useEffect(() => setEditing(false), [r.id]);
  const thread = localPath(r.thread_url);
  const Icon = TYPE_ICON[r.type] ?? FileText;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <PillButton icon={ArrowLeft} onClick={onBack} className="bg-white">{backLabel}</PillButton>
        <div className="ml-auto flex gap-2">
          {thread && (
            <Link href={thread} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm hover:bg-[#e6e4dc] dark:bg-white/10"
              data-tip-title="打开原对话" data-tip="回到写出这份报告的那次对话，可以接着追问。">
              <MessageSquare className="size-4" /> 原对话
            </Link>
          )}
          <RoundButton icon={PencilLine} label="编辑" className="bg-white" onClick={() => setEditing(true)}
            data-tip-title="编辑" data-tip="修改标题、摘要、相关股票或正文。" />
          <RoundButton icon={Trash2} label="删除" className="bg-white hover:bg-red-50 hover:text-red-600" onClick={() => setConfirm(true)}
            data-tip-title="删除" data-tip="移到回收站，随时可以在“回收站”里恢复。" />
        </div>
      </div>
      <div className={cn("rounded-[28px] p-5", toneOf(r.type).tile)}>
        <div className="flex items-start gap-3">
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", toneOf(r.type).dot)}><Icon className="size-5" /></span>
          <h1 className="text-2xl font-medium tracking-tight">{r.title}</h1>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1"><CalendarDays className="size-3" />{r.date}</span>
          <span className="rounded-full bg-white/70 px-2.5 py-1">{REPORT_TYPES[r.type] ?? r.type}</span>
          {r.confidence && <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1"><Gauge className="size-3" />置信度 {CONF[r.confidence] ?? r.confidence}</span>}
          {r.stance && <span className="rounded-full bg-white/70 px-2.5 py-1">观点 {STANCE[r.stance] ?? r.stance}</span>}
          {r.calls.length > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2.5 py-1"><Target className="size-3" />预测 {r.calls.join("、")}</span>}
          {r.codes.map((c, i) => (
            <button key={c} type="button" onClick={() => onTicker(c)} className={cn("rounded-full px-2.5 py-1", toneOf(c).chip)}
              data-tip-title="相关股票" data-tip="点一下，查看这只股票的全部研报。">
              {nameOr(r.names[i], c)}
            </button>
          ))}
        </div>
      </div>
      <article className="rounded-[28px] bg-white p-6 md:p-8 dark:bg-white/5">
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
                onBack();
                void qc.invalidateQueries({ queryKey: ["stock-story", "reports"] });
              }
            }} />
        ) : isLoading ? <p className="text-muted-foreground text-sm">加载中…</p> : <MarkdownContent content={data?.body ?? ""} isLoading={false} />}
        {!editing && <p className="text-muted-foreground mt-6 border-t pt-3 text-xs">{r.path}</p>}
      </article>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="rounded-[28px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5" /> 删除这份研报？</DialogTitle>
            <DialogDescription>「{r.title}」会移到回收站，可以随时恢复。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setConfirm(false)}>取消</PillButton>
            <PillButton primary icon={Trash2} className="bg-red-600 text-white" onClick={async () => {
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

/* ------------------------------------------------------------------ ticker header */
function TickerHeader({ folder, onAsk }: { folder: Folder; onAsk: (t: string) => void }) {
  const code = folder.key.slice(2);
  const { data } = useQuery({
    queryKey: ["stock-story", "quote", code],
    queryFn: () => deskGet<Quote[]>(`/api/quotes?codes=${code}`),
    refetchInterval: 30_000,
  });
  const q = data?.[0];
  const stance = folder.reports.find((r) => r.stance)?.stance;
  const confidence = folder.reports.find((r) => r.confidence && r.confidence !== "n/a")?.confidence;
  const label = `${folder.label}（${displayCode(code)}）`;
  return (
    <div className={cn("rounded-[28px] p-5", toneOf(code).tile)}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex items-center gap-3">
          <Avatar text={folder.label} keyFor={code} className="size-12 text-lg" />
          <div>
            <h2 className="text-2xl font-medium tracking-tight">{folder.label}</h2>
            <div className="text-muted-foreground font-mono text-sm">{displayCode(code)}</div>
          </div>
        </div>
        <div className="ml-auto text-right">
          <BigNumber className="justify-end text-5xl">{fmtNum(q?.price)}</BigNumber>
          <div className={cn("font-mono text-sm", moveClass(q?.change_pct))}>{fmtPct(q?.change_pct)} <span className="text-muted-foreground">· {q?.time ?? ""}</span></div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric icon={FileText} label="研报" value={`${folder.reports.length} 份`} />
        <Metric icon={Sparkles} label="最新观点" value={stance ? (STANCE[stance] ?? stance) : "—"} />
        <Metric icon={Target} label="置信度" value={confidence ? (CONF[confidence] ?? confidence) : "—"} />
        <Metric icon={Gauge} label="市盈率" value={fmtNum(q?.pe_ttm, 1)} />
        <Metric icon={Landmark} label="市值" value={fmtYi(q?.total_mcap_cny_bn ?? q?.total_mcap_hkd_bn)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <PillButton icon={Sparkles} className="bg-white" onClick={() => onAsk(`继续研究 ${label}：最近有什么新变化？`)}>继续研究</PillButton>
        <PillButton primary icon={FileText} onClick={() => onAsk(`请用 ashare-equity-research-zh 技能为 ${label} 写一份完整的研究笔记。`)}>让助手写新研报</PillButton>
      </div>
    </div>
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
            <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-[#f4f4f0] px-4 py-3 text-sm dark:bg-white/5">
              <FileText className="text-muted-foreground size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{relTime(t.deleted)}删除</span>
              <PillButton icon={Undo2} className="bg-white" onClick={async () => { await act("/api/trash/restore", { id: t.id }, "已恢复"); void refetch(); }}>恢复</PillButton>
              <RoundButton icon={X} label="彻底删除" className="bg-white hover:text-red-600" onClick={async () => { await act("/api/trash/purge", { id: t.id }, "已彻底删除"); void refetch(); }} />
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
  const resolved = c.status !== "open";
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f4f4f0] px-4 py-2.5 text-sm dark:bg-white/5">
      <span className="text-muted-foreground w-12 shrink-0 font-mono text-xs">{c.id}</span>
      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs", toneOf(c.asset).chip)}>{c.asset}</span>
      <span className="min-w-0 flex-1 truncate" title={c.call}>{c.call}</span>
      <span className="w-12 shrink-0 text-right font-mono tabular-nums">{Math.round(Number(c.prob) * 100)}%</span>
      {resolved ? (
        <span className={cn("inline-flex w-24 shrink-0 items-center justify-end gap-1 text-xs", c.outcome === "1" ? "text-emerald-700" : c.outcome === "0" ? "text-red-600" : "text-muted-foreground")}>
          {c.outcome === "1" ? <><CheckCircle2 className="size-3.5" />成立</> : c.outcome === "0" ? <><XCircle className="size-3.5" />不成立</> : <><Ban className="size-3.5" />作废</>}
        </span>
      ) : (
        <span className="text-muted-foreground inline-flex w-24 shrink-0 items-center justify-end gap-1 text-xs"><Hourglass className="size-3.5" />{c.resolve_by}</span>
      )}
      <div className="flex shrink-0 gap-1">
        {resolved ? (
          <RoundButton icon={RotateCcw} label="重新打开" className="size-8 bg-white" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "open" }, "已重新打开")} />
        ) : (
          <>
            <RoundButton icon={Check} label="成立" className="size-8 bg-white hover:text-emerald-700" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "1" }, "标记为成立")} />
            <RoundButton icon={X} label="不成立" className="size-8 bg-white hover:text-red-600" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "0" }, "标记为不成立")} />
            <RoundButton icon={Ban} label="作废" className="size-8 bg-white" onClick={() => void act("/api/calls/resolve", { id: c.id, outcome: "void" }, "已作废")} />
          </>
        )}
        <RoundButton icon={Trash2} label="删除" className="size-8 bg-white hover:text-red-600" onClick={() => void act("/api/calls/delete", { id: c.id }, "已删除")} />
      </div>
    </li>
  );
}

function CallsView() {
  const { data, refetch } = useQuery({ queryKey: ["stock-story", "calls"], queryFn: () => deskGet<CallsData>("/api/calls") });
  const s = data?.score;
  const open = (data?.rows ?? []).filter((r) => r.status === "open");
  const done = (data?.rows ?? []).filter((r) => r.status !== "open");
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
          <div key={l} className={cn("rounded-[28px] p-5", tone(i).tile)}>
            <div className="flex items-center gap-2 text-sm"><span className={cn("grid size-8 place-items-center rounded-full", tone(i).dot)}><Icon className="size-4" /></span>{l}</div>
            <BigNumber className="mt-6 text-4xl" unit={u || undefined}>{v}</BigNumber>
          </div>
        ))}
      </div>
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
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[#f1f0eb] dark:bg-white/10">
                  <div className={cn("absolute inset-y-0 left-0 rounded-full", SKY.bar)} style={{ width: `${b.realized * 100}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-[#1e1c34]" style={{ left: `${b.stated * 100}%` }} title="声明的把握" />
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

/* ------------------------------------------------------------------ page */
type View = "reports" | "calls" | "trash";

export function ReportsCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "ticker" | "category">("all");
  const [creating, setCreating] = useState(false);
  const { data: reports, error } = useQuery({
    queryKey: ["stock-story", "reports"],
    queryFn: () => deskGet<ReportItem[]>("/api/reports"),
    refetchInterval: 60_000,
  });

  const viewParam = params.get("view");
  const view: View = viewParam === "calls" || viewParam === "trash" ? viewParam : "reports";
  const reportId = params.get("report");
  const folders = useMemo(() => buildFolders(reports ?? []), [reports]);
  const tickerParam = params.get("ticker");
  const folderKey =
    params.get("folder") ??
    (tickerParam ? `t:${tickerParam}` : null) ??
    (reportId ? folders.find((f) => f.reports.some((r) => r.id === reportId))?.key : null) ??
    folders[0]?.key ??
    null;
  const folder = folders.find((f) => f.key === folderKey) ?? null;
  const report = reportId ? (reports ?? []).find((r) => r.id === reportId) ?? null : null;

  const nav = (next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) sp.delete(k);
      else sp.set(k, v);
    }
    router.replace(`${pathname}?${sp.toString()}`);
  };
  const askNow = (text: string) => {
    prefillNewChat(user?.id, text);
    router.push(NEW_CHAT_HREF);
  };

  const shown = folders.filter((f) => {
    if (cat !== "all" && f.kind !== cat) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return f.label.toLowerCase().includes(s) || (f.sub ?? "").toLowerCase().includes(s) || f.reports.some((r) => r.title.toLowerCase().includes(s));
  });

  const months = useMemo(() => {
    const m = new Map<string, ReportItem[]>();
    for (const r of folder?.reports ?? []) {
      const k = monthOf(r.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()];
  }, [folder]);

  const VIEWS: Array<[View, string, LucideIcon]> = [
    ["reports", "研报", FileText],
    ["calls", "预测记录", Target],
    ["trash", "回收站", Trash2],
  ];

  return (
    <div className={cn("flex size-full flex-col", CANVAS)}>
      <div className="flex flex-wrap items-center gap-3 px-4 pt-5 pb-3 md:px-8">
        <IconWell icon={FileText} className="bg-white" />
        <h1 className="mr-2 text-3xl font-light tracking-tight">研报<span className="font-semibold">中心</span></h1>
        <div className="flex gap-1 rounded-full bg-white p-1 dark:bg-white/5" data-tip-title="切换视图" data-tip="“研报”按股票和类别整理所有报告；“预测记录”看预测准不准；“回收站”可以恢复删掉的研报。">
          {VIEWS.map(([k, l, Icon]) => (
            <Chip key={k} active={view === k} onClick={() => nav({ view: k === "reports" ? null : k, report: null })} className={view === k ? undefined : "border-transparent bg-transparent"}>
              <Icon className="size-3.5" />{l}
            </Chip>
          ))}
        </div>
        <span className="text-muted-foreground ml-auto hidden text-sm md:inline">{reports?.length ?? 0} 份研报 · {folders.filter((f) => f.kind === "ticker").length} 只股票</span>
        <PillButton primary icon={FilePlus2} onClick={() => setCreating(true)} data-tip-title="新建笔记" data-tip="自己写一篇笔记。填上股票代码，它会自动归到那只股票的文件夹里。">新建笔记</PillButton>
      </div>

      {view === "calls" || view === "trash" ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-5xl px-4 pb-8 md:px-8">{view === "calls" ? <CallsView /> : <TrashView />}</div>
        </ScrollArea>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 px-4 pb-4 md:grid-cols-[320px_1fr] md:px-8">
          <Panel className="flex min-h-0 flex-col p-3" data-tip-title="研报目录" data-tip="每只股票一个文件夹，数字是研报数量。一份报告提到几只股票，就会出现在几个文件夹里。下面还有每日简报、周报等分类。">
            <div className="relative mb-2">
              <Search className="text-muted-foreground pointer-events-none absolute top-3 left-3 size-3.5" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜股票、代码或标题" className={cn(inputCls, "bg-[#f4f4f0] pl-8")} />
            </div>
            <div className="mb-2 flex gap-1.5">
              {([["all", "全部"], ["ticker", "按股票"], ["category", "按类别"]] as const).map(([k, l]) => (
                <Chip key={k} active={cat === k} onClick={() => setCat(k)} className="px-3 py-1 text-xs">{l}</Chip>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <ul className="space-y-1 pr-2">
                {shown.map((f, i) => {
                  const prevKind = shown[i - 1]?.kind;
                  const active = folderKey === f.key;
                  const FIcon = f.icon ?? FileText;
                  return (
                    <li key={f.key}>
                      {f.kind === "category" && prevKind !== "category" && (
                        <div className="text-muted-foreground px-3 pt-3 pb-1 text-xs">分类</div>
                      )}
                      <button type="button" onClick={() => nav({ folder: f.key, ticker: null, report: null })}
                        className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left transition", active ? "bg-[#1e1c34] text-white" : "hover:bg-[#f4f4f0] dark:hover:bg-white/5")}>
                        {f.kind === "ticker" ? <Avatar text={f.label} keyFor={f.key.slice(2)} className="size-8 text-xs" /> : (
                          <span className={cn("grid size-8 place-items-center rounded-full", toneOf(f.key).dot)}><FIcon className="size-4" /></span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.label}</span>
                          <span className={cn("block text-[11px]", active ? "text-white/60" : "text-muted-foreground")}>
                            {f.sub ? `${f.sub} · ` : ""}{relTime(f.latest)}
                          </span>
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs tabular-nums", active ? "bg-white/15" : "bg-[#f1f0eb] dark:bg-white/10")}>{f.reports.length}</span>
                      </button>
                    </li>
                  );
                })}
                {error && <li className="text-muted-foreground p-3 text-sm">投研数据服务未运行。</li>}
                {reports && !reports.length && <li><Empty icon={FileText}>还没有研报。问助手“写一份某某股票的研报”，或点“新建笔记”。</Empty></li>}
              </ul>
            </ScrollArea>
          </Panel>

          <ScrollArea className="min-h-0">
            <div className="flex flex-col gap-4 pb-8">
              {report ? (
                <Reader r={report} backLabel={folder ? `返回「${folder.label}」` : "返回"} onBack={() => nav({ report: null })}
                  onDeleted={() => nav({ report: null })}
                  onTicker={(c) => nav({ folder: `t:${c}`, ticker: null, report: null })} />
              ) : folder ? (
                <>
                  {folder.kind === "ticker" ? <TickerHeader folder={folder} onAsk={askNow} /> : (
                    <div className={cn("rounded-[28px] p-5", toneOf(folder.key).tile)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("grid size-12 place-items-center rounded-full", toneOf(folder.key).dot)}>
                          {(() => { const FI = folder.icon ?? FileText; return <FI className="size-5" />; })()}
                        </span>
                        <div>
                          <h2 className="text-2xl font-medium tracking-tight">{folder.label}</h2>
                          <div className="text-muted-foreground text-sm">{folder.reports.length} 份 · 最近 {folder.latest}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {months.map(([m, rs]) => (
                    <div key={m}>
                      <div className="text-muted-foreground mb-2 flex items-center gap-2 px-1 text-sm">
                        <CalendarDays className="size-4" /> {m} · {rs.length} 份
                      </div>
                      <div className="space-y-2">
                        {rs.map((r) => <ReportRow key={r.id} r={r} onOpen={() => nav({ report: r.id })} />)}
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <Empty icon={Layers}>选择左侧的一个文件夹。</Empty>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
      <NewNoteDialog open={creating} onOpenChange={setCreating}
        tickers={folder?.kind === "ticker" ? displayCode(folder.key.slice(2)) : ""}
        onCreated={() => nav({ view: null, report: null })} />
    </div>
  );
}
