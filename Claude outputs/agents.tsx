"use client";

// 助手 — the research agents as friendly cards: what each one does, which skills it uses, which
// scheduled tasks rely on it; start a chat, edit its name / description / working style, delete.

import { Bot, CalendarClock, CircleAlert, Loader2, MessageSquarePlus, PencilLine, Plus, Save, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAgent, useAgents, useDeleteAgent, useUpdateAgent } from "@/core/agents/hooks";
import type { Agent } from "@/core/agents/types";
import { useScheduledTasks } from "@/core/scheduled-tasks/hooks";
import { APP_NAME } from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { CANVAS, Empty, IconWell, inputCls, PillButton, RoundButton, Skeleton, textareaCls, tone } from "./ui";

const SKILL_LABEL: Record<string, string> = {
  "market-data": "实时行情", "daily-market-brief-zh": "每日简报", "weekly-macro-review-zh": "宏观周报", "ashare-equity-research-zh": "个股研究",
  "market-sizing-zh": "市场规模", "announcement-watch-zh": "公告监控", "chinese-sources-first": "中文信源优先",
  "daily-market-brief": "Daily brief", "weekly-macro-review": "Weekly macro", "ashare-equity-research": "Equity research", "market-sizing": "Market sizing",
};

function EditSheet({ name, onClose }: { name: string | null; onClose: () => void }) {
  const { agent, isLoading } = useAgent(name);
  const update = useUpdateAgent();
  const [f, setF] = useState({ display_name: "", description: "", soul: "", skills: [] as string[] });
  const [newSkill, setNewSkill] = useState("");
  useEffect(() => {
    if (agent) setF({ display_name: agent.display_name ?? "", description: agent.description, soul: agent.soul ?? "", skills: agent.skills ?? [] });
  }, [agent]);
  const save = () => {
    if (!name) return;
    update.mutate({ name, request: { display_name: f.display_name || null, description: f.description, soul: f.soul, skills: f.skills } }, {
      onSuccess: () => { toast.success("已保存，下一次对话开始生效"); onClose(); },
      onError: (e) => toast.error(e.message),
    });
  };
  return (
    <Sheet open={!!name} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle className="flex items-center gap-2 text-xl"><PencilLine className="size-5" />修改助手</SheetTitle></SheetHeader>
        {isLoading ? <div className="space-y-3 px-4"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-64" /></div> : (
          <div className="flex flex-col gap-5 px-4 pb-8">
            <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">显示名称</span>
              <input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} className={inputCls} placeholder={name ?? ""} /></label>
            <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">一句话介绍</span>
              <span className="text-muted-foreground text-xs">别的助手和你自己都靠这句话知道它擅长什么。</span>
              <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={2} className={textareaCls} /></label>
            <div className="flex flex-col gap-1.5 text-sm"><span className="font-medium">技能</span>
              <span className="text-muted-foreground text-xs">助手会用到的工作方法（skills/custom 里的技能名）。</span>
              <div className="flex flex-wrap gap-1.5">
                {f.skills.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-[#f1f0eb] px-2.5 py-1 text-xs dark:bg-white/10">
                    {SKILL_LABEL[s] ?? s}<span className="text-muted-foreground font-mono">{SKILL_LABEL[s] ? s : ""}</span>
                    <button type="button" onClick={() => setF({ ...f, skills: f.skills.filter((x) => x !== s) })}><X className="size-3" /></button>
                  </span>
                ))}
                <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = newSkill.trim(); if (v && !f.skills.includes(v)) setF({ ...f, skills: [...f.skills, v] }); setNewSkill(""); }}>
                  <input value={newSkill} onChange={(e) => setNewSkill(e.target.value)} placeholder="加技能名" className={cn(inputCls, "h-7 w-36 text-xs")} />
                </form>
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium">工作方式（人设）</span>
              <span className="text-muted-foreground text-xs">告诉助手它是谁、怎么工作、用什么语气、什么不能做。这是最重要的设置。</span>
              <textarea value={f.soul} onChange={(e) => setF({ ...f, soul: e.target.value })} rows={16} className={cn(textareaCls, "font-mono text-[13px] leading-relaxed")} /></label>
            <div className="flex justify-end gap-2">
              <PillButton onClick={onClose}>取消</PillButton>
              <PillButton primary icon={update.isPending ? Loader2 : Save} disabled={update.isPending} onClick={save}>保存</PillButton>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AgentCard({ a, i, uses, onEdit, onDelete }: { a: Agent; i: number; uses: string[]; onEdit: () => void; onDelete: () => void }) {
  const t = tone(i);
  return (
    <div className={cn("flex flex-col gap-3 rounded-[28px] p-5", t.tile)}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", t.dot)}><Bot className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-lg leading-tight font-semibold">{a.display_name ?? a.name}</div>
          <div className="text-muted-foreground font-mono text-xs">{a.name}{a.model ? ` · ${a.model}` : ""}</div>
        </div>
      </div>
      <p className="line-clamp-3 text-sm">{a.description || "（还没有介绍）"}</p>
      {!!a.skills?.length && (
        <div className="flex flex-wrap gap-1">
          {a.skills.map((s) => <span key={s} className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] dark:bg-white/10">{SKILL_LABEL[s] ?? s}</span>)}
        </div>
      )}
      {uses.length > 0 && (
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs"><CalendarClock className="size-3.5" />定时任务：{uses.join("、")}</div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link href={`/workspace/agents/${a.name}/chats/new`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1e1c34] px-4 text-sm text-white dark:bg-white dark:text-[#1e1c34]">
          <MessageSquarePlus className="size-4" />和它对话
        </Link>
        <div className="ml-auto flex gap-1.5">
          <RoundButton icon={PencilLine} label="修改" className="bg-white dark:bg-white/10" onClick={onEdit} />
          <RoundButton icon={Trash2} label="删除" className="bg-white hover:text-red-600 dark:bg-white/10" onClick={onDelete} />
        </div>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const { agents, isLoading, error } = useAgents();
  const { data: tasks } = useScheduledTasks();
  const del = useDeleteAgent();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Agent | null>(null);
  useEffect(() => {
    document.title = `助手 - ${APP_NAME}`;
  }, []);
  const usesOf = (name: string) => (tasks ?? []).filter((t) => t.assistant_id === name).map((t) => t.title);
  const zh = agents.filter((a) => a.name.endsWith("-zh"));
  const other = agents.filter((a) => !a.name.endsWith("-zh"));
  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <IconWell icon={Bot} className="bg-white" />
          <div className="mr-auto">
            <h1 className="text-3xl font-light tracking-tight">研究<span className="font-semibold">助手</span></h1>
            <p className="text-muted-foreground text-sm">每个助手擅长一类工作。新对话默认交给“市场分析师”。</p>
          </div>
          <Link href="/workspace/agents/new" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1e1c34] px-4 text-sm text-white dark:bg-white dark:text-[#1e1c34]"><Plus className="size-4" />新建助手</Link>
        </div>
        {error && <Empty icon={CircleAlert}>{error.message}</Empty>}
        {isLoading && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-64 rounded-[28px]" />)}</div>}
        {!isLoading && !agents.length && <Empty icon={Sparkles}>还没有助手。在终端运行 desk seed 创建默认助手。</Empty>}
        {[["中文助手", zh], ["其他助手", other]].map(([label, list]) => (list as Agent[]).length > 0 && (
          <section key={label as string}>
            <div className="text-muted-foreground mb-2 px-1 text-sm">{label as string}</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(list as Agent[]).map((a, i) => (
                <AgentCard key={a.name} a={a} i={i} uses={usesOf(a.name)} onEdit={() => setEditing(a.name)} onDelete={() => setDeleting(a)} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <EditSheet name={editing} onClose={() => setEditing(null)} />
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="rounded-[28px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5" /> 删除「{deleting?.display_name ?? deleting?.name}」？</DialogTitle>
            <DialogDescription>
              {deleting && usesOf(deleting.name).length ? `注意：${usesOf(deleting.name).join("、")} 这些定时任务在用它，删除后会运行失败。` : "删除后不能恢复（可以运行 desk seed 重新创建默认助手）。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setDeleting(null)}>取消</PillButton>
            <PillButton primary icon={Trash2} className="bg-red-600 text-white" onClick={() => deleting && del.mutate(deleting.name, { onSuccess: () => { toast.success("已删除"); setDeleting(null); }, onError: (e) => toast.error(e.message) })}>删除</PillButton>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
