"use client";

// Shared building blocks for every 股市故事 level: report cards (summary-first), chips that link
// down a level (stock → stock page, project → project page), research launcher, search.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  FileText,
  Factory,
  FolderOpen,
  Megaphone,
  MessageSquare,
  NotebookPen,
  Search,
  Sparkles,
  Star,
  Sunrise,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  deskGet,
  deskPost,
  displayCode,
  fillTemplate,
  invalidateDesk,
  MODES,
  nameOr,
  NEW_CHAT_HREF,
  prefillNewChat,
  projectHref,
  relTime,
  REPORT_TYPES,
  reportHref,
  setPendingChat,
  STANCE,
  stockHref,
  TEMPLATES,
  type ProjectRef,
  type ReportLite,
  type SearchResult,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { inputCls, PillButton, textareaCls, toneOf } from "./ui";

export const TYPE_ICON: Record<string, LucideIcon> = {
  "daily-brief": Sunrise,
  announcements: Megaphone,
  "weekly-review": BarChart3,
  "market-sizing": Factory,
  "equity-research": FileText,
  note: NotebookPen,
  "thread-output": MessageSquare,
};

export function typeLabel(r: Pick<ReportLite, "type"> & { mode?: string | null }) {
  const base = REPORT_TYPES[r.type] ?? r.type;
  return r.mode && MODES[r.mode] ? `${MODES[r.mode]}${base}` : base;
}

export function TypeChip({ r, className }: { r: Pick<ReportLite, "type"> & { mode?: string | null }; className?: string }) {
  const Icon = TYPE_ICON[r.type] ?? FileText;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", toneOf(r.type).chip, className)}>
      <Icon className="size-3" />
      {typeLabel(r)}
    </span>
  );
}

export function StanceChip({ stance }: { stance?: string | null }) {
  if (!stance) return null;
  const label = STANCE[stance] ?? stance;
  const cls = label === "看好" ? "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200"
    : label === "谨慎" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
      : "bg-[#f1f0eb] dark:bg-white/10";
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px]", cls)}>{label}</span>;
}

export function StockChips({ codes, names, max = 4, className }: { codes: string[]; names: string[]; max?: number; className?: string }) {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {codes.slice(0, max).map((c, i) => (
        <Link key={c} href={stockHref(c)} onClick={(e) => e.stopPropagation()}
          className={cn("rounded-full px-2 py-0.5 text-[11px] hover:underline", toneOf(c).chip)}>
          {nameOr(names[i], c)}
        </Link>
      ))}
      {codes.length > max && <span className="text-muted-foreground text-[11px]">+{codes.length - max}</span>}
    </span>
  );
}

