export interface MessageSelectionState {
  isMultiSelectMode: boolean;
  selectedIds: string[];
}

export function createSelectionState(messageId: string): MessageSelectionState {
  return {
    isMultiSelectMode: true,
    selectedIds: [messageId]
  };
}

export function toggleMessageSelection(state: MessageSelectionState, messageId: string): MessageSelectionState {
  const selected = state.selectedIds.includes(messageId);

  if (selected) {
    const selectedIds = state.selectedIds.filter((id) => id !== messageId);

    return {
      isMultiSelectMode: selectedIds.length > 0,
      selectedIds
    };
  }

  return {
    isMultiSelectMode: true,
    selectedIds: [...state.selectedIds, messageId]
  };
}

export function clearSelection(_state: MessageSelectionState): MessageSelectionState {
  return {
    isMultiSelectMode: false,
    selectedIds: []
  };
}
