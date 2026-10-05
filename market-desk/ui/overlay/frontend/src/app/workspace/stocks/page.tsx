"use client";

import { Suspense } from "react";

import { StockPage } from "@/components/workspace/stock-story/stock-page";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";

// 股票页: /workspace/stocks?code=sh600519 — opened from search or any stock chip.
export default function StocksPage() {
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <ClientGate label="正在打开股票…">
          <Suspense>
            <StockPage />
          </Suspense>
        </ClientGate>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
