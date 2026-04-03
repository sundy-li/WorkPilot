import { describe, expect, test } from "bun:test";
import type { WorkspaceBootstrapPayload } from "@workpilot/shared";
import { resolveConversationChannelId } from "./conversation-channel";

const workspace: WorkspaceBootstrapPayload = {
  organization: { id: "org_demo" },
  channels: [
    { id: "chn_general", type: "group", name: "all" },
    { id: "dir_admin_ops", type: "direct", name: "Ada x Ops" },
    { id: "dir_admin_coding", type: "direct", name: "Ada x coding" }
  ],
  runtimes: [{ id: "rtm_demo", name: "mlmax.local", status: "online" }],
  agents: [
    {
      id: "agt_ops",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_ops",
      name: "Ops",
      description: "Ops agent",
      implementation: "claude",
      model: "claude-sonnet-4.5",
      reasoningEffort: "medium",
      status: "running"
    },
    {
      id: "agt_coding",
      runtimeId: "rtm_demo",
      channelId: "dir_admin_coding",
      name: "coding",
      description: "Coding agent",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      status: "running"
    }
  ],
  messages: [],
  issues: []
};

describe("resolveConversationChannelId", () => {
  test("uses the agent channelId directly for agent conversations", () => {
    expect(
      resolveConversationChannelId(
        {
          kind: "agent",
          id: "agt_coding"
        },
        workspace
      )
    ).toBe("dir_admin_coding");
  });
});
