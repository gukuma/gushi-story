"use client";

// 定时任务 — redesigned for non-technical use: one card per task ("每个工作日 08:45，市场分析师写盘前简报"),
// big run / pause buttons, and a plain-language editor (每天 / 工作日 / 每周 / 每月 / 每隔 / 只一次).

import { useQuery } from "@tanstack/react-query";
import {
  BellRing,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Clock,
  History,
  Loader2,
  MessageSquare,
  Pause,
  PencilLine,
  Play,
  Plus,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAgents } from "@/core/agents/hooks";
import { fetchScheduledTaskRuns } from "@/core/scheduled-tasks/api";
import {
  utcToZonedLocalInput,
  validZonedLocalToUtcIso,
} from "@/core/scheduled-tasks/cron";
import {
  useCreateScheduledTask,
  useDeleteScheduledTask,
  usePauseScheduledTask,
  useResumeScheduledTask,
  useScheduledTasks,
  useTriggerScheduledTask,
  useUpdateScheduledTask,
} from "@/core/scheduled-tasks/hooks";
import type { ScheduledTask } from "@/core/scheduled-tasks/types";
import {
  APP_NAME,
  DEFAULT_AGENT,
  describeCron,
  relTime,
} from "@/core/stock-story/api";
import { cn } from "@/lib/utils";

import {
  CANVAS,
  Chip,
  Empty,
  IconWell,
  inputCls,
  MINT,
  Panel,
  PEACH,
  PillButton,
  RoundButton,
  Skeleton,
  STONE,
  textareaCls,
} from "./ui";

/* ------------------------------------------------------------------ schedule form model */
type Freq = "daily" | "weekdays" | "weekly" | "monthly" | "interval" | "once";
type Form = {
  title: string;
  agent: string;
  prompt: string;
  freq: Freq;
  time: string;
  days: number[];
  dom: number;
  everyN: number;
  everyUnit: "minutes" | "hours";
  runAt: string;
  timezone: string;
  reuse: boolean;
};
const FREQS: Array<[Freq, string]> = [
  ["weekdays", "工作日"],
  ["daily", "每天"],
  ["weekly", "每周"],
  ["monthly", "每月"],
  ["interval", "每隔一段时间"],
  ["once", "只一次"],
];
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const TZS: Array<[string, string]> = [
  ["Asia/Shanghai", "北京时间"],
  ["Asia/Hong_Kong", "香港时间"],
  ["Asia/Phnom_Penh", "金边时间"],
  ["Europe/Amsterdam", "阿姆斯特丹时间"],
  ["America/New_York", "纽约时间"],
];
const PROMPTS: Array<[string, string]> = [
  [
    "盘前简报",
    "使用 daily-market-brief-zh 技能，盘前模式。先检查A股今天是否开市；休市则写休市简报。保存到研究库，最后回复一句话摘要和文件路径。",
  ],
  [
    "收盘复盘",
    "使用 daily-market-brief-zh 技能，为今天的A股交易写收盘复盘，记录 1–3 条预测，保存到研究库。",
  ],
  [
    "公告扫描",
    "使用 announcement-watch-zh 技能，扫描自选股今天发布的公告，按重要性分级，保存公告速览到研究库。",
  ],
  [
    "催化剂日历",
    "使用 catalyst-calendar-zh 技能，更新 /mnt/library/calendar.md，并写本周催化剂日历研报。",
  ],
  [
    "宏观周报",
    "使用 weekly-macro-review-zh 技能复盘刚结束的一周；到期预测用 propose 提出结果（不要 resolve）。",
  ],
  [
    "投资逻辑周检",
    "使用 thesis-tracker-zh 技能的周检：更新每只自选股的投资逻辑文件，并写汇总研报。",
  ],
  [
    "自选股深度",
    "挑选最近一份深度研报最旧的自选股，用 ashare-equity-research-zh 技能按完整流程写个股深度，并更新投资逻辑文件。",
  ],
  [
    "周度审稿",
    "使用 report-review-zh 技能审本周新增的研报，并为到期预测提出验证结果（propose）。",
  ],
];

