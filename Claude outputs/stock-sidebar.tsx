"use client";

// 📈 股市故事 sidebar — information levels, most used first:
//   [新研究] [搜索 ⌘K]
//   今日 · 研报 (unread) · 项目 · 对话
//   未读研报 (latest 5) → 最近对话 (8, chronological) → 自动研究 status
// Stocks are NOT a sidebar tree (hundreds, mostly one-off): they're reached via search and chips.
// Also mounts the chat context bar (project / stocks / reports / 存为研报 / templates) on chat pages.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FileText,
  FolderOpen,
  FolderPlus,
  Home,
  KeyRound,
  Link2,
  MessageSquare,
  MessagesSquare,
  MoreHorizontal,
  PencilLine,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { getAPIClient } from "@/core/api";
import { extractTextFromMessage } from "@/core/messages/utils";
import { useScheduledTasks } from "@/core/scheduled-tasks/hooks";
import {
  deskGet,
  deskPost,
  fillTemplate,
  invalidateDesk,
  projectHref,
  reportHref,
  stockHref,
  takePendingChat,
  TEMPLATES,
  type ChatRow,
  type ReportItem,
  type ThreadView,
} from "@/core/stock-story/api";
import { useDeleteThread, useRenameThread } from "@/core/threads/hooks";
import type { AgentThreadState } from "@/core/threads/types";
import { cn } from "@/lib/utils";

import { NewResearchDialog, ProjectPicker, SearchDialog, TYPE_ICON } from "./blocks";
import { inputCls, PillButton, toneOf } from "./ui";

function useReports() {
  return useQuery({ queryKey: ["stock-story", "reports"], queryFn: () => deskGet<ReportItem[]>("/api/reports"), refetchInterval: 60_000 });
}

