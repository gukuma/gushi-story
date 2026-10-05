"use client";

import { Suspense, useEffect } from "react";

import { ReportsCenter } from "@/components/workspace/stock-story/reports-center";
import { useTutorial } from "@/components/workspace/stock-story/tutorial";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";
import { APP_NAME } from "@/core/stock-story/api";

export default function ReportsPage() {
  const tutorial = useTutorial();
  useEffect(() => {
    document.title = `研报 - ${APP_NAME}`;
  }, []);
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        {tutorial && (
          <div className="w-full bg-amber-500/15 px-4 py-2 text-sm">
            💡 研报：左边是按时间排的收件箱（红点 = 未读），点一份在右边阅读：先看摘要，再看全文。看完可以收藏、归档、写笔记、追问或归入项目。
          </div>
        )}
        <ClientGate label="正在打开研报…">
          <Suspense>
            <ReportsCenter />
          </Suspense>
        </ClientGate>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
