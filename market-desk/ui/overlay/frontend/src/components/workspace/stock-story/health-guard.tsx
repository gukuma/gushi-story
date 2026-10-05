"use client";

// Watches the data service: if it is down or older than this UI, shows a thin banner with a
// one-click fix (self-restart), and refreshes all data once it is healthy again.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DESK, deskPost, REQUIRED_API } from "@/core/stock-story/api";

type V = { api: number; started: string } | "old" | "down";

async function probe(): Promise<V> {
  try {
    const r = await fetch(`${DESK}/api/version`, { cache: "no-store" });
    if (r.status === 404) return "old";
    if (!r.ok) return "down";
    const j = (await r.json()) as { api?: number; started?: string; error?: string };
    if (j.error) return "old"; // old servers answer unknown paths with {"error": "unknown path"}
    return { api: j.api ?? 0, started: j.started ?? "" };
  } catch {
    return "down";
  }
}

export function HealthGuard() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({ queryKey: ["stock-story-guard"], queryFn: probe, refetchInterval: (q) => (q.state.data && typeof q.state.data === "object" && q.state.data.api >= REQUIRED_API ? 60_000 : 5_000) });
  const lastStart = useRef<string | null>(null);
  const ok = !!data && typeof data === "object" && data.api >= REQUIRED_API;
  useEffect(() => {
    if (ok && typeof data === "object") {
      if (lastStart.current && lastStart.current !== data.started) void qc.invalidateQueries({ queryKey: ["stock-story"] });
      lastStart.current = data.started;
    }
  }, [ok, data, qc]);
  if (!data || ok) return null;
  const old = data === "old" || (typeof data === "object" && data.api < REQUIRED_API);
  const fix = async () => {
    setBusy(true);
    try {
      await deskPost("/api/self-restart", {});
      setTimeout(() => setBusy(false), 8000);
    } catch {
      // very old data services can't restart themselves: restart everything instead (~1–5 min)
      try {
        await deskPost("/api/restart", {});
      } catch {
        /* the banner explains the manual fix */
      }
      setTimeout(() => window.location.reload(), 90_000);
    }
  };
  return (
    <div className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-3 border-b border-[var(--ss-signal)] bg-[var(--ss-signal-soft)] px-4 py-2 text-sm text-[var(--ss-text)]">
      <CircleAlert className="size-4 shrink-0 text-[var(--ss-signal)]" />
      <span>
        {old ? "后台数据服务还是旧版本，部分数据可能显示不全。" : "后台数据服务没有响应，行情和研报暂时取不到（正在自动重试）。"}
        <span className="ml-1 text-[var(--ss-muted)]">如果一直这样，在终端运行 <code>bash market-desk/mac/deskctl.sh restart</code></span>
      </span>
      {old && (
        <button type="button" disabled={busy} onClick={() => void fix()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[4px] bg-[var(--ss-ink)] px-2.5 text-xs text-[var(--ss-ink-fg)] disabled:opacity-60">
          <RotateCw className={busy ? "size-3.5 animate-spin" : "size-3.5"} />{busy ? "正在重启…" : "立即修复"}
        </button>
      )}
    </div>
  );
}