export function ProjectChips({ projects }: { projects: ProjectRef[] }) {
  if (!projects.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {projects.map((p) => (
        <Link key={p.id} href={projectHref(p.id)} onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-[11px] hover:bg-[#f1f0eb] dark:border-white/10">
          <FolderOpen className="size-3" />{p.name}
        </Link>
      ))}
    </span>
  );
}

/** Rich, summary-first report card used in every list. */
export function ReportCard({ r, active, onOpen, compact }: { r: ReportLite; active?: boolean; onOpen?: () => void; compact?: boolean }) {
  const router = useRouter();
  const open = onOpen ?? (() => router.push(reportHref(r.id)));
  return (
    <div role="button" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}
      className={cn("group relative flex cursor-pointer flex-col gap-1.5 rounded-[20px] border p-4 text-left transition",
        active ? "border-[#1e1c34] bg-white shadow-[0_6px_20px_rgba(30,28,52,0.08)] dark:border-white/40 dark:bg-white/10"
          : "border-transparent bg-white hover:shadow-[0_6px_20px_rgba(30,28,52,0.07)] dark:bg-white/5")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {!r.read && <span className="size-2 rounded-full bg-[#e4572e]" title="未读" />}
        <TypeChip r={r} />
        <StanceChip stance={r.stance} />
        {r.starred && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
        <span className="text-muted-foreground ml-auto text-[11px]">{r.date === new Date().toISOString().slice(0, 10) ? "今天" : r.date.slice(5)}</span>
      </div>
      <div className={cn("line-clamp-2 leading-snug", r.read ? "font-normal" : "font-semibold")}>{r.title}</div>
      {!compact && r.summary && <p className="text-muted-foreground line-clamp-2 text-sm">{r.summary}</p>}
      {(r.codes.length > 0 || r.projects.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <StockChips codes={r.codes} names={r.names} max={compact ? 3 : 5} />
          <ProjectChips projects={r.projects} />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ research launcher */
export function useStartResearch() {
  const router = useRouter();
  const { user } = useAuth();
  return (text: string, opts?: { project?: string; report?: string }) => {
    const t = text.trim();
    if (!t) return;
    if (opts?.project || opts?.report) setPendingChat({ project: opts.project, report: opts.report });
    prefillNewChat(user?.id, t);
    router.push(NEW_CHAT_HREF);
  };
}

export function NewResearchDialog({ open, onOpenChange, project, initial = "" }: {
  open: boolean; onOpenChange: (o: boolean) => void; project?: ProjectRef; initial?: string;
}) {
  const start = useStartResearch();
  const [tpl, setTpl] = useState<string | null>(null);
  const [x, setX] = useState("");
  const [free, setFree] = useState(initial);
  useEffect(() => {
    if (open) {
      setFree(initial);
      setTpl(null);
      setX("");
    }
  }, [open, initial]);
  const t = TEMPLATES.find((k) => k.key === tpl);
  const go = () => {
    const text = t ? fillTemplate(t.prompt, x) : free;
    start(text, { project: project?.id });
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5" /> 新研究</DialogTitle>
          <DialogDescription>
            选一个模板，或直接写问题。会打开一个新对话{project ? `，并归入项目「${project.name}」` : ""}；写好的研报会出现在“研报”里。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((k) => (
            <button key={k.key} type="button" onClick={() => setTpl(tpl === k.key ? null : k.key)}
              className={cn("rounded-full border px-3 py-1.5 text-sm transition",
                tpl === k.key ? "border-transparent bg-[#1e1c34] text-white" : "border-black/10 hover:bg-[#f1f0eb] dark:border-white/10")}>
              {k.label}
            </button>
          ))}
        </div>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); go(); }}>
          {t ? (
            <>
              <input autoFocus value={x} onChange={(e) => setX(e.target.value)} placeholder={t.hint} className={inputCls} />
              <p className="text-muted-foreground rounded-2xl bg-[#f4f4f0] px-4 py-3 text-xs dark:bg-white/5">{fillTemplate(t.prompt, x)}</p>
            </>
          ) : (
            <textarea autoFocus value={free} onChange={(e) => setFree(e.target.value)} rows={4} className={textareaCls}
              placeholder="想研究什么？比如：分析一下宁德时代的海外业务" />
          )}
          <PillButton primary type="submit" icon={Sparkles} disabled={t ? !x.trim() : !free.trim()}>开始研究</PillButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ search (⌘K) */
export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const { data, isFetching } = useQuery({
    queryKey: ["stock-story", "search", debounced],
    queryFn: () => deskGet<SearchResult>(`/api/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 0,
  });
  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const empty = debounced && data && !data.stocks.length && !data.reports.length && !data.chats.length && !data.projects.length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[18%] translate-y-0 gap-3 rounded-[28px] p-4 sm:max-w-2xl">
        <DialogTitle className="sr-only">搜索</DialogTitle>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-3 left-4 size-4" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜股票（名称或代码）、研报、对话、项目"
            className={cn(inputCls, "h-11 pl-10 text-base")} />
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-1">
          {!debounced && <p className="text-muted-foreground px-2 text-sm">输入如“茅台”“600519”“银行”“储能”。没研究过的股票输入 6 位代码也能打开。</p>}
          {isFetching && !data && <p className="text-muted-foreground px-2 text-sm">搜索中…</p>}
          {empty && <p className="text-muted-foreground px-2 text-sm">没有找到。</p>}
          {!!data?.stocks.length && (
            <Section label="股票">
              {data.stocks.map((s) => (
                <Row key={s.code} onClick={() => go(stockHref(s.code))} icon={<span className={cn("grid size-7 place-items-center rounded-full text-xs font-semibold", toneOf(s.code).dot)}>{(s.name || s.code).slice(0, 1)}</span>}
                  title={s.name || displayCode(s.code)} meta={displayCode(s.code)} />
              ))}
            </Section>
          )}
          {!!data?.reports.length && (
            <Section label="研报">
              {data.reports.map((r) => (
                <Row key={r.id} onClick={() => go(reportHref(r.id))} icon={<FileText className="size-4" />} title={r.title} meta={r.date} />
              ))}
            </Section>
          )}
          {!!data?.projects.length && (
            <Section label="项目">
              {data.projects.map((p) => (
                <Row key={p.id} onClick={() => go(projectHref(p.id))} icon={<FolderOpen className="size-4" />} title={p.name} />
              ))}
            </Section>
          )}
          {!!data?.chats.length && (
            <Section label="对话">
              {data.chats.map((c) => (
                <Row key={c.id} onClick={() => go(c.url)} icon={<MessageSquare className="size-4" />} title={c.title} meta={relTime(c.updated)} />
              ))}
            </Section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground px-2 pb-1 text-xs">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ icon, title, meta, onClick }: { icon: React.ReactNode; title: string; meta?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left text-sm hover:bg-[#f4f4f0] dark:hover:bg-white/5">
      <span className="text-muted-foreground grid size-7 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {meta && <span className="text-muted-foreground shrink-0 text-xs">{meta}</span>}
    </button>
  );
}

/* ------------------------------------------------------------------ add-to-project picker */
export function ProjectPicker({ open, onOpenChange, reports = [], threads = [], codes = [], current = [] }: {
  open: boolean; onOpenChange: (o: boolean) => void; reports?: string[]; threads?: string[]; codes?: string[]; current?: ProjectRef[];
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["stock-story", "projects"],
    queryFn: () => deskGet<{ projects: Array<ProjectRef & { n_reports: number }> }>("/api/projects"),
    enabled: open,
  });
  const [name, setName] = useState("");
  const inSet = useMemo(() => new Set(current.map((p) => p.id)), [current]);
  const toggle = async (pid: string, on: boolean) => {
    const payload = { reports, threads, codes };
    await deskPost("/api/projects/update", { id: pid, ...(on ? { add: payload } : { remove: payload }) });
    invalidateDesk(qc);
  };
  const create = async () => {
    if (!name.trim()) return;
    await deskPost("/api/projects/create", { name, reports, threads, codes });
    setName("");
    invalidateDesk(qc);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderOpen className="size-5" /> 归入项目</DialogTitle>
          <DialogDescription>项目把相关的研报和对话放在一起，比如“银行 2026”“AI 服务器”。可以同时属于几个项目。</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(data?.projects ?? []).map((p) => {
            const on = inSet.has(p.id);
            return (
              <button key={p.id} type="button" onClick={() => void toggle(p.id, !on)}
                className={cn("flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm transition", on ? "bg-[#1e1c34] text-white" : "hover:bg-[#f4f4f0] dark:hover:bg-white/5")}>
                <FolderOpen className="size-4" /><span className="flex-1 truncate">{p.name}</span>
                <span className="text-xs opacity-60">{on ? "已加入" : `${p.n_reports} 份`}</span>
              </button>
            );
          })}
          {data && !data.projects.length && <p className="text-muted-foreground px-2 text-sm">还没有项目，在下面新建一个。</p>}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="新项目名称" className={inputCls} />
          <PillButton primary type="submit" disabled={!name.trim()}>新建并加入</PillButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
