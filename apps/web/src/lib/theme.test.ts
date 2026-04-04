import { describe, expect, test } from "bun:test";
import * as theme from "./theme";

describe("theme tokens", () => {
  test("gives agents a stronger accent than human senders", () => {
    expect(theme.getActorTone("agent")).toBe("agent");
    expect(theme.getActorTone("user")).toBe("human");
    expect(theme.getActorTone("system")).toBe("system");
  });

  test("maps runtime states into semantic status tones", () => {
    expect(theme.getRuntimeStatusTone("online")).toBe("success");
    expect(theme.getRuntimeStatusTone("offline")).toBe("warning");
    expect(theme.getRuntimeStatusTone("unhealthy")).toBe("warning");
    expect(theme.getRuntimeStatusTone("revoked")).toBe("danger");
    expect(theme.getRuntimeStatusTone("pending")).toBe("neutral");
  });

  test("maps active issue states into readable workflow tones", () => {
    expect(theme.getIssueStatusTone("backlog")).toBe("neutral");
    expect(theme.getIssueStatusTone("in_progress")).toBe("warning");
    expect(theme.getIssueStatusTone("in_review")).toBe("warning");
    expect(theme.getIssueStatusTone("done")).toBe("success");
    expect(theme.getIssueStatusTone("todo")).toBe("neutral");
  });

  test("elevates agent messages above human messages", () => {
    const getMessageSurfaceClass = (theme as typeof theme & {
      getMessageSurfaceClass?: (tone: "human" | "agent" | "system", isSelected: boolean) => string;
    }).getMessageSurfaceClass;

    expect(getMessageSurfaceClass?.("human", false)).toContain("message-surface--frame-on-hover");
    expect(getMessageSurfaceClass?.("agent", false)).toContain("message-surface--agent");
    expect(getMessageSurfaceClass?.("agent", true)).toContain("message-surface--idle");
    expect(getMessageSurfaceClass?.("agent", true)).not.toContain("message-surface--selected");
    expect(getMessageSurfaceClass?.("human", false)).toContain("message-surface--human");
  });

  test("makes active sidebar items visually dominant", () => {
    const getSidebarItemClass = (theme as typeof theme & {
      getSidebarItemClass?: (kind: "channel" | "agent", isActive: boolean) => string;
    }).getSidebarItemClass;

    expect(getSidebarItemClass?.("channel", true)).toContain("sidebar-item--active");
    expect(getSidebarItemClass?.("channel", false)).toContain("sidebar-item--idle");
    expect(getSidebarItemClass?.("agent", true)).toContain("sidebar-item--agent");
  });

  test("gives running timeline steps the strongest emphasis", () => {
    const getTimelineStepCardClass = (theme as typeof theme & {
      getTimelineStepCardClass?: (state: "pending" | "running" | "done") => string;
    }).getTimelineStepCardClass;

    expect(getTimelineStepCardClass?.("running")).toContain("timeline-step--running");
    expect(getTimelineStepCardClass?.("done")).toContain("timeline-step--done");
    expect(getTimelineStepCardClass?.("pending")).toContain("timeline-step--pending");
  });
});
