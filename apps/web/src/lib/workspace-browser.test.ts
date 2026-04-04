import { describe, expect, test } from "bun:test";
import {
  createInitialAgentWorkspaceBrowserState,
  createInitialRuntimeWorkspaceBrowserState,
  selectAgentWorkspaceTarget,
  selectRuntimeWorkspaceTarget,
  setAgentWorkspaceMode
} from "./workspace-browser";

describe("workspace browser", () => {
  test("defaults the agent workspace to chat mode", () => {
    expect(createInitialAgentWorkspaceBrowserState("agt_seed")).toEqual({
      agentId: "agt_seed",
      mode: "chat"
    });
  });

  test("selecting another agent resets the workspace back to chat mode", () => {
    expect(selectAgentWorkspaceTarget("agt_reviewer")).toEqual({
      agentId: "agt_reviewer",
      mode: "chat"
    });
  });

  test("switching the agent workspace mode keeps the current agent", () => {
    expect(
      setAgentWorkspaceMode(
        {
          agentId: "agt_seed",
          mode: "chat"
        },
        "chat"
      )
    ).toEqual({
      agentId: "agt_seed",
      mode: "chat"
    });
  });

  test("runtime workspace stores the selected runtime", () => {
    expect(createInitialRuntimeWorkspaceBrowserState("rtm_seed")).toEqual({
      runtimeId: "rtm_seed"
    });

    expect(selectRuntimeWorkspaceTarget("rtm_datacenter")).toEqual({
      runtimeId: "rtm_datacenter"
    });
  });
});
