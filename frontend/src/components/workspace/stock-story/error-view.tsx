"use client";

// Friendly error screen for 股市故事 pages (instead of the browser's "This page couldn't load").

import { CircleAlert, RotateCw } from "lucide-react";
import { useEffect } from "react";

export function ErrorView({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="ss-page flex size-full min-h-[60vh] items-center justify-center bg-[var(--ss-canvas)] p-6 text-[var(--ss-text)]">
      <div className="w-full max-w-lg rounded-[6px] border border-[var(--ss-line)] bg-[var(--ss-panel)] p-6">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <CircleAlert className="size-5 text-[var(--ss-up)]" />
          这个页面出了点问题
        </div>
        <p className="mt-2 text-sm text-[var(--ss-muted)]">
          通常是界面刚更新、后台数据服务还是旧版本。先点“重试”；不行的话，在终端运行
          <code className="mx-1 rounded-[3px] bg-[var(--ss-sunken)] px-1.5 py-0.5">
            bash market-desk/mac/deskctl.sh restart
          </code>
          ，约 1 分钟后刷新。
        </p>
        <pre className="mt-3 max-h-32 overflow-auto rounded-[4px] bg-[var(--ss-sunken)] p-3 text-xs whitespace-pre-wrap">
          {error.message}
        </pre>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-[var(--ss-ink)] px-3 text-sm text-[var(--ss-ink-fg)]"
          >
            <RotateCw className="size-3.5" />
            重试
          </button>
          <button
            type="button"
            onClick={() => window.location.assign("/")}
            className="inline-flex h-8 items-center rounded-[4px] border border-[var(--ss-line)] px-3 text-sm"
          >
            回到今日
          </button>
        </div>
      </div>
    </div>
  );
}