function emptyForm(): Form {
  return {
    title: "",
    agent: DEFAULT_AGENT,
    prompt: "",
    freq: "weekdays",
    time: "08:45",
    days: [1],
    dom: 1,
    everyN: 2,
    everyUnit: "hours",
    runAt: "",
    timezone: "Asia/Shanghai",
    reuse: false,
  };
}

function formFromTask(t: ScheduledTask): Form {
  const f = {
    ...emptyForm(),
    title: t.title,
    agent: t.assistant_id ?? DEFAULT_AGENT,
    prompt: t.prompt,
    timezone: t.timezone || "Asia/Shanghai",
    reuse: t.context_mode === "reuse_thread",
  };
  const spec = t.schedule_spec as {
    cron?: string;
    run_at?: string;
    every_seconds?: number;
  };
  if (t.schedule_type === "interval" && spec.every_seconds) {
    const h = spec.every_seconds % 3600 === 0;
    return {
      ...f,
      freq: "interval",
      everyUnit: h ? "hours" : "minutes",
      everyN: h
        ? spec.every_seconds / 3600
        : Math.round(spec.every_seconds / 60),
    };
  }
  if (t.schedule_type === "once" && spec.run_at)
    return {
      ...f,
      freq: "once",
      runAt: utcToZonedLocalInput(spec.run_at, f.timezone),
    };
  const parts = (spec.cron ?? "").trim().split(/\s+/);
  if (parts.length === 5) {
    const [m, h, dom, , dow] = parts as [
      string,
      string,
      string,
      string,
      string,
    ];
    const time =
      /^\d+$/.test(m) && /^\d+$/.test(h)
        ? `${h.padStart(2, "0")}:${m.padStart(2, "0")}`
        : f.time;
    if (dom !== "*" && /^\d+$/.test(dom))
      return { ...f, freq: "monthly", time, dom: Number(dom) };
    if (dow === "*") return { ...f, freq: "daily", time };
    if (dow === "1-5") return { ...f, freq: "weekdays", time };
    if (/^[0-7](,[0-7])*$/.test(dow))
      return {
        ...f,
        freq: "weekly",
        time,
        days: dow.split(",").map((d) => Number(d) % 7),
      };
  }
  return f;
}

function toSchedule(f: Form):
  | {
      schedule_type: "cron" | "interval" | "once";
      schedule_spec: Record<string, unknown>;
    }
  | string {
  const [h, m] = f.time.split(":").map(Number);
  const hm = `${m ?? 0} ${h ?? 0}`;
  switch (f.freq) {
    case "daily":
      return { schedule_type: "cron", schedule_spec: { cron: `${hm} * * *` } };
    case "weekdays":
      return {
        schedule_type: "cron",
        schedule_spec: { cron: `${hm} * * 1-5` },
      };
    case "weekly":
      if (!f.days.length) return "请至少选一天";
      return {
        schedule_type: "cron",
        schedule_spec: { cron: `${hm} * * ${[...f.days].sort().join(",")}` },
      };
    case "monthly":
      return {
        schedule_type: "cron",
        schedule_spec: {
          cron: `${hm} ${Math.min(28, Math.max(1, f.dom))} * *`,
        },
      };
    case "interval": {
      const s = f.everyN * (f.everyUnit === "hours" ? 3600 : 60);
      if (s < 300) return "间隔至少 5 分钟";
      return { schedule_type: "interval", schedule_spec: { every_seconds: s } };
    }
    case "once": {
      const iso = f.runAt ? validZonedLocalToUtcIso(f.runAt, f.timezone) : null;
      if (!iso) return "请选择运行的日期和时间";
      return { schedule_type: "once", schedule_spec: { run_at: iso } };
    }
  }
}

function describeForm(f: Form, agentName: string) {
  const tz = TZS.find(([k]) => k === f.timezone)?.[1] ?? f.timezone;
  const when =
    f.freq === "daily"
      ? `每天 ${f.time}`
      : f.freq === "weekdays"
        ? `每个工作日 ${f.time}`
        : f.freq === "weekly"
          ? `每周${
              [...f.days]
                .sort()
                .map((d) => WD[d])
                .join("、") || "（未选）"
            } ${f.time}`
          : f.freq === "monthly"
            ? `每月 ${f.dom} 号 ${f.time}`
            : f.freq === "interval"
              ? `每隔 ${f.everyN} ${f.everyUnit === "hours" ? "小时" : "分钟"}`
              : f.runAt
                ? `${f.runAt.replace("T", " ")} 运行一次`
                : "只运行一次";
  return `${when}（${tz}），由「${agentName}」执行`;
}

