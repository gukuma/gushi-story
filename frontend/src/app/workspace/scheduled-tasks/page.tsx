"use client";

import { SchedulesPage } from "@/components/workspace/stock-story/schedules";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import {
  WorkspaceBody,
  WorkspaceContainer,
} from "@/components/workspace/workspace-container";

// 📈 股市故事 定时任务 (replaces DeerFlow's page; the original is kept in market-desk/ui/backup/).
export default function ScheduledTasksPage() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <ClientGate label="正在打开定时任务…">
          <SchedulesPage />
        </ClientGate>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
