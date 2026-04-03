import { selectPrimaryView, type ShellState } from "./shell-state";

export function openAgentCreationFromSidebar(shellState: ShellState, runtimeId: string | null) {
  return {
    shellState: selectPrimaryView(shellState, "runtimes"),
    primaryView: "runtimes" as const,
    runtimeId
  };
}

export function openAgentCreationFromRuntimeMenu(shellState: ShellState, runtimeId: string | null) {
  return openAgentCreationFromSidebar(shellState, runtimeId);
}
