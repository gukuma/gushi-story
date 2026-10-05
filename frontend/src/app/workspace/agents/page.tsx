"use client";

import { AgentsPage } from "@/components/workspace/stock-story/agents";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import {
  WorkspaceBody,
  WorkspaceContainer,
} from "@/components/workspace/workspace-container";

// 📈 股市故事 助手 (replaces DeerFlow's agent gallery; the original is kept in market-desk/ui/backup/).
export default function Page() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <ClientGate label="正在打开助手…">
          <AgentsPage />
        </ClientGate>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
