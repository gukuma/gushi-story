"use client";

import { Suspense } from "react";

import { ProjectsPage } from "@/components/workspace/stock-story/projects";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";

// 项目 (themes holding reports + conversations). DeerFlow's own /workspace/projects is left untouched.
export default function ThemesPage() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <ClientGate label="正在打开项目…">
          <Suspense>
            <ProjectsPage />
          </Suspense>
        </ClientGate>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
