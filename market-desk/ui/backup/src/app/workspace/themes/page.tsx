"use client";

import { Suspense } from "react";

import { ProjectsPage } from "@/components/workspace/stock-story/projects";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";

// 项目 (themes holding reports + conversations). DeerFlow's own /workspace/projects is left untouched.
export default function ThemesPage() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <Suspense>
          <ProjectsPage />
        </Suspense>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
