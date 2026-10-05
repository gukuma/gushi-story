"use client";

import { Suspense } from "react";

import { StockPage } from "@/components/workspace/stock-story/stock-page";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";

// 股票页: /workspace/stocks?code=sh600519 — opened from search or any stock chip.
export default function StocksPage() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <Suspense>
          <StockPage />
        </Suspense>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
