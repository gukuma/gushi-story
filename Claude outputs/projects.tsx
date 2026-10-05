"use client";

// 项目 — themes that hold reports AND conversations ("银行 2026", "AI 服务器"). The system suggests
// projects (one research run that produced many reports, a stock with many reports); you confirm.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FolderOpen, FolderPlus, MessageSquare, PencilLine, Plus, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  APP_NAME,
  deskGet,
  deskPost,
  invalidateDesk,
  projectHref,
  relTime,
  stockHref,
  type Project,
  type ReportLite,
  type Suggestion,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { NewResearchDialog, ReportCard } from "./blocks";
import { CANVAS, Empty, IconWell, inputCls, Panel, PanelTitle, PillButton, RoundButton, SKY, tone, toneOf } from "./ui";

type ProjectDetail = {
  project: Project;
  reports: ReportLite[];
  threads: Array<{ id: string; title: string; url: string; updated?: string | null; tickers: string[] }>;
  stocks: Array<{ code: string; name: string }>;
};

function useAct() {
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

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const act = useAct();
  const router = useRouter();
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[28px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FolderPlus className="size-5" /> 新建项目</DialogTitle>
          <DialogDescription>项目是一个研究主题，把相关的研报和对话放在一起。之后在研报或对话里点“归入项目”。</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault();
          const r = await act("/api/projects/create", { name }, "项目已建立");
          if (r?.project) {
            onOpenChange(false);
            setName("");
            router.push(projectHref((r.project as Project).id));
          }
        }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="如：银行 2026、AI 服务器、储能" className={inputCls} />
          <PillButton primary type="submit" icon={Plus} disabled={!name.trim()}>建立</PillButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Suggestions({ items }: { items: Suggestion[] }) {
  const act = useAct();
  const [names, setNames] = useState<Record<string, string>>({});
  if (!items.length) return null;
  return (
    <Panel className={SKY.tile} data-tip-title="建议的项目" data-tip="系统发现这些研报属于同一个主题。可以改名后点“建立”，或者“忽略”。">
      <PanelTitle icon={Sparkles} sub="根据你的研报自动发现的主题，确认后才会建立">建议的项目</PanelTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((s) => (
          <div key={s.key} className="flex flex-col gap-2 rounded-[20px] bg-white p-4 dark:bg-white/5">
            <input value={names[s.key] ?? s.name} onChange={(e) => setNames({ ...names, [s.key]: e.target.value })}
              className="w-full bg-transparent text-base font-medium outline-none" title="点击修改名称" />
            <div className="text-muted-foreground text-xs">{s.why} · {s.reports.length} 份研报{s.threads.length ? ` · ${s.threads.length} 个对话` : ""}</div>
            <div className="mt-1 flex justify-end gap-2">
              <PillButton icon={X} onClick={() => void act("/api/projects/dismiss", { key: s.key }, "不再提示")}>忽略</PillButton>
              <PillButton primary icon={Check} onClick={() => void act("/api/projects/create", { name: names[s.key] ?? s.name, reports: s.reports, threads: s.threads, codes: s.codes, key: s.key }, "项目已建立")}>建立</PillButton>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ProjectList() {
  const [creating, setCreating] = useState(false);
  const { data, error } = useQuery({ queryKey: ["stock-story", "projects"], queryFn: () => deskGet<{ projects: Project[]; suggestions: Suggestion[] }>("/api/projects") });
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <IconWell icon={FolderOpen} className="bg-white" />
        <h1 className="mr-auto text-3xl font-light tracking-tight">项<span className="font-semibold">目</span></h1>
        <PillButton primary icon={FolderPlus} onClick={() => setCreating(true)}>新建项目</PillButton>
      </div>
      <Suggestions items={data?.suggestions ?? []} />
      {error && <Empty icon={FolderOpen}>{error.message}</Empty>}
      {data && !data.projects.length && <Empty icon={FolderOpen}>还没有项目。确认上面的建议，或者新建一个。</Empty>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data?.projects ?? []).map((p, i) => (
          <Link key={p.id} href={projectHref(p.id)} className={cn("flex min-h-[160px] flex-col rounded-[28px] p-5 transition hover:-translate-y-0.5", tone(i).tile)}>
            <div className="flex items-center gap-2">
              <span className={cn("grid size-9 place-items-center rounded-full", tone(i).dot)}><FolderOpen className="size-4" /></span>
              <span className="mr-auto truncate text-lg font-medium">{p.name}</span>
              {p.unread > 0 && <span className="rounded-full bg-[#e4572e] px-2 py-0.5 text-xs text-white">{p.unread} 未读</span>}
            </div>
            <div className="text-muted-foreground mt-2 line-clamp-1 text-xs">{p.names.filter(Boolean).join("、")}</div>
            <div className="mt-auto flex items-end gap-6 pt-4">
              <div><div className="text-3xl font-light tabular-nums">{p.n_reports}</div><div className="text-muted-foreground text-xs">研报</div></div>
              <div><div className="text-3xl font-light tabular-nums">{p.n_threads}</div><div className="text-muted-foreground text-xs">对话</div></div>
              <div className="text-muted-foreground ml-auto text-xs">{relTime(p.latest)}</div>
            </div>
          </Link>
        ))}
      </div>
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function ProjectDetailView({ id }: { id: string }) {
  const act = useAct();
  const router = useRouter();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [research, setResearch] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { data, error } = useQuery({ queryKey: ["stock-story", "project", id], queryFn: () => deskGet<ProjectDetail>(`/api/project?id=${id}`) });
  useEffect(() => {
    if (data) document.title = `${data.project.name} - ${APP_NAME}`;
  }, [data]);
  if (error) return <Empty icon={FolderOpen}>{error.message}</Empty>;
  if (!data) return <p className="text-muted-foreground text-sm">加载中…</p>;
  const p = data.project;
  return (
    <div className="flex flex-col gap-5">
      <div className={cn("rounded-[28px] p-6", toneOf(p.id).tile)}>
        <div className="flex flex-wrap items-center gap-3">
          <RoundButton icon={ArrowLeft} label="全部项目" className="bg-white" onClick={() => router.push("/workspace/themes")} />
          <span className={cn("grid size-11 place-items-center rounded-full", toneOf(p.id).dot)}><FolderOpen className="size-5" /></span>
          {renaming ? (
            <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (await act("/api/projects/update", { id, name }, "已改名")) setRenaming(false); }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
              <PillButton primary type="submit" icon={Check}>保存</PillButton>
            </form>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          )}
          <div className="ml-auto flex gap-2">
            <PillButton primary icon={Sparkles} onClick={() => setResearch(true)} data-tip-title="在项目里研究" data-tip="开一个新对话，自动归入这个项目。">在项目里研究</PillButton>
            <RoundButton icon={PencilLine} label="改名" className="bg-white" onClick={() => { setName(p.name); setRenaming(true); }} />
            <RoundButton icon={Trash2} label="删除项目" className="bg-white hover:text-red-600" onClick={() => setConfirm(true)} />
          </div>
        </div>
        {!!data.stocks.length && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {data.stocks.map((s) => (
              <Link key={s.code} href={stockHref(s.code)} className={cn("rounded-full px-2.5 py-1 text-xs hover:underline", toneOf(s.code).chip)}>{s.name || s.code}</Link>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel>
          <PanelTitle icon={FolderOpen} sub="按时间，最新在前">研报（{data.reports.length}）</PanelTitle>
          {data.reports.length ? (
            <div className="grid gap-3 md:grid-cols-2">{data.reports.map((r) => <ReportCard key={r.id} r={r} />)}</div>
          ) : <Empty icon={FolderOpen}>还没有研报。在研报里点“归入项目”，或点“在项目里研究”。</Empty>}
        </Panel>
        <Panel>
          <PanelTitle icon={MessageSquare}>对话（{data.threads.length}）</PanelTitle>
          <ul className="space-y-1">
            {data.threads.map((t) => (
              <li key={t.id} className="group flex items-center gap-2 rounded-2xl px-2 py-2 text-sm hover:bg-[#f4f4f0] dark:hover:bg-white/5">
                <MessageSquare className="text-muted-foreground size-4 shrink-0" />
                <Link href={t.url} className="min-w-0 flex-1 truncate">{t.title}</Link>
                <span className="text-muted-foreground shrink-0 text-xs">{relTime(t.updated)}</span>
                <button type="button" title="移出项目" className="text-muted-foreground grid size-6 place-items-center rounded-full opacity-0 group-hover:opacity-100 hover:bg-white"
                  onClick={() => void act("/api/projects/update", { id, remove: { threads: [t.id] } }, "已移出项目")}><X className="size-3" /></button>
              </li>
            ))}
            {!data.threads.length && <Empty icon={MessageSquare}>还没有对话。</Empty>}
          </ul>
        </Panel>
      </div>
      <NewResearchDialog open={research} onOpenChange={setResearch} project={{ id: p.id, name: p.name }} />
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="rounded-[28px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5" /> 删除项目「{p.name}」？</DialogTitle>
            <DialogDescription>只删除这个项目本身。里面的研报和对话都保留，不会被删除。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setConfirm(false)}>取消</PillButton>
            <PillButton primary icon={Trash2} className="bg-red-600 text-white" onClick={async () => {
              if (await act("/api/projects/delete", { id }, "项目已删除")) router.push("/workspace/themes");
            }}>删除项目</PillButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ProjectsPage() {
  const params = useSearchParams();
  const id = params.get("id");
  useEffect(() => {
    if (!id) document.title = `项目 - ${APP_NAME}`;
  }, [id]);
  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto w-full max-w-[1320px] px-4 py-6 md:px-8">{id ? <ProjectDetailView id={id} /> : <ProjectList />}</div>
    </ScrollArea>
  );
}
