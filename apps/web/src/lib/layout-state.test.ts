import { describe, expect, test } from "bun:test";
import { closeDetailPanel, openDetailPanel, shouldShowExplorer, type DetailPanelState } from "./layout-state";

describe("layout state", () => {
  test("ignores selected messages when opening the detail panel", () => {
    const current: DetailPanelState = {
      isOpen: false,
      itemId: null,
      kind: null
    };

    expect(openDetailPanel(current, { kind: "message", itemId: "msg_1" })).toEqual({
      isOpen: false,
      itemId: null,
      kind: null
    });
  });

  test("switches the detail panel focus when a different issue is selected", () => {
    const current: DetailPanelState = {
      isOpen: true,
      itemId: "msg_1",
      kind: "message"
    };

    expect(openDetailPanel(current, { kind: "issue", itemId: "iss_1" })).toEqual({
      isOpen: true,
      itemId: "iss_1",
      kind: "issue"
    });
  });

  test("closes the detail panel and clears the selected item", () => {
    const current: DetailPanelState = {
      isOpen: true,
      itemId: "msg_1",
      kind: "message"
    };

    expect(closeDetailPanel(current)).toEqual({
      isOpen: false,
      itemId: null,
      kind: null
    });
  });

  test("keeps the explorer visible for runtime pages and hides it only for kanban", () => {
    expect(shouldShowExplorer(true, "runtimes")).toBe(true);
    expect(shouldShowExplorer(true, "agents")).toBe(true);
    expect(shouldShowExplorer(true, "chat")).toBe(true);
    expect(shouldShowExplorer(true, "settings")).toBe(true);
    expect(shouldShowExplorer(true, "kanban")).toBe(false);
    expect(shouldShowExplorer(false, "runtimes")).toBe(false);
  });
});
