export function getAppShellGridClass(input: { detailOpen: boolean; explorerVisible: boolean }) {
  const columns = input.detailOpen
    ? input.explorerVisible
      ? "xl:grid-cols-[68px_320px_minmax(0,1fr)_380px]"
      : "xl:grid-cols-[68px_minmax(0,1fr)_380px]"
    : input.explorerVisible
      ? "xl:grid-cols-[68px_320px_minmax(0,1fr)]"
      : "xl:grid-cols-[68px_minmax(0,1fr)]";

  return `grid min-h-0 w-full flex-1 gap-0 ${columns}`;
}

export function getChatPanelLayoutClasses() {
  return {
    shell: "flex h-full min-h-0 flex-col overflow-hidden",
    topChrome: "sticky top-0 z-20 shrink-0",
    header: "shrink-0",
    tabs: "shrink-0",
    content: "min-h-0 flex-1 overflow-hidden",
    scroller: "min-h-0 flex-1 overflow-y-auto",
    composer: "sticky bottom-0 z-20 shrink-0"
  };
}

export function getAgentWorkspaceLayoutClasses(mode: "chat" | "issues" | "profile") {
  const isChat = mode === "chat";

  return {
    viewport: isChat
      ? "min-h-0 flex-1 overflow-hidden px-2 py-3 lg:px-3 lg:py-4"
      : "min-h-0 flex-1 overflow-y-auto px-2 py-3 lg:px-3 lg:py-4",
    content: isChat ? "flex h-full min-h-0 flex-col gap-4" : "w-full space-y-4",
    chatPanel: "min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-neutral-200 bg-[var(--panel-elevated)] shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
  };
}