/* ------------------------------------------------------------------ editor */
function Editor({
  task,
  open,
  onOpenChange,
}: {
  task: ScheduledTask | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { agents } = useAgents();
  const create = useCreateScheduledTask();
  const update = useUpdateScheduledTask(task?.id ?? "");
  const del = useDeleteScheduledTask();
  const [f, setF] = useState<Form>(emptyForm());
  useEffect(() => {
    if (open) setF(task ? formFromTask(task) : emptyForm());
  }, [open, task]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((x) => ({ ...x, [k]: v }));
  const agentList = agents ?? [];
  const agentName =
    agentList.find((a) => a.name === f.agent)?.display_name ?? f.agent;
  const save = async () => {
    if (!f.title.trim() || !f.prompt.trim())
      return toast.error("请填写名称和要做的事");
    const sch = toSchedule(f);
    if (typeof sch === "string") return toast.error(sch);
    const base = {
      title: f.title.trim(),
      prompt: f.prompt.trim(),
      assistant_id: f.agent,
      timezone: f.timezone,
      context_mode: f.reuse
        ? ("reuse_thread" as const)
        : ("fresh_thread_per_run" as const),
    };
    try {
      if (task?.schedule_type === sch.schedule_type) {
        await update.mutateAsync({ ...base, schedule_spec: sch.schedule_spec });
      } else {
        await create.mutateAsync({ ...base, ...sch, thread_id: null });
        if (task) await del.mutateAsync(task.id); // the schedule kind changed: replace the task
      }
      toast.success("已保存");
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const busy = create.isPending || update.isPending;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl">
            <CalendarClock className="size-5" />
            {task ? "修改定时任务" : "新建定时任务"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5 px-4 pb-8">
          <Field n={1} label="名称">
            <input
              value={f.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="如：盘前简报"
              className={inputCls}
            />
          </Field>
          <Field n={2} label="由哪个助手来做">
            <div className="flex flex-wrap gap-2">
              {agentList.map((a) => (
                <Chip
                  key={a.name}
                  active={f.agent === a.name}
                  onClick={() => set("agent", a.name)}
                >
                  <Bot className="size-3.5" />
                  {a.display_name ?? a.name}
                </Chip>
              ))}
              {!agentList.length && (
                <span className="text-muted-foreground text-sm">{f.agent}</span>
              )}
            </div>
          </Field>
          <Field
            n={3}
            label="要做什么"
            hint="用中文写清楚要助手做的事。可以先点一个现成的内容再改。"
          >
            <div className="mb-2 flex flex-wrap gap-1.5">
              {PROMPTS.map(([l, p]) => (
                <Chip
                  key={l}
                  className="px-2.5 py-0.5 text-xs"
                  onClick={() =>
                    setF((x) => ({ ...x, prompt: p, title: x.title || l }))
                  }
                >
                  {l}
                </Chip>
              ))}
            </div>
            <textarea
              value={f.prompt}
              onChange={(e) => set("prompt", e.target.value)}
              rows={6}
              className={textareaCls}
              placeholder="比如：请写今天的盘前简报，保存到研报库。"
            />
          </Field>
          <Field n={4} label="什么时候运行">
            <div className="flex flex-wrap gap-2">
              {FREQS.map(([k, l]) => (
                <Chip
                  key={k}
                  active={f.freq === k}
                  onClick={() => set("freq", k)}
                >
                  {l}
                </Chip>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {f.freq === "weekly" && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        set(
                          "days",
                          f.days.includes(d)
                            ? f.days.filter((x) => x !== d)
                            : [...f.days, d],
                        )
                      }
                      className={cn(
                        "grid size-9 place-items-center rounded-[4px] text-sm",
                        f.days.includes(d)
                          ? "bg-[var(--ss-ink)] text-[var(--ss-ink-fg)]"
                          : "bg-[var(--ss-sunken)]",
                      )}
                    >
                      {WD[d]}
                    </button>
                  ))}
                </div>
              )}
              {f.freq === "monthly" && (
                <label className="flex items-center gap-2 text-sm">
                  每月
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={f.dom}
                    onChange={(e) => set("dom", Number(e.target.value))}
                    className={cn(inputCls, "h-9 w-20")}
                  />
                  号
                </label>
              )}
              {f.freq === "interval" ? (
                <label className="flex items-center gap-2 text-sm">
                  每隔
                  <input
                    type="number"
                    min={1}
                    value={f.everyN}
                    onChange={(e) => set("everyN", Number(e.target.value))}
                    className={cn(inputCls, "h-9 w-20")}
                  />
                  <select
                    value={f.everyUnit}
                    onChange={(e) =>
                      set("everyUnit", e.target.value as Form["everyUnit"])
                    }
                    className={cn(inputCls, "h-9 w-24")}
                  >
                    <option value="minutes">分钟</option>
                    <option value="hours">小时</option>
                  </select>
                </label>
              ) : f.freq === "once" ? (
                <input
                  type="datetime-local"
                  value={f.runAt}
                  onChange={(e) => set("runAt", e.target.value)}
                  className={cn(inputCls, "h-9 w-60")}
                />
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <Clock className="size-4" />
                  <input
                    type="time"
                    value={f.time}
                    onChange={(e) => set("time", e.target.value)}
                    className={cn(inputCls, "h-9 w-32")}
                  />
                </label>
              )}
              <select
                value={f.timezone}
                onChange={(e) => set("timezone", e.target.value)}
                className={cn(inputCls, "h-9 w-40")}
              >
                {TZS.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field n={5} label="每次运行">
            <div className="flex flex-wrap gap-2">
              <Chip active={!f.reuse} onClick={() => set("reuse", false)}>
                开一个新对话（推荐）
              </Chip>
              <Chip active={f.reuse} onClick={() => set("reuse", true)}>
                接着同一个对话
              </Chip>
            </div>
          </Field>
          <div className={cn("rounded-[6px] px-4 py-3 text-sm", MINT.tile)}>
            <div className="text-muted-foreground text-xs">预览</div>
            <div className="mt-0.5 font-medium">
              {describeForm(f, agentName)}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => onOpenChange(false)}>取消</PillButton>
            <PillButton
              primary
              icon={busy ? Loader2 : CheckCircle2}
              disabled={busy}
              className={busy ? "[&_svg]:animate-spin" : ""}
              onClick={() => void save()}
            >
              保存
            </PillButton>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  n,
  label,
  hint,
  children,
}: {
  n: number;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-[4px] bg-[var(--ss-ink)] text-xs text-[var(--ss-ink-fg)]">
          {n}
        </span>
        <span className="font-medium">{label}</span>
      </div>
      {hint && <p className="text-muted-foreground mb-2 text-xs">{hint}</p>}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ run history */
function HistorySheet({
  task,
  onClose,
}: {
  task: ScheduledTask | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["scheduled-tasks", "runs", task?.id],
    queryFn: () => fetchScheduledTaskRuns(task!.id, { limit: 30, offset: 0 }),
    enabled: !!task,
  });
  const ICON = {
    success: CheckCircle2,
    failed: XCircle,
    interrupted: XCircle,
    running: Loader2,
    launching: Loader2,
    queued: Clock,
    unmet: CircleAlert,
    skipped: CircleAlert,
  } as const;
  const LABEL: Record<string, string> = {
    success: "成功",
    failed: "失败",
    interrupted: "中断",
    running: "运行中",
    launching: "启动中",
    queued: "排队中",
    unmet: "条件未满足",
    skipped: "跳过",
  };
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-5" />
            运行记录 · {task?.title}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-2 px-4 pb-8">
          {isLoading &&
            [0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}
          {data && !data.length && (
            <Empty icon={History}>还没有运行过。点“立即运行”试一次。</Empty>
          )}
          {(data ?? []).map((r) => {
            const Icon = ICON[r.status] ?? Clock;
            const ok = r.status === "success";
            return (
              <Link
                key={r.id}
                href={`/workspace/chats/${r.thread_id}`}
                className={cn(
                  "flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-sm hover:opacity-90",
                  ok
                    ? "bg-[var(--ss-sunken)]"
                    : r.status === "failed"
                      ? "bg-[var(--ss-up-soft)]"
                      : STONE.tile,
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    ok && "text-[var(--ss-down)]",
                    r.status === "failed" && "text-[var(--ss-up)]",
                    (r.status === "running" || r.status === "launching") &&
                      "animate-spin",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div>
                    {LABEL[r.status] ?? r.status}
                    {r.trigger === "manual" ? " · 手动运行" : ""}
                  </div>
                  {r.error && (
                    <div className="truncate text-xs text-[var(--ss-up)]">
                      {r.error}
                    </div>
                  )}
                </div>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {relTime(r.started_at ?? r.scheduled_for)}
                </span>
                <MessageSquare className="text-muted-foreground size-3.5" />
              </Link>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ page */
function TaskCard({
  t,
  agentName,
  onEdit,
  onHistory,
  onDelete,
}: {
  t: ScheduledTask;
  agentName: string;
  onEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  const pause = usePauseScheduledTask();
  const resume = useResumeScheduledTask();
  const trigger = useTriggerScheduledTask();
  const on = t.status === "enabled" || t.status === "running";
  const failed = !!t.last_error && t.status !== "paused";
  const tone = failed ? "bg-[var(--ss-up-soft)]" : on ? MINT.tile : STONE.tile;
  return (
    <div className={cn("flex flex-col gap-3 rounded-[6px] p-5", tone)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-[4px]",
            on ? MINT.dot : STONE.dot,
          )}
        >
          {t.status === "running" ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <BellRing className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-lg leading-tight font-semibold">{t.title}</div>
          <div className="text-muted-foreground mt-0.5 text-sm">
            {describeCron(t.schedule_spec, t.schedule_type)} · {agentName}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-[4px] px-2.5 py-1 text-xs",
            on
              ? "bg-[var(--ss-panel)] text-[var(--ss-down)]"
              : "bg-[var(--ss-panel)]",
          )}
        >
          {t.status === "running"
            ? "运行中"
            : on
              ? "运行中 ✓"
              : t.status === "paused"
                ? "已暂停"
                : t.status === "completed"
                  ? "已完成"
                  : t.status}
        </span>
      </div>
      <p className="text-muted-foreground line-clamp-2 text-sm">{t.prompt}</p>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-[4px] bg-[var(--ss-panel)] px-3 py-2">
          <div className="text-muted-foreground">下次运行</div>
          <div className="font-medium">
            {on && t.next_run_at
              ? new Date(t.next_run_at).toLocaleString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                  weekday: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "—"}
          </div>
        </div>
        <div className="rounded-[4px] bg-[var(--ss-panel)] px-3 py-2">
          <div className="text-muted-foreground">上次运行</div>
          <div className="font-medium">
            {t.last_run_at ? relTime(t.last_run_at) : "还没有"}
          </div>
        </div>
        <div className="rounded-[4px] bg-[var(--ss-panel)] px-3 py-2">
          <div className="text-muted-foreground">已运行</div>
          <div className="font-medium">{t.run_count} 次</div>
        </div>
      </div>
      {failed && (
        <div className="rounded-[4px] bg-[var(--ss-panel)] px-3 py-2 text-xs text-[var(--ss-up)]">
          上次失败：{t.last_error}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <PillButton
          primary
          icon={Play}
          disabled={trigger.isPending}
          onClick={() =>
            trigger.mutate(t.id, {
              onSuccess: () =>
                toast.success(`「${t.title}」已开始运行，几分钟后在研报里查看`),
            })
          }
        >
          立即运行
        </PillButton>
        <PillButton
          icon={on ? Pause : Play}
          className="bg-[var(--ss-panel)]"
          onClick={() => (on ? pause.mutate(t.id) : resume.mutate(t.id))}
        >
          {on ? "暂停" : "恢复"}
        </PillButton>
        {t.last_thread_id && (
          <Link
            href={`/workspace/chats/${t.last_thread_id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-[4px] bg-[var(--ss-panel)] px-4 text-sm"
          >
            <MessageSquare className="size-4" />
            上次结果
          </Link>
        )}
        <div className="ml-auto flex gap-1.5">
          <RoundButton
            icon={History}
            label="运行记录"
            className="bg-[var(--ss-panel)]"
            onClick={onHistory}
          />
          <RoundButton
            icon={PencilLine}
            label="修改"
            className="bg-[var(--ss-panel)]"
            onClick={onEdit}
          />
          <RoundButton
            icon={Trash2}
            label="删除"
            className="bg-[var(--ss-panel)] hover:text-[var(--ss-up)]"
            onClick={onDelete}
          />
        </div>
      </div>
    </div>
  );
}

export function SchedulesPage() {
  const { data: tasks, error, isLoading } = useScheduledTasks();
  const { agents } = useAgents();
  const del = useDeleteScheduledTask();
  const resume = useResumeScheduledTask();
  const [edit, setEdit] = useState<{
    open: boolean;
    task: ScheduledTask | null;
  }>({ open: false, task: null });
  const [history, setHistory] = useState<ScheduledTask | null>(null);
  const [deleting, setDeleting] = useState<ScheduledTask | null>(null);
  useEffect(() => {
    document.title = `定时任务 - ${APP_NAME}`;
  }, []);
  const names = useMemo(
    () =>
      Object.fromEntries(
        (agents ?? []).map((a) => [a.name, a.display_name ?? a.name]),
      ),
    [agents],
  );
  const list = (tasks ?? [])
    .slice()
    .sort((a, b) => (a.next_run_at ?? "z").localeCompare(b.next_run_at ?? "z"));
  const paused = list.filter((t) => t.status === "paused");
  return (
    <ScrollArea className={cn("size-full", CANVAS)}>
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5 px-4 py-6 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <IconWell icon={CalendarClock} className="bg-[var(--ss-panel)]" />
          <div className="mr-auto">
            <h1 className="text-3xl font-normal tracking-tight">
              定时<span className="font-semibold">任务</span>
            </h1>
            <p className="text-muted-foreground text-sm">
              到点自动干活的助手。写好的研报会出现在“研报”收件箱里。
            </p>
          </div>
          {paused.length > 0 && (
            <PillButton
              icon={Play}
              onClick={() => paused.forEach((t) => resume.mutate(t.id))}
            >
              全部启用（{paused.length}）
            </PillButton>
          )}
          <PillButton
            primary
            icon={Plus}
            onClick={() => setEdit({ open: true, task: null })}
          >
            新建任务
          </PillButton>
        </div>
        {error && <Empty icon={CircleAlert}>{error.message}</Empty>}
        {isLoading && (
          <div className="grid gap-4 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-60 rounded-[6px]" />
            ))}
          </div>
        )}
        {tasks && !tasks.length && (
          <Panel className={PEACH.tile}>
            <Empty icon={CalendarClock}>
              还没有定时任务。点“新建任务”，或在终端运行 desk seed
              创建默认的简报任务。
            </Empty>
          </Panel>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((t) => (
            <TaskCard
              key={t.id}
              t={t}
              agentName={
                names[t.assistant_id ?? ""] ?? t.assistant_id ?? "默认助手"
              }
              onEdit={() => setEdit({ open: true, task: t })}
              onHistory={() => setHistory(t)}
              onDelete={() => setDeleting(t)}
            />
          ))}
        </div>
      </div>
      <Editor
        task={edit.task}
        open={edit.open}
        onOpenChange={(o) => setEdit((x) => ({ ...x, open: o }))}
      />
      <HistorySheet task={history} onClose={() => setHistory(null)} />
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="rounded-[6px] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5" /> 删除「{deleting?.title}」？
            </DialogTitle>
            <DialogDescription>
              任务会被删除，以后不再自动运行。它已经写好的研报不受影响。只想暂时停掉，可以用“暂停”。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <PillButton onClick={() => setDeleting(null)}>取消</PillButton>
            <PillButton
              primary
              icon={Trash2}
              className="bg-[var(--ss-up)] text-white"
              onClick={() =>
                deleting &&
                del.mutate(deleting.id, {
                  onSuccess: () => {
                    toast.success("已删除");
                    setDeleting(null);
                  },
                })
              }
            >
              删除
            </PillButton>
          </div>
        </DialogContent>
      </Dialog>
    </ScrollArea>
  );
}
