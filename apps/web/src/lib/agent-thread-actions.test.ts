import { describe, expect, test } from "bun:test";
import { TEST_ORG_ID, type WorkspaceBootstrapPayload } from "@workpilot/shared";
import type { ShellState } from "./shell-state";
import {
  applyAgentDelete,
  applyAgentLifecycleChange,
  applyAgentRestartOption,
  getAgentLifecycleState,
  type AgentLifecycleState
} from "./agent-thread-actions";

const workspace: WorkspaceBootstrapPayload = {
  organization: { id: TEST_ORG_ID },
  channels: [
    { id: "chn_general", type: "group", name: "all" },
    { id: "dir_admin_coder", type: "direct", name: "Ada x Coder" }
  ],
  runtimes: [{ id: "rtm_demo", name: "datacenter", status: "online" }],
  agents: [
    {
      id: "agt_coder",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes code.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      status: "running"
    }
  ],
  agentActivities: [],
  agentRunLogs: [],
  messages: [
    {
      id: "msg_a",
      channelId: "dir_admin_coder",
      content: "Please fix the failing test.",
      attachments: [],
      senderId: "usr_admin",
      senderType: "user",
      createdAt: "2025-01-01T00:00:00.000Z"
    },
    {
      id: "msg_b",
      channelId: "dir_admin_coder",
      content: "Working on it.",
      attachments: [],
      senderId: "agt_coder",
      senderType: "agent",
      createdAt: "2025-01-01T00:01:00.000Z"
    }
  ],
  issueActivities: [],
  issues: [
    {
      id: "iss_a",
      title: "Fix failing test",
      description: "",
      status: "in_progress",
      assigneeId: "agt_coder",
      creatorId: "usr_admin",
      priority: "medium",
      dueDate: null,
      project: null,
      sourceChannelId: "dir_admin_coder",
      discussionChannelId: "ich_issue_a",
      createdAt: "2025-01-01T00:02:00.000Z",
      updatedAt: "2025-01-01T00:02:00.000Z"
    }
  ]
};

const shellState: ShellState = {
  workspaceId: TEST_ORG_ID,
  primaryView: "chat",
  activeTarget: {
    kind: "agent",
    id: "agt_coder"
  },
  detailOpen: false
};

describe("agent thread actions", () => {
  test("defaults agents to running when no local override exists", () => {
    expect(getAgentLifecycleState("agt_coder", {})).toBe("running");
  });

  test("applies a stop/start lifecycle override", () => {
    let lifecycleById: Record<string, AgentLifecycleState> = {};

    lifecycleById = applyAgentLifecycleChange(lifecycleById, "agt_coder", "stopped");
    expect(getAgentLifecycleState("agt_coder", lifecycleById)).toBe("stopped");

    lifecycleById = applyAgentLifecycleChange(lifecycleById, "agt_coder", "running");
    expect(getAgentLifecycleState("agt_coder", lifecycleById)).toBe("running");
  });

  test("reset memory keeps the agent definition and marks the lifecycle running", () => {
    const result = applyAgentRestartOption({
      workspace,
      lifecycleById: { agt_coder: "stopped" },
      agentId: "agt_coder",
      channelId: "dir_admin_coder",
      option: "reset_memory"
    });

    expect(result.workspace.agents).toHaveLength(1);
    expect(result.workspace.messages).toHaveLength(workspace.messages.length);
    expect(result.workspace.issues).toHaveLength(workspace.issues.length);
    expect(result.lifecycleById.agt_coder).toBe("running");
  });

  test("deleting an active agent removes it and routes back to the default channel", () => {
    const result = applyAgentDelete({
      workspace,
      shellState,
      agentId: "agt_coder",
      lifecycleById: {
        agt_coder: "stopped"
      }
    });

    expect(result.workspace.agents).toHaveLength(0);
    expect(result.shellState.activeTarget).toEqual({
      kind: "channel",
      id: "chn_general"
    });
    expect(result.lifecycleById).toEqual({});
  });
});