/* ------------------------------------------------------------------ top: actions + levels */
export function StockNav() {
  const pathname = usePathname();
  const { open: sidebarOpen } = useSidebar();
  const [searching, setSearching] = useState(false);
  const [research, setResearch] = useState(false);
  const { data: reports } = useReports();
  const unread = (reports ?? []).filter((r) => !r.read && !r.archived).length;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", onKey, true); // capture: wins over DeerFlow's ⌘K palette
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const NAV = [
    { href: "/", icon: Home, label: "今日", badge: 0, active: pathname === "/" || pathname === "/workspace", tip: "每天早上看这一页：市场、新研报、自选股、需要你确认的事。" },
    { href: "/workspace/reports", icon: FileText, label: "研报", badge: unread, active: pathname.startsWith("/workspace/reports"), tip: "最常用：所有研报按时间排成收件箱，数字是未读数。" },
    { href: "/workspace/themes", icon: FolderOpen, label: "项目", badge: 0, active: pathname.startsWith("/workspace/themes"), tip: "研究主题，把相关研报和对话放在一起。" },
    { href: "/workspace/chats", icon: MessagesSquare, label: "对话", badge: 0, active: pathname === "/workspace/chats", tip: "所有和助手的对话。" },
  ];
  return (
    <>
      <SidebarGroup className="gap-1 pt-1">
        {sidebarOpen ? (
          <div className="mb-1 flex gap-1.5">
            <button type="button" onClick={() => setResearch(true)} data-tip-title="新研究" data-tip="选模板（个股深度、对比、行业规模…）或直接写问题，开始一次新研究。"
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1e1c34] text-sm text-white hover:opacity-90 dark:bg-white dark:text-[#1e1c34]">
              <Sparkles className="size-4" />新研究
            </button>
            <button type="button" onClick={() => setSearching(true)} title="搜索 ⌘K" data-tip-title="搜索" data-tip="找股票、研报、对话、项目。快捷键 ⌘K。"
              className="bg-sidebar-accent inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm">
              <Search className="size-4" /><span className="text-muted-foreground text-xs">⌘K</span>
            </button>
          </div>
        ) : null}
        <SidebarMenu>
          {!sidebarOpen && (
            <>
              <SidebarMenuItem><SidebarMenuButton tooltip="新研究" onClick={() => setResearch(true)}><Sparkles /></SidebarMenuButton></SidebarMenuItem>
              <SidebarMenuItem><SidebarMenuButton tooltip="搜索 ⌘K" onClick={() => setSearching(true)}><Search /></SidebarMenuButton></SidebarMenuItem>
            </>
          )}
          {NAV.map(({ href, icon: Icon, label, badge, active, tip }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild tooltip={label} isActive={active} data-tip-title={label} data-tip={tip}>
                <Link href={href}><Icon /><span>{label}</span></Link>
              </SidebarMenuButton>
              {badge > 0 && <SidebarMenuBadge className={cn("rounded-full px-1.5", active ? "text-white" : "bg-[#e4572e] text-white")}>{badge}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      <SearchDialog open={searching} onOpenChange={setSearching} />
      <NewResearchDialog open={research} onOpenChange={setResearch} />
    </>
  );
}

/* ------------------------------------------------------------------ middle: unread reports + recent chats */
type ChatMenu = { chat: ChatRow; kind: "rename" | "delete" | "project" } | null;

export function TickerChatGroups() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const { data: reports } = useReports();
  const chats = useQuery({ queryKey: ["stock-story", "chats", 8], queryFn: () => deskGet<{ chats: ChatRow[]; total: number }>("/api/chats?limit=8"), refetchInterval: 30_000 });
  const [menu, setMenu] = useState<ChatMenu>(null);
  const unread = useMemo(() => (reports ?? []).filter((r) => !r.read && !r.archived), [reports]);
  const rename = useRenameThread();
  const del = useDeleteThread();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const refresh = async () => {
    try {
      await deskPost("/api/refresh", {});
    } catch {
      /* offline: catches up on next poll */
    }
    invalidateDesk(qc);
  };
  return (
    <>
      <SidebarGroup data-tip-title="未读研报" data-tip="最新写好、你还没看的研报。点一下直接阅读。">
        <SidebarGroupLabel>未读研报{unread.length ? ` · ${unread.length}` : ""}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {unread.slice(0, 5).map((r) => {
              const Icon = TYPE_ICON[r.type] ?? FileText;
              return (
                <SidebarMenuItem key={r.id}>
                  <SidebarMenuButton asChild size="sm">
                    <Link href={reportHref(r.id)} title={r.title}>
                      <Icon className="text-muted-foreground" />
                      <span className="truncate font-medium">{r.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
            {reports && !unread.length && <div className="text-muted-foreground px-2 py-1 text-xs">都读完了 ✓</div>}
            {unread.length > 5 && (
              <SidebarMenuItem><SidebarMenuButton asChild size="sm"><Link href="/workspace/reports?box=unread" className="text-muted-foreground"><span>查看全部 {unread.length} 份未读 →</span></Link></SidebarMenuButton></SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup data-tip-title="最近对话" data-tip="按时间排的最近对话。鼠标移上去点 ⋯ 可以重命名、归入项目或删除。">
        <SidebarGroupLabel>最近对话</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {(chats.data?.chats ?? []).map((c) => (
              <SidebarMenuItem key={c.id}>
                <SidebarMenuButton asChild size="sm" isActive={pathname === c.url} className="pr-7">
                  <Link href={c.url} title={c.title}>
                    <span className="truncate">{c.scheduled ? "⏱ " : ""}{c.title}</span>
                  </Link>
                </SidebarMenuButton>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuAction showOnHover aria-label="对话操作"><MoreHorizontal /></SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="right" align="start" className="w-44">
                    <DropdownMenuItem onSelect={() => { setTitle(c.title); setMenu({ chat: c, kind: "rename" }); }}><PencilLine /> 重命名</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setMenu({ chat: c, kind: "project" })}><FolderPlus /> 归入项目</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setMenu({ chat: c, kind: "delete" })}><Trash2 /> 删除对话</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            ))}
            {chats.data && !chats.data.chats.length && <div className="text-muted-foreground px-2 py-1 text-xs">还没有对话</div>}
            {chats.error && <div className="text-muted-foreground px-2 py-1 text-xs">投研数据服务未运行（desk start 会启动它）</div>}
            {(chats.data?.total ?? 0) > 8 && (
              <SidebarMenuItem><SidebarMenuButton asChild size="sm"><Link href="/workspace/chats" className="text-muted-foreground"><span>全部 {chats.data?.total} 个对话 →</span></Link></SidebarMenuButton></SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <ProjectPicker open={menu?.kind === "project"} onOpenChange={(o) => !o && setMenu(null)} threads={menu ? [menu.chat.id] : []}
        codes={menu?.chat.tickers ?? []} current={menu?.chat.projects ?? []} />
      <Dialog open={menu?.kind === "rename"} onOpenChange={(o) => !o && setMenu(null)}>
        <DialogContent className="rounded-[28px] sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><PencilLine className="size-5" /> 重命名对话</DialogTitle></DialogHeader>
          <form className="flex flex-col gap-3" onSubmit={(e) => {
            e.preventDefault();
            if (!menu || !title.trim()) return;
            rename.mutate({ threadId: menu.chat.id, title: title.trim() }, {
              onSuccess: () => { toast.success("已重命名"); void refresh(); setMenu(null); },
              onError: (err) => toast.error(err.message),
            });
          }}>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
            <PillButton primary type="submit" icon={PencilLine} disabled={rename.isPending}>保存</PillButton>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={menu?.kind === "delete"} onOpenChange={(o) => !o && setMenu(null)}>
        <DialogContent className="rounded-[28px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Trash2 className="size-5" /> 删除这条对话？</DialogTitle>
            <DialogDescription>「{menu?.chat.title}」的全部消息会被永久删除。它写出的研报已经存在研报里，不受影响。</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setMenu(null)}>取消</PillButton>
            <PillButton primary icon={Trash2} className="bg-red-600 text-white" disabled={del.isPending} onClick={() => {
              if (!menu) return;
              const c = menu.chat;
              del.mutate({ threadId: c.id }, {
                onSuccess: () => { toast.success("对话已删除"); void refresh(); if (pathname === c.url) router.push("/"); setMenu(null); },
                onError: (err) => toast.error(err.message),
              });
            }}>删除</PillButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ bottom: status + settings */
export function SidebarStatus() {
  const { data: tasks } = useScheduledTasks();
  const { open } = useSidebar();
  if (!open) return null;
  const list = tasks ?? [];
  const on = list.filter((t) => t.status === "enabled" || t.status === "running").length;
  const failed = list.filter((t) => t.last_error && t.status !== "paused").length;
  return (
    <div className="flex flex-col gap-0.5 px-1 text-xs">
      <Link href="/workspace/scheduled-tasks" className="hover:bg-sidebar-accent flex items-center gap-2 rounded-lg px-2 py-1.5"
        data-tip-title="自动研究" data-tip="定时任务的状态。绿点 = 都在运行；灰点 = 有暂停的；红点 = 有失败的。点进去管理。">
        <span className={cn("size-2 rounded-full", failed ? "bg-red-500" : on === list.length && list.length ? "bg-[#7ccf94]" : "bg-[#b7b2a4]")} />
        <span>自动研究 {on}/{list.length} 运行中</span>
        {failed > 0 && <span className="text-red-600">· {failed} 失败</span>}
      </Link>
      <div className="flex gap-1">
        <Link href="/workspace/reports?view=calls" className="hover:bg-sidebar-accent text-muted-foreground flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5"><Target className="size-3.5" />预测记录</Link>
        <Link href="/workspace/keys" className="hover:bg-sidebar-accent text-muted-foreground flex flex-1 items-center gap-1.5 rounded-lg px-2 py-1.5"><KeyRound className="size-3.5" />API 密钥</Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ chat context bar */
function setComposerText(text: string) {
  const el = document.querySelector<HTMLTextAreaElement>("main textarea") ?? document.querySelector<HTMLTextAreaElement>("textarea");
  if (!el) {
    void navigator.clipboard.writeText(text);
    toast.message("已复制模板，粘贴到输入框即可");
    return;
  }
  // React-controlled textarea: use the native setter so React sees the change
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeSet = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (nativeSet) Reflect.apply(nativeSet, el, [text]);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

export function ChatContextBar() {
  const pathname = usePathname();
  const qc = useQueryClient();
  const m = /\/chats\/([^/]+)$/.exec(pathname);
  const tid = m?.[1] && m[1] !== "new" ? m[1] : null;
  const isNew = m?.[1] === "new";
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingDone = useRef<string | null>(null);
  const { data } = useQuery({
    queryKey: ["stock-story", "thread", tid],
    queryFn: () => deskGet<ThreadView>(`/api/thread?id=${tid}`),
    enabled: !!tid,
    refetchInterval: 30_000,
  });
  // a chat started from a project or from "追问" files itself once it has an id
  useEffect(() => {
    if (!tid || pendingDone.current === tid) return;
    pendingDone.current = tid;
    const p = takePendingChat();
    if (!p) return;
    void (async () => {
      try {
        if (p.project) await deskPost("/api/projects/update", { id: p.project, add: { threads: [tid] } });
        if (p.report) await deskPost("/api/thread/link", { thread: tid, report: p.report });
        invalidateDesk(qc);
      } catch {
        /* data service offline */
      }
    })();
  }, [tid, qc]);
  useEffect(() => setOpen(false), [pathname]);

  const saveAsReport = async () => {
    if (!tid) return;
    setSaving(true);
    try {
      const state = await getAPIClient().threads.getState<AgentThreadState>(tid);
      const msgs = state.values?.messages ?? [];
      const last = [...msgs].reverse().find((x) => x.type === "ai" && extractTextFromMessage(x).length > 40);
      if (!last) throw new Error("这条对话还没有可以保存的回答");
      const body = extractTextFromMessage(last);
      const r = await deskPost<{ id: string }>("/api/reports/create", { body, thread_id: tid, project: data?.projects[0]?.id ?? "" });
      toast.success("已存为研报", { action: { label: "打开", onClick: () => window.location.assign(reportHref(r.id)) } });
      invalidateDesk(qc);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (isNew) {
    return (
      <div className="fixed top-[60px] right-4 z-30">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-4 text-sm shadow-[0_2px_10px_rgba(30,28,52,0.08)] dark:bg-[#1e1d2a]"
              data-tip-title="研究模板" data-tip="选一个模板，问题会自动写进输入框，把（股票/主题）改成你的就行。">
              <Wand2 className="size-4" />研究模板<ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.key} onSelect={() => setComposerText(fillTemplate(t.prompt, "（股票/主题）"))}>
                <Sparkles />{t.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }
  if (!tid) return null;
  const nReports = (data?.reports.length ?? 0) + (data?.linked.length ?? 0);
  return (
    <div className="fixed top-[60px] right-4 z-30 flex flex-col items-end gap-2" data-tip-title="本对话" data-tip="这条对话属于哪个项目、提到哪些股票、写出了哪些研报。可以归入项目，或把最后的回答存为研报。">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 max-w-[420px] items-center gap-2 rounded-full bg-white px-4 text-sm shadow-[0_2px_10px_rgba(30,28,52,0.08)] dark:bg-[#1e1d2a]">
        <FolderOpen className="size-4 shrink-0" />
        <span className="truncate">{data?.projects[0]?.name ?? "未归入项目"}</span>
        <span className="text-muted-foreground shrink-0 text-xs">· {data?.n_stocks ?? 0} 只股票 · {nReports} 份研报</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition", open && "rotate-180")} />
      </button>
      {open && data && (
        <div className="w-[380px] rounded-[24px] bg-white p-4 text-sm shadow-[0_12px_40px_rgba(30,28,52,0.16)] dark:bg-[#1e1d2a]">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-medium">本对话</span>
            <button type="button" className="text-muted-foreground ml-auto grid size-7 place-items-center rounded-full hover:bg-[#f1f0eb]" onClick={() => setOpen(false)}><X className="size-3.5" /></button>
          </div>
          {data.linked.length > 0 && (
            <Section icon={Link2} label="追问的研报">
              {data.linked.map((r) => <Row key={r.id} href={reportHref(r.id)} text={r.title} />)}
            </Section>
          )}
          <Section icon={FileText} label={`写出的研报（${data.reports.length}）`}>
            {data.reports.map((r) => <Row key={r.id} href={reportHref(r.id)} text={r.title} />)}
            {!data.reports.length && <div className="text-muted-foreground text-xs">还没有。可以把最后的回答存为研报。</div>}
          </Section>
          <Section icon={FolderOpen} label="项目">
            <div className="flex flex-wrap gap-1.5">
              {data.projects.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-black/10 px-2 py-0.5 text-xs dark:border-white/10">
                  <Link href={projectHref(p.id)} className="hover:underline">{p.name}</Link>
                  <button type="button" title="移出项目" onClick={() => void deskPost("/api/projects/update", { id: p.id, remove: { threads: [data.id] } }).then(() => invalidateDesk(qc))}><X className="size-3" /></button>
                </span>
              ))}
              <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1 rounded-full bg-[#f1f0eb] px-2 py-0.5 text-xs hover:bg-[#e6e4dc] dark:bg-white/10"><FolderPlus className="size-3" />归入项目</button>
            </div>
          </Section>
          {data.stocks.length > 0 && (
            <Section icon={MessageSquare} label={`提到的股票（${data.n_stocks}）`}>
              <div className="flex flex-wrap gap-1">
                {data.stocks.map((s) => (
                  <Link key={s.code} href={stockHref(s.code)} className={cn("rounded-full px-2 py-0.5 text-[11px] hover:underline", toneOf(s.code).chip)}>{s.name || s.code}</Link>
                ))}
              </div>
            </Section>
          )}
          <PillButton primary icon={Save} className="mt-2 w-full" disabled={saving} onClick={() => void saveAsReport()}>{saving ? "保存中…" : "把最后的回答存为研报"}</PillButton>
        </div>
      )}
      <ProjectPicker open={picking} onOpenChange={setPicking} threads={[tid]} codes={(data?.stocks ?? []).slice(0, 10).map((s) => s.code)}
        reports={(data?.reports ?? []).map((r) => r.id)} current={data?.projects ?? []} />
    </div>
  );
}

function Section({ icon: Icon, label, children }: { icon: typeof FileText; label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs"><Icon className="size-3.5" />{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ href, text }: { href: string; text: string }) {
  return <Link href={href} className="block truncate rounded-xl px-2 py-1 hover:bg-[#f4f4f0] dark:hover:bg-white/5">{text}</Link>;
}
