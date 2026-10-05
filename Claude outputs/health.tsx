"use client";

// 系统状态 — everything a non-technical person needs to know "is it working?": services, quote
// feeds, API keys, automations, storage, backups, token usage; one-click restart/backup; alert and
// notification settings.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArchiveRestore,
  Bell,
  CheckCircle2,
  CircleAlert,
  Cpu,
  Gauge,
  HardDrive,
  KeyRound,
  RefreshCw,
  RotateCw,
  Server,
  Settings2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  APP_NAME,
  deskGet,
  deskPost,
  fmtTokens,
  relTime,
  type DeskSettings,
  type Health,
  type Usage,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import { CANVAS, Empty, IconWell, inputCls, Panel, PanelTitle, PillButton, Skeleton, SKY } from "./ui";

const GROUP_ICON: Record<string, LucideIcon> = { 服务: Server, 行情: Activity, 密钥: KeyRound, 自动研究: Zap, 存储: HardDrive };

function Checks({ h }: { h: Health }) {
  const groups = [...new Set(h.checks.map((c) => c.group))];
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((g) => {
        const Icon = GROUP_ICON[g] ?? Gauge;
        const items = h.checks.filter((c) => c.group === g);
        const bad = items.filter((c) => !c.ok).length;
        return (
          <Panel key={g}>
            <PanelTitle icon={Icon} sub={bad ? `${bad} 项需要处理` : "全部正常"}>{g}</PanelTitle>
            <ul className="space-y-1.5">
              {items.map((c) => (
                <li key={c.name} className={cn("rounded-2xl px-3 py-2 text-sm", c.ok ? "bg-[#f4f4f0] dark:bg-white/5" : "bg-red-50 dark:bg-red-500/10")}>
                  <div className="flex items-center gap-2">
                    {c.ok ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="size-4 shrink-0 text-red-600" />}
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="text-muted-foreground max-w-[50%] truncate text-xs" title={c.detail}>{c.detail}{c.ms ? ` · ${c.ms}ms` : ""}</span>
                  </div>
                  {!c.ok && c.fix && <div className="mt-1 pl-6 text-xs text-red-800 dark:text-red-200">怎么办：{c.fix}</div>}
                </li>
              ))}
            </ul>
          </Panel>
        );
      })}
    </div>
  );
}

