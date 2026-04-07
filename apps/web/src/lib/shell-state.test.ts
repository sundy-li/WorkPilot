import { describe, expect, test } from "bun:test";
import { TEST_ORG_ID, type ChannelSummary } from "@workpilot/shared";
import {
  createInitialShellState,
  getChannelDisplayName,
  reconcileInvalidActiveTarget,
  selectConversationTarget,
  selectPrimaryView,
  selectWorkspace
} from "./shell-state";

const channels: ChannelSummary[] = [
  {
    id: "chn_general",
    type: "group",
    name: "General Ops"
  },
  {
    id: "dir_admin_ops",
    type: "direct",
    name: "Ada x Ops Bot"
  }
];

describe("shell state", () => {
  test("defaults the chat surface to #all with detail closed", () => {
    expect(createInitialShellState(channels)).toEqual({
      activeTarget: {
        id: "chn_general",
        kind: "channel"
      },
      detailOpen: false,
      primaryView: "chat",
      workspaceId: ""
    });
    expect(getChannelDisplayName(channels[0])).toBe("all");
  });

  test("switching to an agent conversation closes detail and stays in chat", () => {
    const current = {
      activeTarget: {
        id: "chn_general",
        kind: "channel" as const
      },
      detailOpen: true,
      primaryView: "chat" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(selectConversationTarget(current, { kind: "agent", id: "agt_seed" })).toEqual({
      activeTarget: {
        id: "agt_seed",
        kind: "agent"
      },
      detailOpen: false,
      primaryView: "chat",
      workspaceId: TEST_ORG_ID
    });
  });

  test("switching to runtimes view closes detail", () => {
    const current = {
      activeTarget: {
        id: "agt_seed",
        kind: "agent" as const
      },
      detailOpen: true,
      primaryView: "chat" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(selectPrimaryView(current, "runtimes")).toEqual({
      activeTarget: {
        id: "agt_seed",
        kind: "agent"
      },
      detailOpen: false,
      primaryView: "runtimes",
      workspaceId: TEST_ORG_ID
    });
  });

  test("switching to agents view closes detail", () => {
    const current = {
      activeTarget: {
        id: "agt_seed",
        kind: "agent" as const
      },
      detailOpen: true,
      primaryView: "chat" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(selectPrimaryView(current, "agents")).toEqual({
      activeTarget: {
        id: "agt_seed",
        kind: "agent"
      },
      detailOpen: false,
      primaryView: "agents",
      workspaceId: TEST_ORG_ID
    });
  });

  test("switching to kanban view closes detail", () => {
    const current = {
      activeTarget: {
        id: "chn_general",
        kind: "channel" as const
      },
      detailOpen: true,
      primaryView: "chat" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(selectPrimaryView(current, "kanban")).toEqual({
      activeTarget: {
        id: "chn_general",
        kind: "channel"
      },
      detailOpen: false,
      primaryView: "kanban",
      workspaceId: TEST_ORG_ID
    });
  });

  test("switching to settings view closes detail and keeps the current target", () => {
    const current = {
      activeTarget: {
        id: "chn_general",
        kind: "channel" as const
      },
      detailOpen: true,
      primaryView: "chat" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(selectPrimaryView(current, "settings")).toEqual({
      activeTarget: {
        id: "chn_general",
        kind: "channel"
      },
      detailOpen: false,
      primaryView: "settings",
      workspaceId: TEST_ORG_ID
    });
  });

  test("switching workspace resets the surface to the default channel", () => {
    const current = {
      activeTarget: {
        id: "agt_seed",
        kind: "agent" as const
      },
      detailOpen: true,
      primaryView: "runtimes" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(selectWorkspace(current, "org_ops_lab", channels)).toEqual({
      activeTarget: {
        id: "chn_general",
        kind: "channel"
      },
      detailOpen: false,
      primaryView: "chat",
      workspaceId: "org_ops_lab"
    });
  });

  test("keeps runtimes view when the active chat target is missing", () => {
    const current = {
      activeTarget: {
        id: "chn_missing",
        kind: "channel" as const
      },
      detailOpen: false,
      primaryView: "runtimes" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(reconcileInvalidActiveTarget(current, channels, [])).toEqual(current);
  });

  test("resets to the default chat target only when chat view has an invalid target", () => {
    const current = {
      activeTarget: {
        id: "chn_missing",
        kind: "channel" as const
      },
      detailOpen: false,
      primaryView: "chat" as const,
      workspaceId: TEST_ORG_ID
    };

    expect(reconcileInvalidActiveTarget(current, channels, [])).toEqual({
      activeTarget: {
        id: "chn_general",
        kind: "channel"
      },
      detailOpen: false,
      primaryView: "chat",
      workspaceId: TEST_ORG_ID
    });
  });
});
