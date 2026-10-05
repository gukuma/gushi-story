"use client";

import { Suspense, useEffect } from "react";

import { ReportsCenter } from "@/components/workspace/stock-story/reports-center";
import { useTutorial } from "@/components/workspace/stock-story/tutorial";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";
import { APP_NAME } from "@/core/stock-story/api";

export default function ReportsPage() {
  const tutorial = useTutorial();
  useEffect(() => {
    document.title = `研报中心 - ${APP_NAME}`;
  }, []);
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        {tutorial && (
          <div className="w-full bg-amber-500/15 px-4 py-2 text-sm">
            💡 研报中心：左边每只股票一个文件夹（数字是研报数量），下面还有每日简报、周报等分类。点文件夹，右边按月份列出报告；点报告就能阅读。上方“预测记录”看助手过去的预测准不准。
          </div>
        )}
        <Suspense>
          <ReportsCenter />
        </Suspense>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
