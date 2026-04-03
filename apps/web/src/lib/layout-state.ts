import type { PrimaryView } from "./shell-state";

export type DetailPanelKind = "message" | "issue" | "agent" | "runtime" | "account";

export interface DetailPanelState {
  isOpen: boolean;
  kind: DetailPanelKind | null;
  itemId: string | null;
}

interface OpenDetailPanelInput {
  kind: DetailPanelKind;
  itemId: string;
}

export function openDetailPanel(_current: DetailPanelState, input: OpenDetailPanelInput): DetailPanelState {
  return {
    isOpen: true,
    kind: input.kind,
    itemId: input.itemId
  };
}

export function closeDetailPanel(_current: DetailPanelState): DetailPanelState {
  return {
    isOpen: false,
    kind: null,
    itemId: null
  };
}

export function shouldShowExplorer(isExplorerOpen: boolean, primaryView: PrimaryView) {
  return isExplorerOpen && primaryView !== "kanban";
}
