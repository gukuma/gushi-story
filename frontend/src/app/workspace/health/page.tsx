"use client";

import { HealthPage } from "@/components/workspace/stock-story/health";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import {
  WorkspaceBody,
  WorkspaceContainer,
} from "@/components/workspace/workspace-container";

// 系统状态: services, quote feeds, keys, automations, storage, usage, alerts and backups.
export default function Page() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <ClientGate label="正在检查系统…">
          <HealthPage />
        </ClientGate>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