function UsagePanel() {
  const { data } = useQuery({ queryKey: ["stock-story", "usage"], queryFn: () => deskGet<Usage>("/api/usage?days=30") });
  if (!data) return <Skeleton className="h-64 rounded-[28px]" />;
  const max = Math.max(1, ...data.days.map((d) => d.tokens));
  return (
    <Panel data-tip-title="用量" data-tip="最近 30 天助手消耗的 token（大致对应费用）。每根柱子是一天。">
      <PanelTitle icon={Cpu} sub={`30 天：${fmtTokens(data.totals.tokens)} tokens · ${data.totals.runs} 次运行${data.totals.failed ? ` · ${data.totals.failed} 次失败` : ""}`}>用量</PanelTitle>
      <div className="flex h-32 items-end gap-[3px]">
        {data.days.map((d) => (
          <div key={d.day} className="group relative flex-1" title={`${d.day}：${fmtTokens(d.tokens)} tokens · ${d.runs} 次`}>
            <div className={cn("w-full rounded-t-md", d.failed ? "bg-red-300" : "bg-[#6aa6e8]")} style={{ height: `${Math.max(2, (d.tokens / max) * 120)}px` }} />
          </div>
        ))}
      </div>
      <div className="text-muted-foreground mt-1 flex justify-between text-[10px]"><span>{data.days[0]?.day.slice(5)}</span><span>今天</span></div>
      {data.models.length > 0 && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-muted-foreground text-left text-xs"><tr><th className="font-normal">模型</th><th className="text-right font-normal">次数</th><th className="text-right font-normal">输入</th><th className="text-right font-normal">输出</th></tr></thead>
          <tbody>
            {data.models.map((m) => (
              <tr key={m.model} className="border-t border-black/5 dark:border-white/10">
                <td className="py-1.5">{m.model}</td><td className="text-right">{m.runs}</td>
                <td className="text-right font-mono">{fmtTokens(m.input_tokens)}</td><td className="text-right font-mono">{fmtTokens(m.output_tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {data.recent_failures.length > 0 && (
        <div className="mt-4">
          <div className="text-muted-foreground mb-1 text-xs">最近失败</div>
          <ul className="space-y-1 text-xs">
            {data.recent_failures.slice(0, 5).map((f) => (
              <li key={f.run_id}><Link href={`/workspace/chats/${f.thread_id}`} className="block truncate rounded-xl bg-red-50 px-3 py-1.5 hover:underline dark:bg-red-500/10">{relTime(f.created_at)} · {f.error ?? f.status}</Link></li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}

function SettingsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["stock-story", "settings"], queryFn: () => deskGet<DeskSettings>("/api/settings") });
  const [pct, setPct] = useState("5");
  useEffect(() => {
    if (data) setPct(String(data.alert_pct));
  }, [data]);
  const save = async (changes: Partial<DeskSettings>) => {
    try {
      await deskPost("/api/settings", changes);
      void qc.invalidateQueries({ queryKey: ["stock-story"] });
      toast.success("已保存");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  if (!data) return <Skeleton className="h-64 rounded-[28px]" />;
  return (
    <Panel>
      <PanelTitle icon={Settings2}>提醒与备份</PanelTitle>
      <div className="space-y-4 text-sm">
        <label className="flex items-center gap-3" data-tip-title="新研报通知" data-tip="有新研报写好时，屏幕右上角弹出 Mac 通知。">
          <Bell className="size-4" /><span className="flex-1">新研报写好时通知我</span>
          <Switch checked={data.notify_reports} onCheckedChange={(v) => void save({ notify_reports: v })} />
        </label>
        <label className="flex items-center gap-3" data-tip-title="大幅波动通知" data-tip="交易时间里，自选股涨跌超过设定幅度时通知你（每只股票每天最多一次）。">
          <Activity className="size-4" /><span className="flex-1">自选股大幅波动时通知我</span>
          <Switch checked={data.notify_prices} onCheckedChange={(v) => void save({ notify_prices: v })} />
        </label>
        <div className="flex items-center gap-3">
          <Gauge className="size-4" /><span className="flex-1">“大幅波动”指涨跌超过</span>
          <input type="number" min={1} max={20} step={0.5} value={pct} onChange={(e) => setPct(e.target.value)}
            onBlur={() => Number(pct) !== data.alert_pct && void save({ alert_pct: Number(pct) })} className={cn(inputCls, "h-8 w-20 text-right")} />
          <span>%</span>
        </div>
        <div className="flex items-center gap-3">
          <ArchiveRestore className="size-4" /><span className="flex-1">每隔几天自动备份研报库</span>
          <select value={data.backup_days} onChange={(e) => void save({ backup_days: Number(e.target.value) })} className={cn(inputCls, "h-8 w-24")}>
            {[1, 3, 7, 14, 30].map((d) => <option key={d} value={d}>{d} 天</option>)}
          </select>
        </div>
        <PillButton icon={Bell} onClick={() => void deskPost<{ ok: boolean }>("/api/notify-test", {}).then((r) => toast[r.ok ? "success" : "error"](r.ok ? "已发送测试通知，看看屏幕右上角" : "只有在 Mac 上才能显示通知"))}>发一条测试通知</PillButton>
        <p className="text-muted-foreground text-xs">第一次收到通知时，macOS 可能会问是否允许“脚本编辑器”发通知，选“允许”。</p>
      </div>
    </Panel>
  );
}

export function HealthPage() {
  const { data, error, refetch, isFetching } = useQuery({ queryKey: ["stock-story", "health"], queryFn: () => deskGet<Health>("/api/health"), refetchInterval: 60_000 });
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    document.title = `系统状态 - ${APP_NAME}`;
  }, []);
  const restart = async () => {
    setRestarting(true);
    try {
      const r = await deskPost<{ message: string }>("/api/restart", {});
      toast.success(r.message);
      setTimeout(() => window.location.reload(), 75_000);
    } catch (e) {
      toast.error((e as Error).message);
      setRestarting(false);
    }
  };
  const backup = async () => {
    try {
      const r = await deskPost<{ file: string; files: number }>("/api/backup", {});
      toast.success(`已备份 ${r.files} 个文件到 ${r.file}`);
      void refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const bad = data?.checks.filter((c) => !c.ok).length ?? 0;
  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <IconWell icon={Gauge} className="bg-white" />
          <h1 className="mr-auto text-3xl font-light tracking-tight">系统<span className="font-semibold">状态</span></h1>
          <PillButton icon={RefreshCw} className={cn(isFetching && "[&_svg]:animate-spin")} onClick={() => void refetch()}>重新检查</PillButton>
          <PillButton icon={ArchiveRestore} onClick={() => void backup()} data-tip-title="立即备份" data-tip="把整个研报库（研报、笔记、项目、自选、预测）打包到 ~/MarketDesk-backups。API 密钥不会被备份。">立即备份</PillButton>
          <PillButton primary icon={RotateCw} disabled={restarting} onClick={() => void restart()} data-tip-title="重启" data-tip="出问题时先试这个：重启所有服务，大约 1 分钟后页面自动刷新。">{restarting ? "重启中，约 1 分钟…" : "重启全部服务"}</PillButton>
        </div>
        {error && <Empty icon={CircleAlert}>投研数据服务没有运行：{error.message}。在终端运行 desk restart。</Empty>}
        {data && (
          <div className={cn("flex items-center gap-3 rounded-[24px] px-5 py-4", bad ? "bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-100" : SKY.tile)}>
            {bad ? <CircleAlert className="size-6" /> : <CheckCircle2 className="size-6 text-emerald-600" />}
            <div className="flex-1">
              <div className="text-lg font-medium">{bad ? `${bad} 项需要处理` : "一切正常"}</div>
              <div className="text-sm opacity-80">运行模式：{data.system.mode === "dev" ? "开发模式（较慢）" : "快速模式"} · {data.system.reports} 份研报 · 研报库 {data.system.library_mb} MB · 上次备份 {data.system.backup.last ? relTime(data.system.backup.last) : "从未"}</div>
            </div>
          </div>
        )}
        {data ? <Checks h={data} /> : !error && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44 rounded-[28px]" />)}</div>}
        <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
          <UsagePanel />
          <SettingsPanel />
        </div>
        {data && (
          <p className="text-muted-foreground text-xs">
            程序位置 {data.system.repo} · 研报库 {data.system.library} · 备份在 {data.system.backup.dir} · Python {data.system.python} · {data.system.platform}
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
