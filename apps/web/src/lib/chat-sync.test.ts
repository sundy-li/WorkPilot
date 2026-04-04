import { describe, expect, test } from "bun:test";
import type { WorkspaceBootstrapPayload } from "@workpilot/shared";
import { mergeChannelMessages, shouldPollCurrentChat } from "./chat-sync";

const workspace: WorkspaceBootstrapPayload = {
  organization: { id: "org_demo" },
  channels: [
    { id: "chn_general", type: "group", name: "all" },
    { id: "dir_admin_coder", type: "direct", name: "Ada x Coder" }
  ],
  runtimes: [{ id: "rtm_seed", name: "Seed Runtime", status: "online" }],
  agents: [
    {
      id: "agt_coder",
      runtimeId: "rtm_seed",
      channelId: "dir_admin_coder",
      name: "Coder",
      description: "Writes code.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    }
  ],
  agentActivities: [],
  messages: [
    {
      id: "msg_1",
      channelId: "dir_admin_coder",
      content: "Initial request",
      attachments: [],
      senderId: "usr_admin",
      senderType: "user",
      createdAt: "2025-04-03T22:19:08.000Z"
    },
    {
      id: "msg_other",
      channelId: "chn_general",
      content: "Keep me",
      attachments: [],
      senderId: "usr_admin",
      senderType: "user",
      createdAt: "2025-04-03T22:18:08.000Z"
    }
  ],
  issues: []
};

describe("chat sync", () => {
  test("replaces the active channel history and keeps messages from other channels intact", () => {
    const nextWorkspace = mergeChannelMessages(workspace, "dir_admin_coder", [
      workspace.messages[0]!,
      {
        id: "msg_2",
        channelId: "dir_admin_coder",
        content: "Agent reply",
        attachments: [],
        senderId: "agt_coder",
        senderType: "agent",
        createdAt: "2025-04-03T22:20:08.000Z"
      }
    ]);

    expect(nextWorkspace.messages.map((message) => message.id)).toEqual(["msg_other", "msg_1", "msg_2"]);
  });

  test("stops polling an idle agent thread when there is no newer user input", () => {
    expect(
      shouldPollCurrentChat({
        targetKind: "agent",
        activeAgentStatus: "idle",
        lastUserMessageAt: "2025-04-03T22:19:08.000Z",
        lastAgentMessageAt: "2025-04-03T22:20:08.000Z"
      })
    ).toBe(false);
  });

  test("keeps polling an idle agent thread after a newer user message arrives", () => {
    expect(
      shouldPollCurrentChat({
        targetKind: "agent",
        activeAgentStatus: "idle",
        lastUserMessageAt: "2025-04-03T22:21:08.000Z",
        lastAgentMessageAt: "2025-04-03T22:20:08.000Z"
      })
    ).toBe(true);
  });
});
