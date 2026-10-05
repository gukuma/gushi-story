import { redirect } from "next/navigation";

import { StockHome } from "@/components/workspace/stock-story/stock-home";
import { ClientGate } from "@/components/workspace/stock-story/ui";
import { WorkspaceBody, WorkspaceContainer } from "@/components/workspace/workspace-container";
import { DEMO_THREAD_IDS } from "@/core/threads/static-demo";
import { env } from "@/env";

import WorkspaceLayout from "./workspace/layout";

// 📈 股市故事: "/" is the dashboard itself (live stock cards, schedules, recent records),
// rendered inside the same workspace shell (sidebar, auth, providers) as every other page.
export const dynamic = "force-dynamic";

export default function RootPage() {
  if (env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true") {
    return redirect(`/workspace/chats/${DEMO_THREAD_IDS[0]}`);
  }
  return (
    <WorkspaceLayout>
      <WorkspaceContainer>
        <WorkspaceBody>
          <ClientGate label="正在准备今日简报…">
            <StockHome />
          </ClientGate>
        </WorkspaceBody>
      </WorkspaceContainer>
    </WorkspaceLayout>
  );
}
