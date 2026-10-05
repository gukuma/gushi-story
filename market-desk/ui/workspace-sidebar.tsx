"use client";

// 📈 股市故事 sidebar: 新研究 / 搜索, then the information levels 今日 · 研报 · 项目 · 对话, unread
// reports, recent chats, automation status, tutorial, settings. Also mounts the chat context bar.
// (Original DeerFlow sidebar is backed up by apply_ui.py.)

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

import { HealthGuard } from "./stock-story/health-guard";
import { NavProgress } from "./stock-story/nav-progress";
import { ChatContextBar, SidebarStatus, StockNav, TickerChatGroups } from "./stock-story/stock-sidebar";
import { TutorialLayer, TutorialToggle } from "./stock-story/tutorial";
import { SafeBoundary } from "./stock-story/ui";
import { ThreadDeleteDialogProvider } from "./thread-delete-dialog";
import { WorkspaceHeader } from "./workspace-header";
import { WorkspaceNavMenu } from "./workspace-nav-menu";

export function WorkspaceSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { open: isSidebarOpen } = useSidebar();
  return (
    <ThreadDeleteDialogProvider>
      <Sidebar variant="sidebar" collapsible="icon" {...props}>
        <SidebarHeader className="py-0">
          <WorkspaceHeader />
        </SidebarHeader>
        <SidebarContent>
          <SafeBoundary label="导航"><StockNav /></SafeBoundary>
          {isSidebarOpen && <SafeBoundary label="未读研报和最近对话"><TickerChatGroups /></SafeBoundary>}
        </SidebarContent>
        <SidebarFooter>
          <SafeBoundary label="状态"><SidebarStatus /></SafeBoundary>
          <TutorialToggle />
          <WorkspaceNavMenu />
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <TutorialLayer />
      <SafeBoundary label="本对话"><ChatContextBar /></SafeBoundary>
      <NavProgress />
      <HealthGuard />
    </ThreadDeleteDialogProvider>
  );
}
