import { describe, expect, test } from "bun:test";
import { getAgentWorkspaceLayoutClasses, getAppShellGridClass, getChatPanelLayoutClasses } from "./app-shell-layout";

describe("app shell layout", () => {
  test("keeps the shell body clipped to the viewport instead of scrolling the whole page", () => {
    const className = getAppShellGridClass({
      detailOpen: false,
      explorerVisible: true
    });

    expect(className).toContain("flex-1");
    expect(className).toContain("min-h-0");
    expect(className).not.toContain("h-full");
  });

  test("locks chat chrome while keeping the message list as the only scrolling region", () => {
    const classNames = getChatPanelLayoutClasses();

    expect(classNames.shell).toContain("h-full");
    expect(classNames.shell).toContain("min-h-0");
    expect(classNames.shell).toContain("overflow-hidden");
    expect(classNames.topChrome).toContain("sticky");
    expect(classNames.topChrome).toContain("top-0");
    expect(classNames.header).toContain("shrink-0");
    expect(classNames.tabs).toContain("shrink-0");
    expect(classNames.composer).toContain("sticky");
    expect(classNames.composer).toContain("bottom-0");
    expect(classNames.composer).toContain("shrink-0");
    expect(classNames.content).toContain("flex-1");
    expect(classNames.content).toContain("min-h-0");
    expect(classNames.content).toContain("overflow-hidden");
    expect(classNames.scroller).toContain("overflow-y-auto");
    expect(classNames.scroller).toContain("flex-1");
  });

  test("uses internal scrolling for agent workspace chat mode instead of page scrolling", () => {
    const classNames = getAgentWorkspaceLayoutClasses("chat");

    expect(classNames.viewport).toContain("overflow-hidden");
    expect(classNames.viewport).not.toContain("overflow-y-auto");
    expect(classNames.content).toContain("h-full");
    expect(classNames.content).toContain("min-h-0");
    expect(classNames.chatPanel).toContain("flex-1");
    expect(classNames.chatPanel).toContain("min-h-0");
    expect(classNames.chatPanel).toContain("overflow-hidden");
  });
});
