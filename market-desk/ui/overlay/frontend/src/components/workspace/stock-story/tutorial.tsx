"use client";

// 教程模式：打开后，把鼠标放在任何东西上，就会出现一句最简单的中文说明：它是干什么的、怎么用。

import { GraduationCap } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- tiny global store
const KEY = "stock-story:tutorial";
const listeners = new Set<() => void>();
function read() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setTutorial(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode: state just won't persist */
  }
  listeners.forEach((l) => l());
}
export function useTutorial() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    read,
    () => false,
  );
}

// ---------------------------------------------------------------- what each thing means
type Tip = { title: string; body: string };

const ROUTE_TIPS: Array<[RegExp, Tip]> = [
  [/\/chats\/new$/, { title: "新对话", body: "开始一次新的提问。直接用中文问，比如“分析一下 600519 的估值”。" }],
  [/^\/(workspace)?$/, { title: "今日", body: "每天早上看这一页就够了：市场、昨天以来的新研报、你的自选股、需要你确认的事。" }],
  [/^\/workspace\/reports/, { title: "研报", body: "最常用的地方。所有研报按时间排成收件箱，红点是没读过的。看完可以收藏、归档、写笔记或追问。" }],
  [/^\/workspace\/themes/, { title: "项目", body: "一个研究主题，比如“银行 2026”。把相关的研报和对话放在一起，系统也会建议新项目。" }],
  [/^\/workspace\/stocks/, { title: "股票页", body: "一只股票的最新观点、价格估值，以及所有提到它的研报和对话。" }],
  [/^\/workspace\/health/, { title: "系统状态", body: "检查各部分是否正常、怎么修，一键重启和备份，设置提醒。" }],
  [/^\/workspace\/agents$/, { title: "助手", body: "研究助手列表：每个擅长什么、在哪些定时任务里用到，可以修改它们的工作方式。" }],
  [/^\/workspace\/scheduled-tasks/, { title: "定时任务", body: "到点自动干活的助手，比如每天早上写盘前简报。这里可以暂停、修改，或点“立即触发”马上跑一次。" }],
  [/^\/workspace\/keys/, { title: "API 密钥", body: "填写模型和搜索服务的密钥。没有密钥，助手就不能思考或上网查资料。填完点“保存并重启”。" }],
  [/^\/workspace\/chats$/, { title: "全部对话", body: "按时间列出你和助手的所有聊天记录。" }],
  [/\/chats\/[^/]+$/, { title: "对话", body: "点开可以继续之前的聊天。右上角的“本对话”可以归入项目、看它写出的研报、把回答存成研报。" }],
];

function tipFor(el: Element | null): { tip: Tip; target: Element } | null {
  for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
    const t = node.getAttribute("data-tip");
    if (t) {
      return { tip: { title: node.getAttribute("data-tip-title") ?? "", body: t }, target: node };
    }
    if (node instanceof HTMLAnchorElement) {
      const path = new URL(node.href, window.location.href).pathname;
      const hit = ROUTE_TIPS.find(([re]) => re.test(path));
      if (hit) return { tip: hit[1], target: node };
    }
    if (node instanceof HTMLTextAreaElement) {
      return {
        tip: { title: "输入框", body: "在这里打字提问。按回车发送，Shift+回车换行。可以提股票代码、公司名或者任何问题。" },
        target: node,
      };
    }
    if (node.getAttribute("data-sidebar") === "trigger") {
      return { tip: { title: "收起 / 展开侧边栏", body: "点一下把左边栏收起来，屏幕更宽；再点一下展开。" }, target: node };
    }
    if (node.tagName === "BUTTON") {
      const label = `${node.getAttribute("aria-label") ?? ""} ${node.textContent ?? ""}`;
      if (/发送|Send|submit/i.test(label) || node.getAttribute("type") === "submit") {
        return { tip: { title: "发送", body: "把你写的问题发给助手。它会自己查资料、取数据，再写出答案。" }, target: node };
      }
      if (/停止|Stop/i.test(label)) {
        return { tip: { title: "停止", body: "助手还在工作时，点这里让它停下。" }, target: node };
      }
      if (/设置|Settings/i.test(label)) {
        return { tip: { title: "设置", body: "调整界面、记忆等选项。一般不需要改。" }, target: node };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- overlay
export function TutorialLayer() {
  const on = useTutorial();
  const [state, setState] = useState<{ tip: Tip; rect: DOMRect; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!on) {
      setState(null);
      return;
    }
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const hit = tipFor(e.target as Element);
        setState(hit ? { tip: hit.tip, rect: hit.target.getBoundingClientRect(), x: e.clientX, y: e.clientY } : null);
      });
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setTutorial(false);
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("keydown", onKey);
    };
  }, [on]);

  if (!on || typeof document === "undefined") return null;
  const W = 300;
  const left = state ? Math.min(state.x + 16, window.innerWidth - W - 12) : 0;
  const below = state ? state.y + 140 < window.innerHeight : true;
  return createPortal(
    <>
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] -translate-x-1/2 rounded-[4px] bg-amber-500 px-4 py-1.5 text-sm font-medium text-white">
        教程模式：鼠标放到任何东西上看说明 · 按 Esc 关闭
      </div>
      {state && (
        <>
          <div
            className="pointer-events-none fixed z-[99] rounded-md ring-2 ring-amber-500 ring-offset-2"
            style={{ left: state.rect.left, top: state.rect.top, width: state.rect.width, height: state.rect.height }}
          />
          <div
            className="bg-popover text-popover-foreground pointer-events-none fixed z-[101] rounded-[4px] border p-3 text-sm shadow-xl"
            style={{ left, top: below ? state.y + 18 : undefined, bottom: below ? undefined : window.innerHeight - state.y + 18, width: W }}
          >
            {state.tip.title && <div className="mb-1 font-semibold">💡 {state.tip.title}</div>}
            <div className="text-muted-foreground leading-relaxed">{state.tip.body}</div>
          </div>
        </>
      )}
    </>,
    document.body,
  );
}

export function TutorialToggle() {
  const on = useTutorial();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          onClick={() => setTutorial(!on)}
          className={cn(on && "bg-amber-500/15 text-amber-700")}
          data-tip-title="教程模式"
          data-tip="打开后，鼠标放到任何按钮或区域上，就会告诉你它是做什么的。再点一次关闭。"
        >
          <GraduationCap />
          <span>{on ? "教程模式：开" : "教程模式"}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
