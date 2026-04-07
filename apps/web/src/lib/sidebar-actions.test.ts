import { describe, expect, test } from "bun:test";
import { TEST_ORG_ID, type WorkspaceBootstrapPayload } from "@workpilot/shared";
import { createInitialShellState } from "./shell-state";
import { openAgentCreationFromRuntimeMenu, openAgentCreationFromSidebar } from "./sidebar-actions";

const workspace: WorkspaceBootstrapPayload = {
  organization: {
    id: TEST_ORG_ID
  },
  channels: [
    {
      id: "chn_general",
      type: "group",
      name: "all"
    }
  ],
  runtimes: [
    {
      id: "rtm_seed",
      name: "Seed Runtime",
      status: "online"
    }
  ],
  agents: [],
  agentActivities: [],
  agentRunLogs: [],
  messages: [],
  issueActivities: [],
  issues: []
};

describe("sidebar actions", () => {
  test("opens the create-agent surface from the agents shortcut inside the runtimes view", () => {
    const shellState = createInitialShellState(workspace.channels);

    expect(openAgentCreationFromSidebar(shellState, workspace.runtimes[0]?.id ?? null)).toEqual({
      primaryView: "runtimes",
      shellState: {
        ...shellState,
        detailOpen: false,
        primaryView: "runtimes"
      },
      runtimeId: "rtm_seed"
    });
  });

  test("opens the create-agent surface from the runtime menu shortcut inside the runtimes view", () => {
    const shellState = createInitialShellState(workspace.channels);

    expect(openAgentCreationFromRuntimeMenu(shellState, workspace.runtimes[0]?.id ?? null)).toEqual({
      primaryView: "runtimes",
      shellState: {
        ...shellState,
        detailOpen: false,
        primaryView: "runtimes"
      },
      runtimeId: "rtm_seed"
    });
  });
});
