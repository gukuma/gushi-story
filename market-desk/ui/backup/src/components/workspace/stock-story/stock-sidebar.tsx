"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ChevronRight,
  FileText,
  Home,
  KeyRound,
  Layers,
  MessagesSquare,
  Search,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  deskGet,
  displayCode,
  type SidebarTickers,
  type ThreadRef,
} from "@/core/stock-story/api";

const NAV = [
  { href: "/", icon: Home, label: "首页", exact: true },
  { href: "/workspace/reports", icon: FileText, label: "研报中心" },
  { href: "/workspace/scheduled-tasks", icon: CalendarClock, label: "定时任务" },
  { href: "/workspace/chats", icon: MessagesSquare, label: "全部对话", exact: true },
  { href: "/workspace/keys", icon: KeyRound, label: "API 密钥" },
];

export function StockNav() {
  const pathname = usePathname();
  return (
    <SidebarGroup className="pt-1">
      <SidebarMenu>
        {NAV.map(({ href, icon: Icon, label, exact }) => (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              asChild
              tooltip={label}
              isActive={href === "/" ? pathname === "/" || pathname === "/workspace" : exact ? pathname === href : pathname.startsWith(href)}
            >
              <Link className="text-muted-foreground" href={href}>
                <Icon />
                <span>{label}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function ThreadLinks({ threads, pathname }: { threads: ThreadRef[]; pathname: string }) {
  return (
    <SidebarMenuSub>
      {threads.slice(0, 30).map((t) => (
        <SidebarMenuSubItem key={t.id}>
          <SidebarMenuSubButton asChild isActive={pathname === t.url}>
            <Link href={t.url} title={t.title}>
              <span className="truncate">{t.title}</span>
              {t.others ? (
                <span className="text-muted-foreground ml-auto shrink-0 text-[10px]">+{t.others}</span>
              ) : null}
            </Link>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

function Group({
  id,
  label,
  sub,
  count,
  threads,
  pathname,
  open,
  onToggle,
  tip,
}: {
  id: string;
  label: string;
  sub?: string;
  count: number;
  threads: ThreadRef[];
  pathname: string;
  open: boolean;
  onToggle: (id: string) => void;
  tip: string;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={() => onToggle(id)} data-tip-title={label} data-tip={tip}>
        <ChevronRight className={`transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="truncate">{label}</span>
        {sub && <span className="text-muted-foreground shrink-0 text-[11px]">{sub}</span>}
      </SidebarMenuButton>
      <SidebarMenuBadge>{count}</SidebarMenuBadge>
      {open && <ThreadLinks threads={threads} pathname={pathname} />}
    </SidebarMenuItem>
  );
}

export function TickerChatGroups() {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { data, error } = useQuery({
    queryKey: ["stock-story", "tickers"],
    queryFn: () => deskGet<SidebarTickers>("/api/tickers"),
    refetchInterval: 60_000,
  });
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const groups = useMemo(() => {
    const all = data?.groups ?? [];
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(
      (g) =>
        g.name.toLowerCase().includes(s) ||
        g.code.includes(s) ||
        g.threads.some((t) => t.title.toLowerCase().includes(s)),
    );
  }, [data, q]);

  return (
    <SidebarGroup data-tip-title="按股票分类的对话" data-tip="你聊过的每只股票一组。一次对话提到几只股票，就会出现在几个组里（右边的 +数字 表示还提到了几只别的）。点股票名展开。">
      <SidebarGroupLabel>按股票查看对话</SidebarGroupLabel>
      <div className="relative px-2 pb-2">
        <Search className="text-muted-foreground pointer-events-none absolute top-2 left-4 size-3.5" />
        <SidebarInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜股票名、代码"
          className="h-7 pl-7 text-xs"
          data-tip-title="搜索"
          data-tip="输入股票名或代码（如 茅台、600519），只显示相关的对话。"
        />
      </div>
      <SidebarGroupContent>
        <SidebarMenu>
          {error && (
            <div className="text-muted-foreground px-3 py-2 text-xs">
              投研数据服务未运行（desk start 会自动启动它）
            </div>
          )}
          {groups.map((g) => (
            <Group
              key={g.code}
              id={g.code}
              label={`${g.watch ? "⭐ " : ""}${g.name ? g.name : displayCode(g.code)}`}
              sub={displayCode(g.code)}
              count={g.threads.length}
              threads={g.threads}
              pathname={pathname}
              open={!!open[g.code] || (q.length > 0 && groups.length <= 5)}
              onToggle={toggle}
              tip={`所有提到「${g.name ? g.name : g.code}」的对话${g.reports ? `，另有 ${g.reports} 份研报在研报中心` : ""}。`}
            />
          ))}
          {!!data?.multi.length && (
            <Group id="__multi" label="多标的研究" count={data.multi.length} threads={data.multi} pathname={pathname}
              open={!!open.__multi} onToggle={toggle} tip="一次提到 4 只以上股票的对话，比如行业对比、前十大股票研究。" />
          )}
          {!!data?.scheduled.length && (
            <Group id="__sched" label="定时任务产出" count={data.scheduled.length} threads={data.scheduled} pathname={pathname}
              open={!!open.__sched} onToggle={toggle} tip="定时任务自动跑出来的对话，比如每天的盘前简报。" />
          )}
          {!!data?.untagged.length && (
            <Group id="__other" label="其他对话" count={data.untagged.length} threads={data.untagged} pathname={pathname}
              open={!!open.__other} onToggle={toggle} tip="没有提到具体股票的对话。" />
          )}
          {data && !data.groups.length && !data.untagged.length && (
            <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-xs">
              <Layers className="size-3.5" /> 还没有对话，点“新对话”开始
            </div>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
