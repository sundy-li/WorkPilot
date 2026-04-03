import { describe, expect, test } from "bun:test";
import {
  clearSelection,
  createSelectionState,
  toggleMessageSelection,
  type MessageSelectionState
} from "./message-selection";

describe("message selection", () => {
  test("starts multi-select mode from a right-clicked message", () => {
    const state = createSelectionState("msg_1");

    expect(state).toEqual({
      isMultiSelectMode: true,
      selectedIds: ["msg_1"]
    });
  });

  test("toggles messages in multi-select mode", () => {
    const initial: MessageSelectionState = {
      isMultiSelectMode: true,
      selectedIds: ["msg_1"]
    };

    expect(toggleMessageSelection(initial, "msg_2")).toEqual({
      isMultiSelectMode: true,
      selectedIds: ["msg_1", "msg_2"]
    });

    expect(toggleMessageSelection(initial, "msg_1")).toEqual({
      isMultiSelectMode: false,
      selectedIds: []
    });
  });

  test("clears all selection state", () => {
    const initial: MessageSelectionState = {
      isMultiSelectMode: true,
      selectedIds: ["msg_1", "msg_2"]
    };

    expect(clearSelection(initial)).toEqual({
      isMultiSelectMode: false,
      selectedIds: []
    });
  });
});
